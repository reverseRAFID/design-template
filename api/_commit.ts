/**
 * The pure half of the save endpoint: everything that can be decided without a
 * network call, so it can be unit-tested (tests/manifest-endpoint.test.ts).
 *
 * `api/_commit.ts` — the leading underscore is what tells Vercel this file is a
 * helper and not a route of its own.
 */

import { timingSafeEqual } from 'node:crypto';

/** The one file this endpoint is allowed to touch. Never taken from the request. */
export const MANIFEST_FILE = 'public/brand/sponsors/manifest.json';

/** A board is a few KB; anything approaching this is not one. */
export const MAX_BYTES = 256 * 1024;

export const KEY_HEADER = 'x-mt-save-key';

export interface Config {
  token: string;
  repo: string;
  branch: string;
  key: string;
}

/**
 * Prefixed `MT_` so nothing collides with what the platform injects, and so the
 * Vercel dashboard shows the four of them together.
 */
export function readConfig(env: Record<string, string | undefined>): Config | null {
  const token = env.MT_GITHUB_TOKEN?.trim();
  const repo = env.MT_GITHUB_REPO?.trim();
  const key = env.MT_SAVE_KEY?.trim();
  // Missing config is not an error: it is a site that has not enabled saving, and
  // the app falls back to downloading the file (docs/DECISIONS.md D33).
  if (!token || !repo || !key) return null;
  return { token, repo, branch: env.MT_GITHUB_BRANCH?.trim() || 'main', key };
}

/** Constant-time, and length-safe: comparing unequal lengths throws otherwise. */
export function authorised(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface Rejection {
  status: number;
  message: string;
}

/**
 * A body is acceptable only if it is recognisably a sponsor manifest. The
 * endpoint commits to the repo, so "parses as JSON" is nowhere near enough — a
 * valid-JSON-but-wrong-shape body would land in git and break every client.
 */
export function parseManifest(body: string): { manifest: unknown } | Rejection {
  if (body.length > MAX_BYTES) return { status: 413, message: 'too large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, message: 'invalid json' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 400, message: 'not a sponsor manifest' };
  }
  const sponsors = (parsed as { sponsors?: unknown }).sponsors;
  if (!Array.isArray(sponsors) || sponsors.length === 0) {
    return { status: 400, message: 'not a sponsor manifest' };
  }
  const shaped = sponsors.every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as { slug?: unknown }).slug === 'string' &&
      typeof (s as { tier?: unknown }).tier === 'number' &&
      typeof (s as { order?: unknown }).order === 'number',
  );
  if (!shaped) return { status: 400, message: 'sponsor entries are missing slug/tier/order' };

  return { manifest: parsed };
}

export function isRejection(value: { manifest: unknown } | Rejection): value is Rejection {
  return 'status' in value;
}

/** Formatted exactly as the repo stores it, so a save is a no-op diff when nothing moved. */
export function serialize(manifest: unknown): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function contentsUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/contents/${MANIFEST_FILE}`;
}

export interface CommitBody {
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

/**
 * `sha` identifies the blob being replaced. GitHub rejects the write without it
 * when the file exists, which is the concurrency guard: two people saving at once
 * means the second gets a 409 rather than silently clobbering the first.
 */
export function commitBody(json: string, branch: string, sha: string | undefined, who: string): CommitBody {
  return {
    message: `chore(sponsors): update board from the brand kit\n\nSaved by ${who}.`,
    content: Buffer.from(json, 'utf8').toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  };
}

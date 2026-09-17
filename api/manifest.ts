/**
 * POST /api/manifest — save the sponsor board to the repo.
 *
 * The board lives in `public/brand/sponsors/manifest.json`, in git (D30). On a
 * static host there is nowhere to write it, so SAVE POSITIONS could only download
 * the file and ask someone to commit it by hand. This function closes that loop:
 * it commits the file through the GitHub API, Vercel redeploys, and the board
 * follows the project rather than the browser it was arranged in (D33).
 *
 * The repo stays the single source of truth. Nothing is stored here.
 *
 * Reached as `/__manifest` too — vercel.json rewrites it — so the app has one
 * endpoint whether it is talking to the dev server or to this.
 *
 * **This file imports nothing, deliberately.** The package is `"type": "module"`,
 * so at runtime an extensionless relative import — `./_commit` — cannot be
 * resolved, and the whole function dies with ERR_MODULE_NOT_FOUND before it
 * handles a single request. Nothing catches that at build time. No imports, no
 * resolution, no crash; and with no Node builtins either, the runtime it lands on
 * stops mattering. See docs/DECISIONS.md D35.
 */

// ---------------------------------------------------------------------------
// The decisions that can be made without a network call. Exported for
// tests/manifest-endpoint.test.ts.
// ---------------------------------------------------------------------------

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

/**
 * Constant time over the bytes, so a wrong key cannot be found one character at a
 * time. Unequal lengths return early — that leaks the length of the secret and
 * nothing else, which is the standard trade.
 */
export function authorised(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
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

/** Base64 of the UTF-8 bytes, without Buffer — `btoa` alone mangles anything non-ASCII. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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
export function commitBody(
  json: string,
  branch: string,
  sha: string | undefined,
  who: string,
): CommitBody {
  return {
    message: `chore(sponsors): update board from the brand kit\n\nSaved by ${who}.`,
    content: toBase64(json),
    branch,
    ...(sha ? { sha } : {}),
  };
}

// ---------------------------------------------------------------------------
// The handler.
//
// The signature is Node's `(req, res)`. Named `GET`/`POST` exports taking a
// `Request` are a Next.js convention; a plain file in `api/` is invoked this way,
// and the wrong shape type-checks, deploys, and then fails on first request.
// ---------------------------------------------------------------------------

/** The slice of Node's req/res this uses — typed here so the file needs no deps. */
interface ApiRequest extends AsyncIterable<Uint8Array> {
  method?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function send(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function header(req: ApiRequest, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * The platform may hand over a parsed object, a string, bytes, or nothing at all
 * and leave the stream to be read. Normalise all four to the raw text, since that
 * is what gets committed.
 */
async function readBody(req: ApiRequest): Promise<string> {
  const { body } = req;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body && typeof body === 'object') return JSON.stringify(body);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    chunks.push(bytes);
    total += bytes.length;
    // Refuse a runaway body before it is all in memory.
    if (total > MAX_BYTES) break;
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'POST the manifest here' });
    return;
  }

  const config = readConfig(process.env);
  // Saving is not configured on this deployment: say so plainly and let the app
  // fall back to downloading the file.
  if (!config) {
    send(res, 503, { error: 'saving is not configured on this deployment' });
    return;
  }

  if (!authorised(header(req, KEY_HEADER), config.key)) {
    send(res, 401, { error: 'save key rejected' });
    return;
  }

  const parsed = parseManifest(await readBody(req));
  if (isRejection(parsed)) {
    send(res, parsed.status, { error: parsed.message });
    return;
  }

  const url = contentsUrl(config.repo);
  const auth = {
    authorization: `Bearer ${config.token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'mongoltori-brandkit',
  };

  // The blob being replaced. A 404 means the file is not in the repo yet, which is
  // a create rather than an update — every other failure is fatal, because
  // committing without the sha would overwrite whatever is there.
  let sha: string | undefined;
  const head = await fetch(`${url}?ref=${encodeURIComponent(config.branch)}`, { headers: auth });
  if (head.ok) {
    const current: unknown = await head.json();
    const found = (current as { sha?: unknown }).sha;
    if (typeof found === 'string') sha = found;
  } else if (head.status !== 404) {
    send(res, 502, { error: `github said ${head.status} reading the current file` });
    return;
  }

  const who = header(req, 'x-mt-save-by')?.slice(0, 60) || 'the brand kit';
  const write = await fetch(url, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(commitBody(serialize(parsed.manifest), config.branch, sha, who)),
  });

  if (!write.ok) {
    // 409 is the one worth naming: someone else saved between our read and write.
    if (write.status === 409) {
      send(res, 409, {
        error: 'the board changed in the repo while you were saving — reload and try again',
      });
      return;
    }
    send(res, 502, { error: `github said ${write.status}` });
    return;
  }

  const result: unknown = await write.json();
  const commit = (result as { commit?: { sha?: unknown } }).commit?.sha;

  send(res, 200, {
    written: MANIFEST_FILE,
    commit: typeof commit === 'string' ? commit.slice(0, 7) : null,
  });
}

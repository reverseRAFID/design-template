/**
 * Save the sponsor manifest back to where it belongs: the repo.
 *
 * The board's tiers and order live in `public/brand/sponsors/manifest.json`, so an
 * arrangement is a source change. Three ways to land it, depending on where the
 * app is running (docs/DECISIONS.md D30, D33):
 *
 * - **`npm run dev`** — POSTed to a dev-server endpoint that writes the file
 *   directly. Commit it and every teammate, every browser, gets the same board.
 * - **Deployed on Vercel** — the same POST reaches a serverless function that
 *   commits the file through the GitHub API. Nothing to download, nothing to
 *   copy by hand; the site redeploys itself a minute later.
 * - **Any other static host** — nowhere to write, so the file is downloaded and
 *   the team drops it in and commits.
 *
 * Either way the browser never becomes the store of record.
 */

import type { SponsorManifest } from '@/assets/manifest';
import { downloadBlob } from '@/lib/download';
import { KEY_HEADER, readSaveKey } from '@/lib/save-key';

/**
 * One endpoint for both backends: the dev server registers it as middleware, and
 * vercel.json rewrites it to `/api/manifest`.
 */
const ENDPOINT = '/__manifest';

export type SaveOutcome = 'written' | 'committed' | 'downloaded';

/**
 * A save that was understood and refused — a wrong key, or someone else saving
 * first. Distinct from "there is no server here", which is not an error and
 * falls back to a download.
 */
export class SaveRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveRefused';
  }
}

export function serializeManifest(manifest: SponsorManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** The endpoint's own acknowledgement, or null for anything else. */
async function acknowledgement(response: Response): Promise<{ commit?: unknown } | null> {
  // A 200 is not proof the write happened: a static host with an SPA fallback
  // answers any path with index.html and a 200 (the same trap as D28). Only a
  // JSON body naming the file it wrote counts.
  if (!response.ok) return null;
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  const ack: unknown = await response.json();
  if (typeof ack !== 'object' || ack === null || !('written' in ack)) return null;
  return ack as { commit?: unknown };
}

async function refusalMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string' && error) return error;
  } catch {
    /* Not JSON. Use the fallback. */
  }
  return fallback;
}

/**
 * Writes through whichever backend is listening, otherwise downloads.
 * Throws only for a refusal the user can act on.
 */
export async function saveManifest(manifest: SponsorManifest): Promise<SaveOutcome> {
  const body = serializeManifest(manifest);
  const key = readSaveKey();

  let response: Response | null = null;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { [KEY_HEADER]: key } : {}),
      },
      body,
    });
  } catch {
    // No server at all. That is the plain static host, and it is not an error.
  }

  if (response) {
    if (response.status === 401) {
      throw new SaveRefused(
        key
          ? await refusalMessage(response, 'save key rejected')
          : 'This site needs a save key before it can commit the board.',
      );
    }
    if (response.status === 409) {
      throw new SaveRefused(await refusalMessage(response, 'the board changed in the repo'));
    }

    const ack = await acknowledgement(response);
    // `commit` is the function's fingerprint; the dev server does not send one.
    if (ack) return typeof ack.commit === 'string' ? 'committed' : 'written';
  }

  downloadBlob(new Blob([body], { type: 'application/json' }), 'manifest.json');
  return 'downloaded';
}

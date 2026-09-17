/**
 * Save the sponsor manifest back to where it belongs: the repo.
 *
 * The board's tiers and order live in `public/brand/sponsors/manifest.json`, so an
 * arrangement is a source change. Two ways to land it, depending on where the app
 * is running (docs/DECISIONS.md D30):
 *
 * - **`npm run dev`** — POSTed to a dev-server endpoint that writes the file
 *   directly. Commit it and every teammate, every browser, gets the same board.
 * - **The deployed site** — static, with nowhere to write, so the file is
 *   downloaded instead and the team drops it in and commits.
 *
 * Either way the browser never becomes the store of record.
 */

import type { SponsorManifest } from '@/assets/manifest';
import { downloadBlob } from '@/lib/download';

/** Matches the endpoint registered by `manifestWriter()` in vite.config.ts. */
const ENDPOINT = '/__manifest';

export type SaveOutcome = 'written' | 'downloaded';

export function serializeManifest(manifest: SponsorManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Writes through the dev server when one is listening, otherwise downloads.
 * Never throws for the "no dev server" case — that is the normal production path.
 */
export async function saveManifest(manifest: SponsorManifest): Promise<SaveOutcome> {
  const body = serializeManifest(manifest);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    // A 200 is not proof the write happened: a static host with an SPA fallback
    // answers any path with index.html and a 200 (the same trap as D28). Only the
    // dev plugin's own acknowledgement counts.
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const ack: unknown = await response.json();
      if (typeof ack === 'object' && ack !== null && 'written' in ack) return 'written';
    }
  } catch {
    // No dev server (or it refused, or the body was not JSON). Fall through.
  }

  downloadBlob(new Blob([body], { type: 'application/json' }), 'manifest.json');
  return 'downloaded';
}

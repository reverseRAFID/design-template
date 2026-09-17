/**
 * The key that lets this browser commit the sponsor board.
 *
 * A deliberate exception to "nothing about the board is stored in the browser"
 * (D30): this is not the board, it is permission to write it. The arrangement
 * still lives only in `manifest.json` — the key just avoids retyping a secret on
 * every save. It is a shared team secret, not a personal credential, and
 * FORGET KEY removes it.
 */

const STORAGE_KEY = 'mt.save-key';

/** Header the save endpoint reads. Must match KEY_HEADER in api/_commit.ts. */
export const KEY_HEADER = 'x-mt-save-key';

export function readSaveKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Private mode, or storage blocked entirely. Saving then downloads instead.
    return '';
  }
}

export function writeSaveKey(key: string): void {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to do: the key simply will not be remembered. */
  }
}

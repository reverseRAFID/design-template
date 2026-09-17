/**
 * Typed localStorage wrapper for the editor's remembered settings.
 *
 * Two hard requirements (docs/01-PRD.md § F6): it must never throw — private
 * browsing, blocked cookies and quota all surface as exceptions — and a corrupt
 * entry must not brick the app, so every field is validated on read and anything
 * unrecognised is simply dropped back to the caller's default.
 */

import { isPresetId } from '@/engine/presets';
import type { PresetId } from '@/engine/types';

export const PERSIST_KEY = 'mt-brandkit:v1';

export interface PersistedState {
  presetId: PresetId;
  /**
   * Scene.toneOverridden. The tone value itself is deliberately not stored —
   * the PRD lists "tone override" only, and a fresh session re-detects.
   */
  toneOverride: boolean;
  frame: boolean;
  scrim: number;
  /**
   * Optional: withheld until the app has actually seeded a selection from the
   * manifest, so a not-yet-loaded empty array is never mistaken on the next boot
   * for a deliberate "no sponsors".
   */
  selectedSponsors?: string[] | undefined;
  label: string;
}

let warned = false;

/** One console line per session: a blocked storage is a condition, not an error stream. */
function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[mt-brandkit] settings will not persist (${PERSIST_KEY} unavailable)`, err);
}

/** Touching `localStorage` itself throws under some privacy settings, hence the try. */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (err) {
    warnOnce(err);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readScrim(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function readSlugs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slugs = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return [...new Set(slugs)];
}

/**
 * Returns only the fields that survived validation, so callers can spread it
 * over their own defaults. An absent key and a rejected value are the same thing.
 */
export function loadPersisted(): Partial<PersistedState> {
  const store = storage();
  if (!store) return {};

  let parsed: unknown;
  try {
    const raw = store.getItem(PERSIST_KEY);
    if (raw === null) return {};
    parsed = JSON.parse(raw);
  } catch (err) {
    warnOnce(err);
    return {};
  }

  if (!isRecord(parsed)) return {};

  const out: Partial<PersistedState> = {};

  if (isPresetId(parsed['presetId'])) out.presetId = parsed['presetId'];

  const toneOverride = readBoolean(parsed['toneOverride']);
  if (toneOverride !== undefined) out.toneOverride = toneOverride;

  const frame = readBoolean(parsed['frame']);
  if (frame !== undefined) out.frame = frame;

  const scrim = readScrim(parsed['scrim']);
  if (scrim !== undefined) out.scrim = scrim;

  const selectedSponsors = readSlugs(parsed['selectedSponsors']);
  if (selectedSponsors !== undefined) out.selectedSponsors = selectedSponsors;

  if (typeof parsed['label'] === 'string') out.label = parsed['label'];

  return out;
}

export function savePersisted(state: PersistedState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PERSIST_KEY, JSON.stringify(state));
  } catch (err) {
    // Quota or a private-mode write refusal. Losing the settings is acceptable;
    // interrupting an export is not.
    warnOnce(err);
  }
}

export function clearPersisted(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PERSIST_KEY);
  } catch (err) {
    warnOnce(err);
  }
}

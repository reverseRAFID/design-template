/**
 * Export filenames (docs/01-PRD.md § F5): mongoltori_{preset}_{YYYYMMDD}_{HHmm}.{ext}
 *
 * Local time on purpose — the timestamp is there so a team member can tell two
 * exports of the same preset apart at a glance, and they read it in their own
 * clock, not UTC.
 */

import type { PresetId } from '@/engine/types';

function pad(value: number, width: number): string {
  return String(Math.trunc(Math.abs(value))).padStart(width, '0');
}

export interface FilenameOptions {
  /** Inserted before the timestamp, e.g. 'overlay' or a source photo's name. */
  suffix?: string | undefined;
  now?: Date | undefined;
}

/** A caller-supplied Invalid Date would produce "NaNNaNNaN"; fall back instead. */
function safeDate(now?: Date): Date {
  if (!now || Number.isNaN(now.getTime())) return new Date();
  return now;
}

function stamp(when: Date): string {
  const date = `${pad(when.getFullYear(), 4)}${pad(when.getMonth() + 1, 2)}${pad(when.getDate(), 2)}`;
  const time = `${pad(when.getHours(), 2)}${pad(when.getMinutes(), 2)}`;
  return `${date}_${time}`;
}

/** Filesystem-safe fragment: a photo's name reaches this straight from the OS. */
export function slugifyForFilename(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function exportFilename(
  presetId: PresetId,
  ext: 'png' | 'jpg',
  options: FilenameOptions = {},
): string {
  const when = safeDate(options.now);
  const suffix = options.suffix ? `_${slugifyForFilename(options.suffix)}` : '';
  return `mongoltori_${presetId}${suffix}_${stamp(when)}.${ext}`;
}

/** Name for a batch/multi-preset archive. */
export function zipFilename(kind: string, now?: Date): string {
  return `mongoltori_${slugifyForFilename(kind)}_${stamp(safeDate(now))}.zip`;
}

/**
 * Today as MM.DD.YYYY, for the export date on the banner's HUD line.
 *
 * The Design System's example label shows DD.MM (`… · 16.09.2026`); the team asked
 * for month-first, so that is what ships. One place to change it if that flips.
 */
export function todayLabelDate(now?: Date): string {
  const when = safeDate(now);
  return `${pad(when.getMonth() + 1, 2)}.${pad(when.getDate(), 2)}.${pad(when.getFullYear(), 4)}`;
}

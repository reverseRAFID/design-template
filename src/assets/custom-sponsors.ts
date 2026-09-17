/**
 * Sponsor logos uploaded through the app, held in the browser.
 *
 * This is a stopgap, deliberately, and the UI says so: the permanent home for a
 * sponsor logo is `img/partners/<slug>.svg` plus a row in the importer's table
 * (docs/DECISIONS.md D17). An upload here lets whoever is posting at an event use
 * a logo that arrived by email an hour ago, without waiting on a deploy.
 *
 * Consequences of living in `localStorage`, all of them intentional:
 *
 * - It is per-browser. It does not reach teammates and it does not reach the repo.
 * - There is a hard size budget. Data URLs are ~33% larger than the file, and
 *   `localStorage` gives us around 5 MB for everything including editor settings.
 * - Clearing site data loses it.
 */

import { z } from 'zod';
import type { SponsorMeta } from '@/engine/types';

const KEY = 'mt-brandkit:sponsors:v1';

/** Per-file ceiling, measured on the data URL. ~300 KB of actual file. */
export const MAX_LOGO_BYTES = 400_000;

/** Total ceiling, leaving room for the editor's own persisted settings. */
export const MAX_TOTAL_BYTES = 2_500_000;

export const CUSTOM_EXTS = ['svg', 'png'] as const;
export type CustomExt = (typeof CUSTOM_EXTS)[number];

const ACCEPTED: Record<string, CustomExt> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
};

export interface CustomSponsor {
  slug: string;
  name: string;
  tier: number;
  /** The artwork as a data URL. */
  data: string;
  ext: CustomExt;
}

const CustomSponsorSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  tier: z.number().int().min(1),
  data: z.string().startsWith('data:'),
  ext: z.enum(CUSTOM_EXTS),
});

const StoreSchema = z.array(CustomSponsorSchema);

let warned = false;

function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('[brand-kit] uploaded sponsor logos are unavailable:', err);
}

/** Never throws: a blocked or corrupt store must not stop the app booting. */
export function loadCustomSponsors(): CustomSponsor[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = StoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch (err) {
    warnOnce(err);
    return [];
  }
}

export function saveCustomSponsors(list: CustomSponsor[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (err) {
    // Almost always the quota. The caller has already checked the budget, so
    // this is the belt to that braces.
    warnOnce(err);
    throw new Error('Could not save the logo — the browser’s storage is full.');
  }
}

/** Kebab-case slug from a display name, matching the importer's convention. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function totalBytes(list: readonly CustomSponsor[]): number {
  return list.reduce((sum, entry) => sum + entry.data.length, 0);
}

/**
 * Read a picked file into a data URL, rejecting anything the renderer could not
 * draw or the browser could not store.
 */
export async function readLogoFile(file: File): Promise<{ data: string; ext: CustomExt }> {
  const ext = ACCEPTED[file.type];
  if (!ext) throw new Error('Use an SVG or a PNG — those are what the overlay can draw.');

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  if (!data.startsWith('data:')) throw new Error('Could not read that file.');
  if (data.length > MAX_LOGO_BYTES) {
    throw new Error(
      `That file is too large to keep in the browser (${Math.round(data.length / 1024)} KB). ` +
        'Use an SVG, or add it to img/partners/ instead.',
    );
  }

  return { data, ext };
}

/**
 * Add or replace an entry. Replacing is keyed on slug, so re-uploading a logo for
 * the same sponsor overwrites rather than duplicating.
 */
export function upsertCustomSponsor(
  list: readonly CustomSponsor[],
  entry: CustomSponsor,
): CustomSponsor[] {
  const next = list.filter((existing) => existing.slug !== entry.slug);
  next.push(entry);

  const budget = totalBytes(next);
  if (budget > MAX_TOTAL_BYTES) {
    throw new Error(
      `That would use ${Math.round(budget / 1024)} KB of browser storage, over the ` +
        `${Math.round(MAX_TOTAL_BYTES / 1024)} KB budget. Remove an uploaded logo first.`,
    );
  }
  return next;
}

export function removeCustomSponsor(
  list: readonly CustomSponsor[],
  slug: string,
): CustomSponsor[] {
  return list.filter((entry) => entry.slug !== slug);
}

/**
 * The manifest shape an uploaded sponsor takes. `placeholder` is deliberately
 * true: it is real artwork, but it lives only in this browser, and the header's
 * status tag should keep saying so until it is committed to the repo.
 */
export function toMeta(entry: CustomSponsor, order: number): SponsorMeta {
  return {
    slug: entry.slug,
    name: entry.name,
    tier: entry.tier,
    order,
    variants: ['light', 'dark'],
    ext: entry.ext,
    placeholder: true,
  };
}

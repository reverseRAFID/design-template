/**
 * `public/brand/sponsors/manifest.json`, validated.
 *
 * CLAUDE.md rule 5: sponsors are data, not code. Adding one is a PNG/SVG pair plus
 * a JSON entry — so the JSON is the thing that can break a build with no compiler
 * to catch it, and it gets validated strictly, with errors that name the entry
 * rather than an array index.
 */

import { z } from 'zod';
import type { SponsorMeta, Tone } from '@/engine/types';

const ToneSchema: z.ZodType<Tone> = z.enum(['dark', 'light']);

/** `.strict()` everywhere: a typo'd key is a silently ignored sponsor otherwise. */
const SponsorEntrySchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case (it is a filename)'),
    name: z.string().min(1),
    tier: z.number().int().min(1),
    order: z.number().int().min(0),
    variants: z.array(ToneSchema).min(1),
    /** Extension of the sponsor's colour artwork. */
    ext: z.enum(['svg', 'png']).default('svg'),
    /** Artwork too light to read on the banner; drawn from its ink variant instead. */
    lightArtwork: z.boolean().default(false),
    /** No colour artwork supplied yet. Nothing is drawn; the UI asks for it. */
    missing: z.boolean().default(false),
    /** Absent means real artwork; only stand-ins set it. */
    placeholder: z.boolean().default(false),
    url: z.string().url().optional(),
  })
  .strict();

export const ManifestSchema = z
  .object({
    version: z.number().int().min(1),
    /** Tier number as a string key, because JSON object keys are strings. */
    tiers: z.record(z.string().regex(/^\d+$/, 'tier keys must be integers'), z.string().min(1)),
    sponsors: z.array(SponsorEntrySchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.sponsors.forEach((sponsor, index) => {
      if (seen.has(sponsor.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sponsors', index, 'slug'],
          message: `duplicate slug "${sponsor.slug}"`,
        });
      }
      seen.add(sponsor.slug);

      if (!(String(sponsor.tier) in manifest.tiers)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sponsors', index, 'tier'],
          message: `tier ${sponsor.tier} has no label in "tiers"`,
        });
      }
    });
  });

export type SponsorManifest = z.infer<typeof ManifestSchema>;

/**
 * Fold a dragged arrangement back into the manifest.
 *
 * The manifest's `tier` and `order` ARE the sponsor board — so an arrangement is
 * expressed by rewriting them, not by keeping a parallel copy somewhere else
 * (docs/DECISIONS.md D30). `order` is renumbered from 1 within each tier, so the
 * file stays readable by hand.
 */
export function applyArrangement(
  manifest: SponsorManifest,
  order: readonly string[],
  tiers: Readonly<Record<string, number>>,
): SponsorManifest {
  const rank = new Map(order.map((slug, index) => [slug, index]));

  const placed = [...manifest.sponsors]
    .map((sponsor) => ({ ...sponsor, tier: tiers[sponsor.slug] ?? sponsor.tier }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        // Anything the arrangement does not mention keeps its manifest position,
        // after everything it does.
        (rank.get(a.slug) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.slug) ?? Number.MAX_SAFE_INTEGER) ||
        a.order - b.order ||
        a.slug.localeCompare(b.slug),
    );

  const nextOrder = new Map<number, number>();
  const sponsors = placed.map((sponsor) => {
    const n = (nextOrder.get(sponsor.tier) ?? 0) + 1;
    nextOrder.set(sponsor.tier, n);
    return { ...sponsor, order: n };
  });

  return { ...manifest, sponsors };
}

/** Label for a tier, e.g. 1 → "Platinum". Falls back to a neutral label. */
export function tierLabel(manifest: SponsorManifest, tier: number): string {
  return manifest.tiers[String(tier)] ?? `Tier ${tier}`;
}

/**
 * Normalise a Vite base to a trailing-slash prefix. `import.meta.env.BASE_URL` is
 * already `/` or `/repo/`, but a caller-supplied base may not be — and a missing
 * slash silently turns `/repo` + `brand/x.svg` into `/repobrand/x.svg`.
 *
 * `import.meta.env` is absent outside Vite (the tsx sample-render script), hence
 * the optional chain rather than a bare read.
 */
export function resolveBaseUrl(baseUrl?: string): string {
  const base = baseUrl ?? import.meta.env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Path of the manifest relative to the app base. */
export const MANIFEST_PATH = 'brand/sponsors/manifest.json';

/** Turn a zod path into something a human can act on: the slug, not `sponsors[7]`. */
function describePath(raw: unknown, path: (string | number)[]): string {
  const [head, index, ...rest] = path;
  if (head === 'sponsors' && typeof index === 'number') {
    const sponsors = (raw as { sponsors?: unknown[] } | null)?.sponsors;
    const entry = Array.isArray(sponsors) ? sponsors[index] : undefined;
    const slug = (entry as { slug?: unknown } | undefined)?.slug;
    const who = typeof slug === 'string' && slug ? `"${slug}"` : `#${index + 1}`;
    return rest.length ? `sponsor ${who} → ${rest.join('.')}` : `sponsor ${who}`;
  }
  return path.length ? path.join('.') : '(root)';
}

function formatError(error: z.ZodError, raw: unknown): string {
  const lines = error.issues.map((issue) => `  • ${describePath(raw, issue.path)}: ${issue.message}`);
  return `${MANIFEST_PATH} is invalid:\n${lines.join('\n')}`;
}

/** Sorted by tier (1 first), then order, then slug. Insertion order carries it. */
function toMeta(manifest: SponsorManifest): Record<string, SponsorMeta> {
  const sorted = [...manifest.sponsors].sort(
    (a, b) => a.tier - b.tier || a.order - b.order || a.slug.localeCompare(b.slug),
  );

  const meta: Record<string, SponsorMeta> = {};
  for (const entry of sorted) {
    meta[entry.slug] = {
      slug: entry.slug,
      name: entry.name,
      tier: entry.tier,
      order: entry.order,
      variants: [...entry.variants],
      ext: entry.ext,
      lightArtwork: entry.lightArtwork,
      missing: entry.missing,
      placeholder: entry.placeholder,
      url: entry.url,
    };
  }
  return meta;
}

/**
 * Fetch and validate the sponsor manifest. Throws with a readable message naming
 * the offending entry; there is no partial-success mode, because a half-loaded
 * sponsor list would silently ship posts with sponsors missing.
 */
export async function loadManifest(
  baseUrl?: string,
): Promise<{ manifest: SponsorManifest; meta: Record<string, SponsorMeta> }> {
  const url = `${resolveBaseUrl(baseUrl)}${MANIFEST_PATH}`;

  let raw: unknown;
  try {
    // The board is rewritten in place by SAVE POSITIONS, so a cached copy is a
    // wrong copy. `no-store` handles the HTTP cache; the unique query handles a
    // service worker, which answers from its precache whatever the request asks
    // for — but only for URLs it has an entry for, and it has none for this one
    // (docs/DECISIONS.md D34).
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    raw = await response.json();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not load ${url}: ${reason}`);
  }

  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(formatError(parsed.error, raw));
  }

  return { manifest: parsed.data, meta: toMeta(parsed.data) };
}

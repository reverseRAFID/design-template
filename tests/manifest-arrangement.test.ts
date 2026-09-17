import { describe, expect, it } from 'vitest';

import { applyArrangement } from '@/assets/manifest';
import type { SponsorManifest } from '@/assets/manifest';

/**
 * The arrangement lives in the manifest, not in the browser (docs/DECISIONS.md
 * D30), so folding a dragged order back into that file is the thing that has to be
 * right — get it wrong and the board silently reshuffles on the next load.
 */
function manifest(
  sponsors: Array<{ slug: string; tier: number; order: number }>,
): SponsorManifest {
  return {
    version: 1,
    tiers: { 1: 'Platinum', 2: 'Gold', 3: 'Partner' },
    sponsors: sponsors.map((s) => ({
      ...s,
      name: s.slug.toUpperCase(),
      variants: ['light', 'dark'] as ('light' | 'dark')[],
      ext: 'svg' as const,
      lightArtwork: false,
      missing: false,
      placeholder: false,
    })),
  };
}

const BASE = manifest([
  { slug: 'a', tier: 1, order: 1 },
  { slug: 'b', tier: 1, order: 2 },
  { slug: 'c', tier: 2, order: 1 },
  { slug: 'd', tier: 2, order: 2 },
  { slug: 'e', tier: 3, order: 1 },
]);

const shape = (m: SponsorManifest): string[] =>
  m.sponsors.map((s) => `${s.slug}:t${s.tier}:o${s.order}`);

describe('applyArrangement', () => {
  it('is a no-op when the arrangement already matches the manifest', () => {
    const out = applyArrangement(BASE, ['a', 'b', 'c', 'd', 'e'], {});
    expect(shape(out)).toEqual(['a:t1:o1', 'b:t1:o2', 'c:t2:o1', 'd:t2:o2', 'e:t3:o1']);
  });

  it('rewrites order within a tier from the dragged sequence', () => {
    const out = applyArrangement(BASE, ['b', 'a', 'd', 'c', 'e'], {});
    expect(shape(out)).toEqual(['b:t1:o1', 'a:t1:o2', 'd:t2:o1', 'c:t2:o2', 'e:t3:o1']);
  });

  it('moves a sponsor between tiers and renumbers both', () => {
    // `c` is dragged from tier 2 up into tier 1, landing before `b`.
    const out = applyArrangement(BASE, ['a', 'c', 'b', 'd', 'e'], { c: 1 });
    expect(shape(out)).toEqual(['a:t1:o1', 'c:t1:o2', 'b:t1:o3', 'd:t2:o1', 'e:t3:o1']);
  });

  it('renumbers order from 1 with no gaps, so the file stays readable', () => {
    const gappy = manifest([
      { slug: 'x', tier: 2, order: 40 },
      { slug: 'y', tier: 2, order: 7 },
    ]);
    const out = applyArrangement(gappy, ['y', 'x'], {});
    expect(shape(out)).toEqual(['y:t2:o1', 'x:t2:o2']);
  });

  it('keeps sponsors the arrangement never mentions, after the ones it does', () => {
    const out = applyArrangement(BASE, ['b'], {});
    // `b` leads tier 1; `a` keeps its place behind it. Nothing is lost.
    expect(out.sponsors).toHaveLength(BASE.sponsors.length);
    expect(shape(out).slice(0, 2)).toEqual(['b:t1:o1', 'a:t1:o2']);
  });

  it('preserves every other field untouched', () => {
    const out = applyArrangement(BASE, ['b', 'a', 'c', 'd', 'e'], {});
    const before = BASE.sponsors.find((s) => s.slug === 'b');
    const after = out.sponsors.find((s) => s.slug === 'b');
    expect(after?.name).toBe(before?.name);
    expect(after?.ext).toBe(before?.ext);
    expect(after?.variants).toEqual(before?.variants);
    expect(out.version).toBe(BASE.version);
    expect(out.tiers).toEqual(BASE.tiers);
  });

  it('does not mutate the manifest it was given', () => {
    const snapshot = JSON.stringify(BASE);
    applyArrangement(BASE, ['e', 'd', 'c', 'b', 'a'], { e: 1 });
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });

  it('round-trips: saving an arrangement then reloading reproduces it', () => {
    const order = ['d', 'c', 'b', 'a', 'e'];
    const tiers = { d: 1 };
    const saved = applyArrangement(BASE, order, tiers);

    // A fresh boot reads tier/order straight off the file, with no overrides.
    const reloaded = applyArrangement(
      saved,
      saved.sponsors.map((s) => s.slug),
      {},
    );
    expect(shape(reloaded)).toEqual(shape(saved));
  });
});

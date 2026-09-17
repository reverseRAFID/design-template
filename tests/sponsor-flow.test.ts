import { describe, expect, it } from 'vitest';

import {
  MARGIN,
  MAX_SPONSOR_ROWS,
  SPONSOR_GAP,
  SPONSOR_H,
  SPONSOR_H_MIN,
  SPONSOR_H_MIN_ROWS,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from '@/engine/metrics';
import { PRESETS } from '@/engine/presets';
import { flowSponsors, sortForFlow, tierScale, weightFor } from '@/engine/sponsor-flow';
import type { FlowItem, FlowOptions, FlowResult } from '@/engine/types';

/** Aspects in the shape the real pack has: wordmarks, a couple of squarish marks. */
const ASPECTS = [5.76, 3.22, 3.91, 4.06, 2.92, 4.98, 4.57, 1.98, 4.82, 6.29, 3.47, 4.19, 0.77, 2.41, 5.16, 3.76, 3.34, 3.24, 5.44, 1.0];

function makeItems(count: number, tiers: number[] = [1, 2, 3]): FlowItem[] {
  return Array.from({ length: count }, (_, i) => ({
    slug: `s${i}`,
    aspect: ASPECTS[i % ASPECTS.length] ?? 3,
    // Roughly the real distribution: a few tier 1, more tier 2, most tier 3.
    tier: tiers[Math.min(tiers.length - 1, Math.floor(i / Math.max(1, count / tiers.length)))] ?? 3,
    order: i,
  }));
}

function optionsFor(presetIndex = 0): FlowOptions {
  const preset = PRESETS[presetIndex];
  if (!preset) throw new Error('no preset');
  const S = Math.min(preset.w, preset.h);
  return {
    available: preset.w - 2 * MARGIN * S,
    targetH: SPONSOR_H * S,
    minH: SPONSOR_H_MIN * S,
    minHRows: SPONSOR_H_MIN_ROWS * S,
    gap: SPONSOR_GAP * S,
  };
}

/** Invariants that must hold for any input on any preset. */
function expectValid(result: FlowResult, opts: FlowOptions, input: FlowItem[]): void {
  expect(result.rows.length).toBeLessThanOrEqual(MAX_SPONSOR_ROWS);

  const floor = Math.min(opts.minHRows ?? opts.minH, opts.minH);
  expect(result.logoH).toBeGreaterThanOrEqual(floor - 1e-6);
  expect(result.logoH).toBeLessThanOrEqual(opts.targetH + 1e-6);

  // Rows run top tier first, and each tier appears at most once.
  const tiers = result.rows.map((r) => r.tier);
  expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  expect(new Set(tiers).size).toBe(tiers.length);

  const placed: string[] = [];
  for (const row of result.rows) {
    expect(row.width).toBeLessThanOrEqual(opts.available + 1e-6);
    expect(row.items.length).toBeGreaterThan(0);
    // The band is the tallest logo in the row.
    expect(row.height).toBeCloseTo(Math.max(...row.items.map((i) => i.h)), 6);
    for (const item of row.items) {
      expect(item.w).toBeGreaterThan(0);
      expect(item.h).toBeGreaterThan(0);
      placed.push(item.slug);
    }
  }

  // Everything is either placed or explicitly dropped, never silently lost.
  expect([...placed, ...result.dropped].sort()).toEqual(input.map((i) => i.slug).sort());
  expect(new Set(placed).size).toBe(placed.length);
}

describe('sortForFlow', () => {
  it('orders by tier, then order, then slug', () => {
    const items: FlowItem[] = [
      { slug: 'c', aspect: 3, tier: 2, order: 1 },
      { slug: 'a', aspect: 3, tier: 1, order: 5 },
      { slug: 'b', aspect: 3, tier: 1, order: 2 },
      { slug: 'a2', aspect: 3, tier: 1, order: 2 },
    ];
    expect(sortForFlow(items).map((i) => i.slug)).toEqual(['a2', 'b', 'a', 'c']);
  });
});

describe('weightFor', () => {
  it('shrinks wide logos and lifts tall-boxed ones', () => {
    // The complaint that prompted this: K-Silver (5.44) dwarfed Ansys (1.98).
    expect(weightFor(5.44)).toBeLessThan(1);
    expect(weightFor(1.98)).toBeGreaterThan(1);
    expect(weightFor(3)).toBeCloseTo(1, 6);
  });

  it('is monotone in aspect, so nothing overtakes anything', () => {
    const sorted = [1, 2, 3, 4, 5, 6].map(weightFor);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!).toBeLessThanOrEqual(sorted[i - 1]!);
    }
  });

  it('bounds the extremes rather than letting one logo tower', () => {
    expect(weightFor(0.05)).toBeLessThanOrEqual(WEIGHT_MAX);
    expect(weightFor(50)).toBeGreaterThanOrEqual(WEIGHT_MIN);
  });

  it('survives degenerate aspects', () => {
    expect(weightFor(0)).toBe(1);
    expect(weightFor(Number.NaN)).toBe(1);
    expect(weightFor(-2)).toBe(1);
  });
});

describe('tierScale', () => {
  it('sizes every tier the same', () => {
    // Tier decides which ROW a sponsor lands on, never how big it is drawn.
    expect(tierScale(1)).toBe(tierScale(2));
    expect(tierScale(2)).toBe(tierScale(3));
  });

  it('clamps unknown tiers to the ends', () => {
    expect(tierScale(0)).toBe(tierScale(1));
    expect(tierScale(99)).toBe(tierScale(3));
  });
});

describe('flowSponsors', () => {
  it('returns nothing for an empty selection', () => {
    const opts = optionsFor();
    expect(flowSponsors([], opts)).toEqual({ rows: [], logoH: opts.targetH, dropped: [] });
  });

  it('gives one row per tier', () => {
    const opts = optionsFor();
    const result = flowSponsors(makeItems(12), opts);
    expect(result.rows.map((r) => r.tier)).toEqual([1, 2, 3]);
    expectValid(result, opts, makeItems(12));
  });

  it('puts a single-tier selection on one row', () => {
    const opts = optionsFor();
    const items = makeItems(5, [2]);
    const result = flowSponsors(items, opts);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.tier).toBe(2);
    expectValid(result, opts, items);
  });

  it('never exceeds three rows even with more tiers than that', () => {
    const opts = optionsFor();
    const items: FlowItem[] = [1, 2, 3, 4, 5].map((tier, i) => ({
      slug: `t${tier}`,
      aspect: 3,
      tier,
      order: i,
    }));
    const result = flowSponsors(items, opts);
    expect(result.rows.length).toBeLessThanOrEqual(MAX_SPONSOR_ROWS);
    // Tiers 4 and 5 fold into the last row rather than being dropped.
    expectValid(result, opts, items);
  });

  it('draws the same artwork at the same size in every tier', () => {
    const opts = optionsFor();
    const items: FlowItem[] = [
      { slug: 'top', aspect: 3, tier: 1, order: 1 },
      { slug: 'mid', aspect: 3, tier: 2, order: 1 },
      { slug: 'low', aspect: 3, tier: 3, order: 1 },
    ];
    const [r1, r2, r3] = flowSponsors(items, opts).rows;
    expect(r2!.items[0]!.h).toBeCloseTo(r1!.items[0]!.h, 6);
    expect(r3!.items[0]!.h).toBeCloseTo(r1!.items[0]!.h, 6);
  });

  it('makes a narrow logo taller than a wide one in the same row', () => {
    const opts = optionsFor();
    const items: FlowItem[] = [
      { slug: 'wide', aspect: 6, tier: 1, order: 1 },
      { slug: 'square', aspect: 1, tier: 1, order: 2 },
    ];
    const row = flowSponsors(items, opts).rows[0];
    const wide = row!.items.find((i) => i.slug === 'wide')!;
    const square = row!.items.find((i) => i.slug === 'square')!;
    expect(square.h).toBeGreaterThan(wide.h);
    // ...but still far narrower, because area is only partly equalised.
    expect(square.w).toBeLessThan(wide.w);
  });

  it('holds its invariants for 3, 8, 17 and 30 sponsors on every preset', () => {
    for (let p = 0; p < PRESETS.length; p += 1) {
      const opts = optionsFor(p);
      for (const count of [3, 8, 17, 30]) {
        const items = makeItems(count);
        expectValid(flowSponsors(items, opts), opts, items);
      }
    }
  });

  it('fits the real 20-sponsor pack on every preset without dropping anything', () => {
    const items: FlowItem[] = ASPECTS.map((aspect, i) => ({
      slug: `s${i}`,
      aspect,
      tier: i < 3 ? 1 : i < 10 ? 2 : 3,
      order: i,
    }));
    for (let p = 0; p < PRESETS.length; p += 1) {
      const opts = optionsFor(p);
      const result = flowSponsors(items, opts);
      expect(result.dropped).toEqual([]);
      expect(result.rows).toHaveLength(3);
      expectValid(result, opts, items);
    }
  });

  it('drops from the worst tier first when even the floor will not fit', () => {
    const opts = optionsFor();
    // 40 very wide logos cannot fit three rows at any allowed height.
    const items: FlowItem[] = Array.from({ length: 40 }, (_, i) => ({
      slug: `s${i}`,
      aspect: 8,
      tier: i < 4 ? 1 : i < 12 ? 2 : 3,
      order: i,
    }));
    const result = flowSponsors(items, opts);
    expect(result.dropped.length).toBeGreaterThan(0);

    // Worst tier first: a tier-2 sponsor may only go once every tier-3 one has.
    const dropped = new Set(result.dropped);
    const droppedTiers = result.dropped.map((slug) => items.find((i) => i.slug === slug)!.tier);
    if (droppedTiers.includes(2)) {
      expect(items.filter((i) => i.tier === 3).every((i) => dropped.has(i.slug))).toBe(true);
    }
    expect(droppedTiers).not.toContain(1);
    expectValid(result, opts, items);
  });

  it('keeps one overflowing logo rather than returning an empty strip', () => {
    const opts = optionsFor();
    const items: FlowItem[] = [{ slug: 'huge', aspect: 200, tier: 1, order: 1 }];
    const result = flowSponsors(items, opts);
    expect(result.rows).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });

  it('is unaffected by the input order', () => {
    const opts = optionsFor();
    const items = makeItems(14);
    const shuffled = [...items].reverse();
    expect(flowSponsors(shuffled, opts)).toEqual(flowSponsors(items, opts));
  });

  it('does not resize the remaining logos when one is unticked', () => {
    // The reference aspect is a constant for exactly this reason.
    const opts = optionsFor();
    const items = makeItems(12);
    const full = flowSponsors(items, opts);
    const fewer = flowSponsors(items.slice(0, -1), opts);
    const heightOf = (r: FlowResult, slug: string): number | undefined =>
      r.rows.flatMap((row) => row.items).find((i) => i.slug === slug)?.h;
    // Same row height means the same base height survived; per-logo weighting is
    // a pure function of that logo's own aspect.
    expect(heightOf(fewer, 's0')).toBeCloseTo(heightOf(full, 's0')!, 6);
  });
});

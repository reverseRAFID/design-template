/**
 * Sponsor strip packing — one row per tier, logos weighted toward equal optical area.
 *
 * Two deliberate departures from docs/02-DESIGN-SYSTEM.md § E, both at the team's
 * request after seeing the real artwork (docs/DECISIONS.md D16):
 *
 * 1. **Rows are tiers, not a balanced split.** § E packs one or two rows split for
 *    equal width and says "never three rows". A sponsor board reads better when the
 *    rows ARE the tiers, top tier first and largest — which is also what makes a
 *    tier mean anything visually.
 *
 * 2. **Logos are not all the same height.** § E gives every logo height `h2`, which
 *    made a 5.4:1 wordmark (K-Silver) read far heavier than a 1.98:1 mark (Ansys,
 *    whose box is tall because of its "part of Synopsys" line). Each logo is nudged
 *    toward equal AREA instead, by `WEIGHT_EXPONENT`.
 *
 * The weighting keeps row width LINEAR in the base height — every logo's width is
 * `h × constant` — so the shrink search stays a clean bisection.
 */

import {
  MAX_SPONSOR_ROWS,
  TIER_SCALE,
  WEIGHT_EXPONENT,
  WEIGHT_MAX,
  WEIGHT_MIN,
  WEIGHT_REFERENCE_ASPECT,
} from './metrics';
import type { FlowItem, FlowOptions, FlowPlacement, FlowResult, FlowRow } from './types';

/**
 * Bisection steps for the shrink. The range is at most `targetH` (~50px), so 24
 * halvings land far below a millionth of a pixel — exact for our purposes and
 * constant-time, unlike stepping down pixel by pixel.
 */
const SHRINK_STEPS = 24;

/**
 * Tier ascending, then order ascending; slug breaks ties so two sponsors given the
 * same (tier, order) still flow deterministically.
 */
export function sortForFlow(items: readonly FlowItem[]): FlowItem[] {
  return [...items].sort(
    (a, b) => a.tier - b.tier || a.order - b.order || a.slug.localeCompare(b.slug),
  );
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function tierScale(tier: number): number {
  const index = clamp(Math.trunc(tier) - 1, 0, TIER_SCALE.length - 1);
  return TIER_SCALE[index] ?? 1;
}

/**
 * Height multiplier for one logo, relative to its row's height.
 *
 * A wide logo comes down, a tall-boxed one goes up, bounded so nothing is extreme.
 * Measured against a fixed reference aspect, never the mean of the current
 * selection — otherwise unticking one sponsor would resize all the others.
 */
export function weightFor(aspect: number): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return 1;
  const raw = (WEIGHT_REFERENCE_ASPECT / aspect) ** WEIGHT_EXPONENT;
  return clamp(raw, WEIGHT_MIN, WEIGHT_MAX);
}

/** Width of a logo per unit of base height: `w = unitWidth × h`. */
function unitWidth(item: FlowItem, scale: number): number {
  return Math.max(0, item.aspect) * weightFor(item.aspect) * scale;
}

/** Contiguous runs of equal tier, capped at MAX_SPONSOR_ROWS (extras join the last). */
function groupByTier(items: readonly FlowItem[]): FlowItem[][] {
  const groups: FlowItem[][] = [];
  let currentTier: number | null = null;

  for (const item of items) {
    const startNew = item.tier !== currentTier && groups.length < MAX_SPONSOR_ROWS;
    if (startNew) {
      groups.push([item]);
      currentTier = item.tier;
    } else {
      (groups[groups.length - 1] ?? groups[groups.push([]) - 1])?.push(item);
    }
  }
  return groups.filter((g) => g.length > 0);
}

/** Packed width of one tier group at base height `h`. */
function rowWidth(group: readonly FlowItem[], h: number, gap: number, scale: number): number {
  if (group.length === 0) return 0;
  let width = 0;
  for (const item of group) width += unitWidth(item, scale) * h;
  return width + gap * (group.length - 1);
}

function buildRow(group: readonly FlowItem[], h: number, gap: number): FlowRow {
  const tier = group[0]?.tier ?? 1;
  const scale = tierScale(tier);

  let height = 0;
  const items: FlowPlacement[] = group.map((item) => {
    const itemH = h * scale * weightFor(item.aspect);
    if (itemH > height) height = itemH;
    return { slug: item.slug, w: Math.max(0, item.aspect) * itemH, h: itemH };
  });

  return { tier, items, width: rowWidth(group, h, gap, scale), height };
}

/**
 * Largest h in [lo, hi] satisfying `fits`. Monotone — widths only grow with h — so
 * bisection is valid, and the result is always a height tested true.
 */
function largestFittingH(fits: (h: number) => boolean, lo: number, hi: number): number | null {
  if (fits(hi)) return hi;
  if (hi <= lo || !fits(lo)) return null;

  let good = lo;
  let bad = hi;
  for (let i = 0; i < SHRINK_STEPS; i += 1) {
    const mid = (good + bad) / 2;
    if (fits(mid)) good = mid;
    else bad = mid;
  }
  return good;
}

export function flowSponsors(items: FlowItem[], opts: FlowOptions): FlowResult {
  const sorted = sortForFlow(items);
  if (sorted.length === 0) return { rows: [], logoH: opts.targetH, dropped: [] };

  const { available, targetH, minH, gap } = opts;
  const dropped: string[] = [];
  let working = sorted;

  for (;;) {
    const groups = groupByTier(working);
    // A single row keeps § E's stricter floor; only a wrapped strip may go smaller.
    const floor = Math.min(groups.length > 1 ? (opts.minHRows ?? minH) : minH, minH);

    const fits = (h: number): boolean =>
      groups.every((g) => rowWidth(g, h, gap, tierScale(g[0]?.tier ?? 1)) <= available);

    const h = largestFittingH(fits, floor, targetH);
    if (h !== null) {
      return { rows: groups.map((g) => buildRow(g, h, gap)), logoH: h, dropped };
    }

    if (working.length <= 1) break;
    // Sorted tier-asc / order-asc, so the tail is exactly "worst tier, worst order
    // within it" — the spec's drop order, without a second scan.
    const victim = working[working.length - 1];
    if (victim) dropped.push(victim.slug);
    working = working.slice(0, -1);
  }

  // A single logo wider than the whole strip. Showing it overflowing beats an
  // empty sponsor strip, and it keeps logoH inside the allowed range.
  const survivor = working[0];
  const floor = Math.min(opts.minHRows ?? minH, minH);
  return {
    rows: survivor ? [buildRow([survivor], floor, gap)] : [],
    logoH: floor,
    dropped,
  };
}

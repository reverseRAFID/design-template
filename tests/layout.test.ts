import { describe, expect, it } from 'vitest';

import { clampTransform, computeLayout } from '@/engine/layout';
import {
  BANNER_ALPHA,
  MAX_ZOOM,
  MIN_ZOOM,
  SCRIM_MAX_ALPHA,
  SCRIM_TOP_FALLOFF,
  MAX_SPONSOR_ROWS,
  SPONSOR_H,
  SPONSOR_H_MIN_ROWS,
  STRIP_PAD_X,
  STRIP_PAD_Y,
  TONE_TOP_BOX_W,
  TONE_WEIGHTS,
  TOP_GAP_FACTOR,
  TOP_LOGO_H,
  TOP_LOGO_H_MAX_PX,
  TIER_SCALE,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from '@/engine/metrics';
import { getPreset, PRESETS } from '@/engine/presets';
import type {
  ImageTransform,
  LayoutAssets,
  LogoMetrics,
  PlacedLogo,
  Preset,
  Rect,
  Scene,
} from '@/engine/types';
import { IDENTITY_TRANSFORM } from '@/engine/types';

/** 1px is the PRD tolerance; the pure-geometry checks use a float epsilon. */
const PX = 1;
const EPS = 1e-9;

const FULL_BOX: Rect = { x: 0, y: 0, w: 1, h: 1 };

function logo(slug: string, aspect: number): LogoMetrics {
  return { slug, optical: { ...FULL_BOX }, aspect, placeholder: false };
}

/** Wordmark / square mark / typical, cycled so rows are not uniform. */
const SPONSOR_ASPECTS = [4.5, 1.0, 2.4];

function makeAssets(count: number, bracuAspect = 3.2, mtAspect = 2.6): LayoutAssets {
  const sponsors: LayoutAssets['sponsors'] = {};
  const meta: LayoutAssets['meta'] = {};

  for (let i = 0; i < count; i += 1) {
    const slug = `s${String(i).padStart(2, '0')}`;
    sponsors[slug] = logo(slug, SPONSOR_ASPECTS[i % SPONSOR_ASPECTS.length] ?? 2.4);
    const tier = i < 3 ? 1 : i < 9 ? 2 : 3;
    meta[slug] = { slug, name: slug, tier, order: i, variants: ['light', 'dark'], placeholder: false };
  }

  return { bracu: logo('bracu', bracuAspect), mongoltori: logo('mongoltori', mtAspect), sponsors, meta };
}

function makeScene(preset: Preset, over: Partial<Scene> = {}): Scene {
  const assetsCount = over.selectedSponsors?.length ?? 0;
  return {
    preset,
    transform: IDENTITY_TRANSFORM,
    tone: 'dark',
    toneOverridden: false,
    frame: false,
    scrim: 0.7,
    selectedSponsors: Array.from({ length: assetsCount }, (_, i) => `s${String(i).padStart(2, '0')}`),
    ...over,
  };
}

function sceneWith(preset: Preset, sponsorCount: number, over: Partial<Scene> = {}): Scene {
  return makeScene(preset, {
    selectedSponsors: Array.from({ length: sponsorCount }, (_, i) => `s${String(i).padStart(2, '0')}`),
    ...over,
  });
}

function contains(outer: Rect, inner: Rect, slack = EPS): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  );
}

function allPlaced(rows: PlacedLogo[][]): PlacedLogo[] {
  return rows.flat();
}

// ---------------------------------------------------------------------------

describe.each(PRESETS.map((p) => [p.id, p] as const))('layout — %s', (_id, preset) => {
  const { w: W, h: H } = preset;
  const S = Math.min(W, H);

  describe.each([false, true])('frame=%s', (frame) => {
    const scene = sceneWith(preset, 8, { frame });
    const layout = computeLayout(scene, makeAssets(8));
    const m = layout.margin;

    it('reports the preset size and S', () => {
      expect(layout.W).toBe(W);
      expect(layout.H).toBe(H);
      expect(layout.S).toBe(S);
      expect(m).toBeGreaterThan(0);
    });

    it('keeps both top logos inside the margin on every side', () => {
      for (const placed of [layout.top.bracu, layout.top.mongoltori]) {
        expect(placed.x).toBeGreaterThanOrEqual(m - EPS);
        expect(placed.y).toBeGreaterThanOrEqual(m - EPS);
        expect(placed.x + placed.w).toBeLessThanOrEqual(W - m + EPS);
        expect(placed.y + placed.h).toBeLessThanOrEqual(H - m + EPS);
      }
      expect(layout.top.bracu.x).toBeCloseTo(m, 10);
      expect(layout.top.mongoltori.x + layout.top.mongoltori.w).toBeCloseTo(W - m, 10);
    });

    it('never lets the two top logos touch, and keeps the spec gap', () => {
      const { bracu, mongoltori } = layout.top;
      const gap = mongoltori.x - (bracu.x + bracu.w);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeGreaterThanOrEqual(TOP_GAP_FACTOR * bracu.h - EPS);
    });

    it('gives the two top logos equal height, within 1px', () => {
      expect(Math.abs(layout.top.bracu.h - layout.top.mongoltori.h)).toBeLessThanOrEqual(PX);
      expect(layout.top.bracu.h).toBeLessThanOrEqual(
        Math.min(TOP_LOGO_H * S, TOP_LOGO_H_MAX_PX) + EPS,
      );
    });

    it('copies optical box and placeholder flags onto the placed logos', () => {
      expect(layout.top.bracu.optical).toEqual(FULL_BOX);
      expect(layout.top.bracu.slug).toBe('bracu');
      expect(layout.top.mongoltori.slug).toBe('mongoltori');
      expect(layout.top.bracu.placeholder).toBe(false);
      // Dark tone takes the CREAM artwork — § E's variant table.
      expect(layout.top.bracu.artwork).toBe('light');
    });

    it('runs the sponsor banner along the bottom of the composition box', () => {
      // The banner is an extension beneath the photo, not an overlay on it (D17),
      // and it shares the card's box when the frame is on (D20).
      const box = layout.frame ? layout.frame.rect : { x: 0, y: 0, w: W, h: H };
      const band = layout.strip.backing;
      expect(band).not.toBeNull();
      expect(band!.x).toBeCloseTo(box.x, 6);
      expect(band!.w).toBeCloseTo(box.w, 6);
      expect(band!.y + band!.h).toBeCloseTo(box.y + box.h, 6);
      expect(band!.color).toBe('cream');
      expect(band!.alpha).toBe(BANNER_ALPHA);
      // Square top corners either way: that edge is the seam with the photo.
      expect(band!.shape.cut.tl).toBe(false);
      expect(band!.shape.cut.tr).toBe(false);
      expect(layout.strip.bandHeight).toBeCloseTo(band!.h, 6);
    });

    it('gives the photo exactly the space the banner leaves', () => {
      const box = layout.frame ? layout.frame.rect : { x: 0, y: 0, w: W, h: H };
      expect(layout.photoH).toBeCloseTo(box.h - layout.strip.bandHeight, 6);
      if (layout.image) {
        expect(layout.image.dh).toBeCloseTo(layout.photoH, 6);
        expect(layout.image.dw).toBeCloseTo(box.w, 6);
        expect(layout.image.dx).toBeCloseTo(box.x, 6);
        expect(layout.image.dy).toBeCloseTo(box.y, 6);
      }
    });

    it('keeps every sponsor inside the banner', () => {
      const placed = allPlaced(layout.strip.rows);
      const band = layout.strip.backing!;
      const padX = STRIP_PAD_X * S;
      expect(placed.length).toBeGreaterThan(0);
      for (const p of placed) {
        expect(p.x).toBeGreaterThanOrEqual(padX - EPS);
        expect(p.x + p.w).toBeLessThanOrEqual(W - padX + EPS);
        expect(p.y).toBeGreaterThanOrEqual(band.y - EPS);
        expect(p.y + p.h).toBeLessThanOrEqual(band.y + band.h + EPS);
      }
    });

    it('draws every sponsor at a comparable size, whatever its tier', () => {
      // Tier picks the row, never the size — see D16. Heights still vary a little
      // WITHIN and across rows because of optical-area weighting, which is bounded.
      const heights = allPlaced(layout.strip.rows).map((p) => p.h);
      const spread = Math.max(...heights) / Math.min(...heights);
      expect(spread).toBeLessThanOrEqual(WEIGHT_MAX / WEIGHT_MIN + 1e-6);
    });

    it('keeps every sponsor within the allowed height range', () => {
      // The base height is bounded; a tier-1 logo may exceed it by its tier scale
      // and a narrow logo by its weighting, so the bound here is the scaled one.
      const floor = SPONSOR_H_MIN_ROWS * S * WEIGHT_MIN * 0.99;
      const ceiling = SPONSOR_H * S * TIER_SCALE[0]! * WEIGHT_MAX * 1.01;
      for (const p of allPlaced(layout.strip.rows)) {
        expect(p.h).toBeGreaterThanOrEqual(floor);
        expect(p.h).toBeLessThanOrEqual(ceiling);
      }
    });

    it('centres each row horizontally', () => {
      for (const row of layout.strip.rows) {
        const first = row[0];
        const last = row[row.length - 1];
        expect(first).toBeDefined();
        expect(last).toBeDefined();
        const left = first!.x;
        const right = last!.x + last!.w;
        expect((left + right) / 2).toBeCloseTo(W / 2, 6);
      }
    });

    it('never overlaps the strip with the top logos', () => {
      const topBottom = layout.top.bracu.y + layout.top.bracu.h;
      expect(layout.strip.bbox.y).toBeGreaterThan(topBottom);
    });

    it('samples tone only where the top logos sit', () => {
      // The bottom band is gone: the banner is opaque, so nothing down there
      // affects whether the TOP logos need cream or ink.
      const { regions, weights } = layout.toneRegions;
      expect(weights).toEqual([...TONE_WEIGHTS]);
      expect(regions).toHaveLength(2);

      const [left, right] = regions;
      expect(left).toEqual({ x: m, y: m, w: TONE_TOP_BOX_W * W, h: layout.top.bracu.h });
      expect(right?.x).toBeCloseTo(W - m - TONE_TOP_BOX_W * W, 10);
      expect(right?.w).toBeCloseTo(TONE_TOP_BOX_W * W, 10);
    });
  });
});

// ---------------------------------------------------------------------------
// Top logo shrink
// ---------------------------------------------------------------------------

describe('top logo shrink', () => {
  const og = getPreset('og');
  const S = Math.min(og.w, og.h);
  const unshrunk = Math.min(TOP_LOGO_H * S, TOP_LOGO_H_MAX_PX);

  it('shrinks BOTH logos uniformly on og when a wide BRACU mark will not fit', () => {
    const layout = computeLayout(sceneWith(og, 3), makeAssets(3, 22, 6));
    const { bracu, mongoltori } = layout.top;

    expect(bracu.h).toBeLessThan(unshrunk);
    expect(mongoltori.h).toBeLessThan(unshrunk);
    expect(bracu.h).toBeCloseTo(mongoltori.h, 10);

    // Uniform scaling makes the run fit the margins exactly.
    const run = bracu.w + mongoltori.w + TOP_GAP_FACTOR * bracu.h;
    expect(run).toBeCloseTo(og.w - 2 * layout.margin, 6);
    expect(mongoltori.x).toBeGreaterThan(bracu.x + bracu.w);
  });

  it('leaves normal marks at the full height on og', () => {
    const layout = computeLayout(sceneWith(og, 3), makeAssets(3));
    expect(layout.top.bracu.h).toBeCloseTo(unshrunk, 10);
    expect(layout.top.mongoltori.h).toBeCloseTo(unshrunk, 10);
  });

  it('never exceeds the absolute top logo cap on any preset', () => {
    for (const preset of PRESETS) {
      const layout = computeLayout(sceneWith(preset, 3), makeAssets(3));
      expect(layout.top.bracu.h).toBeLessThanOrEqual(TOP_LOGO_H_MAX_PX);
    }
  });
});

// ---------------------------------------------------------------------------
// PRD acceptance: og at 1200×630 with 17 sponsors
// ---------------------------------------------------------------------------

describe('og 1200×630 with 17 sponsors (PRD acceptance)', () => {
  const og = getPreset('og');

  it.each([false, true])('never overlaps the top logos (frame=%s)', (frame) => {
    const layout = computeLayout(sceneWith(og, 17, { frame }), makeAssets(17));
    const topBottom = layout.top.bracu.y + layout.top.bracu.h;

    const padX = STRIP_PAD_X * Math.min(og.w, og.h);
    expect(layout.strip.rows.length).toBeGreaterThan(0);
    // The banner is below the photo, so it cannot reach the top logos at all.
    expect(layout.strip.backing!.y).toBeGreaterThan(topBottom);
    for (const p of allPlaced(layout.strip.rows)) {
      expect(p.y).toBeGreaterThan(topBottom);
      expect(p.x).toBeGreaterThanOrEqual(padX - EPS);
      expect(p.x + p.w).toBeLessThanOrEqual(og.w - padX + EPS);
    }
    const box = layout.frame ? layout.frame.rect : { x: 0, y: 0, w: og.w, h: og.h };
    expect(layout.strip.backing!.y + layout.strip.backing!.h).toBeCloseTo(box.y + box.h, 6);
  });
});

// ---------------------------------------------------------------------------
// Scrims vs. backing
// ---------------------------------------------------------------------------

describe('scrims and the sponsor banner', () => {
  const square = getPreset('square');
  const S = square.w;

  it('draws only a top scrim when the frame is off', () => {
    const layout = computeLayout(sceneWith(square, 8, { frame: false }), makeAssets(8));
    // The banner is unconditional now, so it coexists with the scrim.
    expect(layout.strip.backing).not.toBeNull();
    expect(layout.frame).toBeNull();
    expect(layout.scrims).not.toBeNull();

    const scrims = layout.scrims!;
    expect(scrims.color).toBe('ink');
    expect(scrims.top.y0).toBe(0);
    expect(scrims.top.y1).toBeCloseTo(layout.margin + layout.top.bracu.h + SCRIM_TOP_FALLOFF * S, 6);
    // No bottom scrim: the opaque banner already separates strip from photo.
    expect(scrims.bottom).toBeNull();
    expect(scrims.alpha).toBeCloseTo(SCRIM_MAX_ALPHA * 0.7, 10);
  });

  it('keeps the banner styling identical whether the frame is on or off', () => {
    const layout = computeLayout(sceneWith(square, 8, { frame: true }), makeAssets(8));
    // The top scrim survives in both modes now; only the box changes.
    expect(layout.scrims).not.toBeNull();
    expect(layout.frame).not.toBeNull();
    expect(layout.strip.backing).not.toBeNull();

    const backing = layout.strip.backing!;
    const bbox = layout.strip.bbox;
    // Always light, always opaque, always full bleed — the frame changes none of it.
    expect(backing.alpha).toBeCloseTo(BANNER_ALPHA, 10);
    expect(backing.color).toBe('cream');
    // Bottom corners follow the card's cut; the top edge is the seam, so square.
    expect(backing.shape.cut).toEqual({ tl: false, tr: false, bl: true, br: true });
    expect(backing.shape.chamfer).toBeCloseTo(layout.frame!.shape.chamfer, 10);
    expect(backing.x).toBeCloseTo(layout.frame!.rect.x, 6);
    expect(backing.w).toBeCloseTo(layout.frame!.rect.w, 6);
    // No note in this scene, so both paddings are the plain STRIP_PAD_Y.
    expect(backing.y).toBeCloseTo(bbox.y - STRIP_PAD_Y * S, 6);
    expect(backing.h).toBeCloseTo(bbox.h + 2 * STRIP_PAD_Y * S, 6);
  });

  it('scrims a dark photo and leaves a light one alone', () => {
    // D24: darkening reads as a vignette, but washing cream over an already-bright
    // photo only flattens it — and ink logos do not need the help.
    const dark = computeLayout(sceneWith(square, 8, { tone: 'dark' }), makeAssets(8));
    expect(dark.scrims).not.toBeNull();
    expect(dark.scrims?.color).toBe('ink');

    const light = computeLayout(sceneWith(square, 8, { tone: 'light' }), makeAssets(8));
    expect(light.scrims).toBeNull();

    // The banner is always cream, whatever the tone does.
    expect(light.strip.backing?.color).toBe('cream');
    expect(dark.strip.backing?.color).toBe('cream');
  });

  it('scales the scrim alpha by scene.scrim', () => {
    const off = computeLayout(sceneWith(square, 8, { scrim: 0 }), makeAssets(8));
    expect(off.scrims?.alpha).toBe(0);
    const full = computeLayout(sceneWith(square, 8, { scrim: 1 }), makeAssets(8));
    expect(full.scrims?.alpha).toBeCloseTo(SCRIM_MAX_ALPHA, 10);
  });
});

// ---------------------------------------------------------------------------
// Frame containment
// ---------------------------------------------------------------------------

describe('with the frame on, overlays sit inside the frame rect', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s', (_id, preset) => {
    const layout = computeLayout(sceneWith(preset, 3, { frame: true }), makeAssets(3));
    const frame = layout.frame;
    expect(frame).not.toBeNull();
    const rect = frame!.rect;

    expect(layout.margin).toBeCloseTo(frame!.effectiveMargin, 10);
    expect(layout.margin).toBeGreaterThan(frame!.inset);

    // The card holds the WHOLE composition — photo, top logos and banner (D20).
    expect(contains(rect, layout.top.bracu)).toBe(true);
    expect(contains(rect, layout.top.mongoltori)).toBe(true);
    expect(contains(rect, layout.strip.backing!)).toBe(true);
    for (const p of allPlaced(layout.strip.rows)) expect(contains(rect, p)).toBe(true);
    // The photo region plus the banner exactly fill the card.
    expect(layout.photoH + layout.strip.bandHeight).toBeCloseTo(rect.h, 6);
  });

  it('mats only the og preset', () => {
    const og = computeLayout(sceneWith(getPreset('og'), 3, { frame: true }), makeAssets(3));
    expect(og.frame?.mat).toBeGreaterThan(0);
    const square = computeLayout(sceneWith(getPreset('square'), 3, { frame: true }), makeAssets(3));
    expect(square.frame?.mat).toBe(0);
  });

  it("puts the scene label in the HUD's left slot, uppercased", () => {
    // The note lives on the photo's telemetry line now — D22.
    const layout = computeLayout(
      sceneWith(getPreset('square'), 3, { frame: true, label: 'urc 2026 · utah' }),
      makeAssets(3),
    );
    expect(layout.hud?.left?.text).toBe('// URC 2026 · UTAH');
    expect(layout.hud?.left?.align).toBe('left');
  });

  it('draws the export date on the right, from the scene', () => {
    // The engine never reads a clock — the date is handed in (D23).
    const layout = computeLayout(
      { ...sceneWith(getPreset('square'), 3), stamp: '17.09.2026' },
      makeAssets(3),
    );
    expect(layout.hud?.right?.text).toBe('17.09.2026');
    expect(layout.hud?.right?.align).toBe('right');
    // No note set, so the left slot stays empty rather than inventing text.
    expect(layout.hud?.left).toBeNull();
  });

  it('has no HUD at all when there is neither a note nor a date', () => {
    const layout = computeLayout(sceneWith(getPreset('square'), 3), makeAssets(3));
    expect(layout.hud).toBeNull();
  });

  it('colours the HUD against the photo, opposite the scrim', () => {
    const stamp = '17.09.2026';
    const dark = computeLayout(
      { ...sceneWith(getPreset('square'), 3, { tone: 'dark' }), stamp },
      makeAssets(3),
    );
    const light = computeLayout(
      { ...sceneWith(getPreset('square'), 3, { tone: 'light' }), stamp },
      makeAssets(3),
    );
    expect(dark.hud?.color).toBe('cream');
    expect(light.hud?.color).toBe('ink');
  });

});

// ---------------------------------------------------------------------------
// Selection edge cases
// ---------------------------------------------------------------------------

describe('sponsor selection', () => {
  const square = getPreset('square');

  it('gives the photo the whole canvas when no sponsors are selected', () => {
    const layout = computeLayout(sceneWith(square, 0), makeAssets(8));
    expect(layout.strip.rows).toEqual([]);
    expect(layout.strip.dropped).toEqual([]);
    // No sponsors, no banner, so nothing is taken from the photo.
    expect(layout.strip.backing).toBeNull();
    expect(layout.strip.bandHeight).toBe(0);
    expect(layout.photoH).toBe(square.h);
    expect(layout.strip.bbox.h).toBe(0);
    expect(layout.scrims?.bottom).toBeNull();
    // Only the two top boxes are sampled now.
    expect(layout.toneRegions.regions).toHaveLength(2);
  });

  it('honours a dragged order within a tier', () => {
    // D19: the sponsor list can be rearranged, and the strip must follow.
    const assets = makeAssets(9);
    const slugs = Object.keys(assets.meta);
    const base = computeLayout(sceneWith(square, 9), assets);
    const drawn = (l: ReturnType<typeof computeLayout>): string[] =>
      allPlaced(l.strip.rows).map((p) => p.slug);

    // Swap the first two, which makeAssets puts in the same tier.
    const reordered = [slugs[1]!, slugs[0]!, ...slugs.slice(2)];
    const after = computeLayout(
      { ...sceneWith(square, 9), sponsorOrder: reordered },
      assets,
    );

    expect(drawn(after)).not.toEqual(drawn(base));
    expect(drawn(after).slice(0, 2)).toEqual([slugs[1], slugs[0]]);
    // Same sponsors, only rearranged.
    expect([...drawn(after)].sort()).toEqual([...drawn(base)].sort());
  });

  it('falls back to manifest order for slugs missing from the dragged list', () => {
    const assets = makeAssets(6);
    const slugs = Object.keys(assets.meta);
    const layout = computeLayout(
      { ...sceneWith(square, 6), sponsorOrder: [slugs[3]!] },
      assets,
    );
    // The one explicitly placed slug leads its tier; the rest keep their order.
    const drawn = allPlaced(layout.strip.rows).map((p) => p.slug);
    expect(drawn).toContain(slugs[3]);
    expect(drawn).toHaveLength(6);
  });

  it('skips slugs with no metrics or no manifest entry, and ignores duplicates', () => {
    const assets = makeAssets(4);
    delete assets.meta['s02'];
    const scene = makeScene(square, {
      selectedSponsors: ['s00', 's00', 's02', 'ghost', 's01', 's03'],
    });
    const layout = computeLayout(scene, assets);
    const slugs = allPlaced(layout.strip.rows).map((p) => p.slug);
    expect(slugs).toEqual(['s00', 's01', 's03']);
  });

  it('orders the strip by tier then order, left to right and top to bottom', () => {
    const layout = computeLayout(sceneWith(square, 12), makeAssets(12));
    const assets = makeAssets(12);
    const seen = allPlaced(layout.strip.rows).map((p) => assets.meta[p.slug]!);
    for (let i = 1; i < seen.length; i += 1) {
      const prev = seen[i - 1]!;
      const cur = seen[i]!;
      expect(prev.tier < cur.tier || (prev.tier === cur.tier && prev.order < cur.order)).toBe(true);
    }
  });

  it('passes dropped slugs through from the flow', () => {
    const layout = computeLayout(sceneWith(square, 30), makeAssets(30));
    expect(layout.strip.rows.length).toBeLessThanOrEqual(MAX_SPONSOR_ROWS);
    const placed = allPlaced(layout.strip.rows).map((p) => p.slug);
    expect(placed.length + layout.strip.dropped.length).toBe(30);
    for (const slug of layout.strip.dropped) expect(placed).not.toContain(slug);
  });
});

// ---------------------------------------------------------------------------
// Image placement and clampTransform
// ---------------------------------------------------------------------------

describe('image placement', () => {
  const square = getPreset('square');
  const wide = getPreset('wide');

  it('is null when no photo is loaded', () => {
    expect(computeLayout(sceneWith(square, 3), makeAssets(3)).image).toBeNull();
  });

  it('cover-fits into the PHOTO region and crops the source', () => {
    const scene = sceneWith(square, 3, { image: { w: 4000, h: 2000 } });
    const layout = computeLayout(scene, makeAssets(3));
    const image = layout.image!;

    expect(image.dx).toBe(0);
    expect(image.dy).toBe(0);
    expect(image.dw).toBe(square.w);
    // The banner takes the rest of the canvas — D17.
    expect(image.dh).toBeCloseTo(layout.photoH, 6);
    expect(layout.photoH).toBeLessThan(square.h);

    // A 2:1 source in a region wider than it is tall keeps full width...
    const regionAspect = square.w / layout.photoH;
    expect(image.sw / image.sh).toBeCloseTo(regionAspect, 6);
  });

  it('zooms about the canvas centre', () => {
    const at1 = computeLayout(
      sceneWith(square, 3, { image: { w: 2000, h: 2000 } }),
      makeAssets(3),
    ).image!;
    const at2 = computeLayout(
      sceneWith(square, 3, { image: { w: 2000, h: 2000 }, transform: { scale: 2, dx: 0, dy: 0 } }),
      makeAssets(3),
    ).image!;

    expect(at2.sw).toBeCloseTo(at1.sw / 2, 6);
    expect(at2.sh).toBeCloseTo(at1.sh / 2, 6);
    expect(at2.sx + at2.sw / 2).toBeCloseTo(at1.sx + at1.sw / 2, 6);
    expect(at2.sy + at2.sh / 2).toBeCloseTo(at1.sy + at1.sh / 2, 6);
  });

  it('keeps the crop inside the source however far the user pans', () => {
    const source = { w: 3000, h: 1200 };
    const transforms: ImageTransform[] = [
      { scale: 1, dx: 99999, dy: 99999 },
      { scale: 1, dx: -99999, dy: -99999 },
      { scale: 3, dx: 99999, dy: -99999 },
      { scale: 2.4, dx: -1234, dy: 567 },
    ];
    for (const t of transforms) {
      for (const preset of PRESETS) {
        const image = computeLayout(
          sceneWith(preset, 3, { image: source, transform: t }),
          makeAssets(3),
        ).image!;
        expect(image.sx).toBeGreaterThanOrEqual(-EPS);
        expect(image.sy).toBeGreaterThanOrEqual(-EPS);
        expect(image.sx + image.sw).toBeLessThanOrEqual(source.w + EPS);
        expect(image.sy + image.sh).toBeLessThanOrEqual(source.h + EPS);
        expect(image.sw).toBeGreaterThan(0);
        expect(image.sh).toBeGreaterThan(0);
      }
    }
  });

  it('is null for a degenerate source', () => {
    const layout = computeLayout(sceneWith(wide, 3, { image: { w: 0, h: 100 } }), makeAssets(3));
    expect(layout.image).toBeNull();
  });
});

describe('clampTransform', () => {
  const W = 1080;
  const H = 1080;

  it('recentres to dx = dy = 0 at scale 1 when the photo matches the canvas', () => {
    const t = clampTransform({ scale: 1, dx: 400, dy: -250 }, { w: 1600, h: 1600 }, W, H);
    expect(t).toEqual({ scale: 1, dx: 0, dy: 0 });
  });

  it('allows pan only along the overhanging axis', () => {
    // 2:1 source cover-fitted to a square overhangs horizontally by 540px a side.
    const t = clampTransform({ scale: 1, dx: 9999, dy: 9999 }, { w: 2000, h: 1000 }, W, H);
    expect(t.dx).toBeCloseTo(540, 10);
    expect(t.dy).toBe(0);

    const back = clampTransform({ scale: 1, dx: -9999, dy: 0 }, { w: 2000, h: 1000 }, W, H);
    expect(back.dx).toBeCloseTo(-540, 10);
  });

  it('clamps a large pan at any zoom to the overhang', () => {
    const t = clampTransform({ scale: 2, dx: 1e6, dy: 1e6 }, { w: 1600, h: 1600 }, W, H);
    expect(t.dx).toBeCloseTo(W / 2, 10);
    expect(t.dy).toBeCloseTo(H / 2, 10);
  });

  it('clamps the zoom into [MIN_ZOOM, MAX_ZOOM] and survives rubbish input', () => {
    expect(clampTransform({ scale: 99, dx: 0, dy: 0 }, { w: 800, h: 800 }, W, H).scale).toBe(MAX_ZOOM);
    expect(clampTransform({ scale: 0.1, dx: 0, dy: 0 }, { w: 800, h: 800 }, W, H).scale).toBe(
      MIN_ZOOM,
    );
    expect(clampTransform({ scale: NaN, dx: NaN, dy: NaN }, { w: 800, h: 800 }, W, H)).toEqual({
      scale: MIN_ZOOM,
      dx: 0,
      dy: 0,
    });
  });

  it('leaves an in-range transform untouched', () => {
    const t: ImageTransform = { scale: 1.5, dx: 100, dy: -80 };
    expect(clampTransform(t, { w: 2000, h: 2000 }, W, H)).toEqual(t);
  });

  it('zeroes the pan for a degenerate source', () => {
    expect(clampTransform({ scale: 2, dx: 50, dy: 50 }, { w: 0, h: 0 }, W, H)).toEqual({
      scale: 2,
      dx: 0,
      dy: 0,
    });
  });
});

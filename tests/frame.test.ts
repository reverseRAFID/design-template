import { describe, expect, it } from 'vitest';

import { computeFrame } from '@/engine/frame';
import {
  CARD_CHAMFER,
  CARD_INSET,
  CARD_STROKE,
  CARD_STROKE_MIN_PX,
  FRAME_MARGIN_FACTOR,
  MARGIN,
} from '@/engine/metrics';
import { PRESETS } from '@/engine/presets';

/**
 * The frame is a CHAMFERED panel — one cut-cornered container holding photo and
 * banner on an ink ground (docs/DECISIONS.md D20, D25). The HUD viewport's
 * openings and telemetry labels are gone, so there is nothing left to test there.
 */
describe('computeFrame — the card', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s', (_id, preset) => {
    const { w: W, h: H } = preset;
    const S = Math.min(W, H);
    const g = computeFrame(W, H, { isOg: preset.id === 'og' });

    // Inset evenly on all four sides.
    expect(g.inset).toBeCloseTo(CARD_INSET * S, 10);
    expect(g.rect.x).toBeCloseTo(g.inset, 10);
    expect(g.rect.y).toBeCloseTo(g.inset, 10);
    expect(g.rect.w).toBeCloseTo(W - 2 * g.inset, 10);
    expect(g.rect.h).toBeCloseTo(H - 2 * g.inset, 10);

    // The card stays inside the canvas.
    expect(g.rect.x).toBeGreaterThan(0);
    expect(g.rect.x + g.rect.w).toBeLessThan(W);
    expect(g.rect.y + g.rect.h).toBeLessThan(H);

    // All four corners are cut, by a chamfer that cannot reach the card's middle.
    expect(g.shape.chamfer).toBeCloseTo(
      Math.min(CARD_CHAMFER * S, Math.min(g.rect.w, g.rect.h) / 3),
      10,
    );
    expect(g.shape.chamfer).toBeGreaterThan(0);
    expect(g.shape.cut).toEqual({ tl: true, tr: true, bl: true, br: true });

    // One orange accent per corner, each tracing edge -> cut -> edge, and every
    // point sitting ON the card's boundary rather than floating off it.
    expect(g.brackets).toHaveLength(4);
    expect(new Set(g.brackets.map((b) => b.corner)).size).toBe(4);
    for (const bracket of g.brackets) {
      expect(bracket.points).toHaveLength(4);
      for (const point of bracket.points) {
        expect(point.x).toBeGreaterThanOrEqual(g.rect.x - 1e-9);
        expect(point.x).toBeLessThanOrEqual(g.rect.x + g.rect.w + 1e-9);
        expect(point.y).toBeGreaterThanOrEqual(g.rect.y - 1e-9);
        expect(point.y).toBeLessThanOrEqual(g.rect.y + g.rect.h + 1e-9);
      }
    }

    expect(g.stroke).toBeGreaterThanOrEqual(CARD_STROKE_MIN_PX);
    expect(g.stroke).toBeCloseTo(Math.max(CARD_STROKE_MIN_PX, CARD_STROKE * S), 10);

    // Overlays sit inside the card, so the effective margin clears its edge.
    expect(g.effectiveMargin).toBeCloseTo(g.inset + MARGIN * S * FRAME_MARGIN_FACTOR, 10);
    expect(g.effectiveMargin).toBeGreaterThan(g.inset);
    expect(g.effectiveMargin).toBeGreaterThan(MARGIN * S * FRAME_MARGIN_FACTOR);
  });

  it('scales every dimension with the shorter side', () => {
    const small = computeFrame(600, 600, { isOg: false });
    const large = computeFrame(1200, 1200, { isOg: false });
    expect(large.inset).toBeCloseTo(small.inset * 2, 6);
    expect(large.shape.chamfer).toBeCloseTo(small.shape.chamfer * 2, 6);
    expect(large.effectiveMargin).toBeCloseTo(small.effectiveMargin * 2, 6);
  });

  it('mats only the og preset', () => {
    expect(computeFrame(1200, 630, { isOg: true }).mat).toBeGreaterThan(0);
    expect(computeFrame(1080, 1080, { isOg: false }).mat).toBe(0);
  });

  it('enforces a minimum stroke on a tiny canvas', () => {
    // 0.0018 × 200 is under a pixel; a hairline that thin disappears entirely.
    expect(computeFrame(200, 200, { isOg: false }).stroke).toBe(CARD_STROKE_MIN_PX);
  });

  it('does not invert on a canvas smaller than two insets', () => {
    const g = computeFrame(40, 40, { isOg: false });
    expect(g.rect.w).toBeGreaterThan(0);
    expect(g.rect.h).toBeGreaterThan(0);
    expect(g.shape.chamfer).toBeGreaterThanOrEqual(0);
  });
});

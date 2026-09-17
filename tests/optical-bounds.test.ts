import { describe, expect, it } from 'vitest';

import { aspectOf, DEFAULT_ALPHA_THRESHOLD, opticalBounds } from '@/assets/optical-bounds';
import type { PixelData } from '@/engine/types';

/** Blank RGBA buffer: colour channels are irrelevant, only alpha is scanned. */
function buffer(width: number, height: number, alpha = 0): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (alpha > 0) {
    for (let i = 3; i < data.length; i += 4) data[i] = alpha;
  }
  return { width, height, data };
}

/** Paint an INCLUSIVE pixel rect x0..x1, y0..y1 at the given alpha. */
function paint(
  px: PixelData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  alpha: number,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      px.data[(y * px.width + x) * 4 + 3] = alpha;
    }
  }
}

describe('opticalBounds', () => {
  it('returns inclusive pixel bounds as fractions of the source', () => {
    // Columns 20..60 = 41 px wide, rows 30..50 = 21 px tall, on a 100x100 raster.
    const px = buffer(100, 100);
    paint(px, 20, 30, 60, 50, 255);

    const b = opticalBounds(px);
    expect(b.x).toBeCloseTo(0.2, 10);
    expect(b.y).toBeCloseTo(0.3, 10);
    expect(b.w).toBeCloseTo(0.41, 10);
    expect(b.h).toBeCloseTo(0.21, 10);
  });

  it('scales the box by each axis independently on a non-square raster', () => {
    const px = buffer(200, 50);
    paint(px, 10, 5, 19, 14, 255); // 10 px square of ink

    const b = opticalBounds(px);
    expect(b.x).toBeCloseTo(0.05, 10);
    expect(b.w).toBeCloseTo(0.05, 10);
    expect(b.y).toBeCloseTo(0.1, 10);
    expect(b.h).toBeCloseTo(0.2, 10);
  });

  it('returns the full box for a fully opaque buffer', () => {
    expect(opticalBounds(buffer(16, 9, 255))).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('returns the full box for a fully transparent buffer (documented fallback)', () => {
    // Never zero-area — the layout divides by this rect.
    expect(opticalBounds(buffer(16, 9, 0))).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('returns the full box for a degenerate buffer', () => {
    expect(opticalBounds({ width: 0, height: 0, data: [] })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('finds a single opaque pixel', () => {
    const px = buffer(10, 10);
    paint(px, 4, 7, 4, 7, 255);

    expect(opticalBounds(px)).toEqual({ x: 0.4, y: 0.7, w: 0.1, h: 0.1 });
  });

  it('excludes alpha at or under the threshold and includes alpha over it', () => {
    const px = buffer(10, 10);
    paint(px, 0, 0, 9, 9, DEFAULT_ALPHA_THRESHOLD - 1); // 7: dust
    paint(px, 2, 2, 3, 3, DEFAULT_ALPHA_THRESHOLD); // 8: equal, still excluded
    paint(px, 5, 6, 6, 7, DEFAULT_ALPHA_THRESHOLD + 1); // 9: ink

    expect(opticalBounds(px)).toEqual({ x: 0.5, y: 0.6, w: 0.2, h: 0.2 });
  });

  it('honours a custom threshold', () => {
    const px = buffer(10, 10);
    paint(px, 1, 1, 8, 8, 100);
    paint(px, 3, 3, 6, 6, 200);

    expect(opticalBounds(px)).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(opticalBounds(px, 150)).toEqual({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
  });

  it('unions disjoint blobs into one box', () => {
    const px = buffer(20, 20);
    paint(px, 1, 2, 2, 3, 255);
    paint(px, 15, 16, 17, 18, 255);

    const b = opticalBounds(px);
    expect(b).toEqual({ x: 1 / 20, y: 2 / 20, w: 17 / 20, h: 17 / 20 });
  });

  it('accepts a plain number[] buffer', () => {
    const px: PixelData = { width: 2, height: 2, data: new Array<number>(16).fill(0) };
    px.data[(1 * 2 + 1) * 4 + 3] = 255;

    expect(opticalBounds(px)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });
});

describe('aspectOf', () => {
  it('reports the optical box aspect of a wide box', () => {
    // 0.5 * 400 = 200 px wide, 0.25 * 400 = 100 px tall.
    expect(aspectOf({ x: 0, y: 0, w: 0.5, h: 0.25 }, 400, 400)).toBeCloseTo(2, 10);
  });

  it('reports the optical box aspect of a tall box', () => {
    expect(aspectOf({ x: 0, y: 0, w: 0.25, h: 0.5 }, 400, 400)).toBeCloseTo(0.5, 10);
  });

  it('accounts for a non-square source raster', () => {
    // A full-height, half-width box on a 200x100 raster is 100 x 100 px: square.
    expect(aspectOf({ x: 0, y: 0, w: 0.5, h: 1 }, 200, 100)).toBeCloseTo(1, 10);
  });

  it('falls back to 1 instead of dividing by zero', () => {
    expect(aspectOf({ x: 0, y: 0, w: 0.5, h: 0 }, 100, 100)).toBe(1);
    expect(aspectOf({ x: 0, y: 0, w: 0, h: 0.5 }, 100, 100)).toBe(1);
    expect(aspectOf({ x: 0, y: 0, w: 1, h: 1 }, 100, 0)).toBe(1);
    expect(aspectOf({ x: 0, y: 0, w: 1, h: 1 }, Number.NaN, 100)).toBe(1);
  });

  it('round-trips a measured box back to its pixel aspect', () => {
    const px = buffer(100, 100);
    paint(px, 20, 30, 60, 50, 255); // 41 x 21 px of ink

    expect(aspectOf(opticalBounds(px), 100, 100)).toBeCloseTo(41 / 21, 10);
  });
});

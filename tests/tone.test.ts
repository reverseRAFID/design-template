import { describe, expect, it } from 'vitest';
import { detectTone, meanLuminance } from '@/engine/tone';
import { relativeLuminance } from '@/lib/luminance';
import { MARGIN, TONE_TOP_BOX_W, TONE_WEIGHTS, TOP_LOGO_H } from '@/engine/metrics';
import { TONE_THRESHOLD } from '@/engine/types';
import type { PixelData, Rect } from '@/engine/types';

// The brand cream. Never pure #FFFFFF — see CLAUDE.md rule 1.
const CREAM: RGBA = [244, 243, 238, 255];
const BLACK: RGBA = [0, 0, 0, 255];
const TRANSPARENT: RGBA = [0, 0, 0, 0];

type RGBA = [number, number, number, number];

function makePixels(width: number, height: number, at: (x: number, y: number) => RGBA): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = at(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

function solid(width: number, height: number, colour: RGBA): PixelData {
  return makePixels(width, height, () => colour);
}

function grey(level: number): RGBA {
  return [level, level, level, 255];
}

const W = 400;
const H = 400;
const MID = H / 2;

/**
 * The boxes the layout actually samples: top-left and top-right only.
 *
 * § E also specifies a bottom band, but the sponsor banner is opaque and covers
 * it — tone decides the two TOP logos alone now (docs/DECISIONS.md D17).
 */
function toneRegions(): Rect[] {
  const S = Math.min(W, H);
  const m = MARGIN * S;
  const boxW = TONE_TOP_BOX_W * W;
  const boxH = TOP_LOGO_H * S;
  return [
    { x: m, y: m, w: boxW, h: boxH },
    { x: W - m - boxW, y: m, w: boxW, h: boxH },
  ];
}

const WEIGHTS = [...TONE_WEIGHTS];

describe('meanLuminance', () => {
  it('returns 0 for a zero-area region', () => {
    const pixels = solid(10, 10, CREAM);
    expect(meanLuminance(pixels, { x: 0, y: 0, w: 0, h: 10 })).toBe(0);
    expect(meanLuminance(pixels, { x: 0, y: 0, w: 10, h: 0 })).toBe(0);
  });

  it('returns 0 for a region entirely outside the buffer', () => {
    expect(meanLuminance(solid(10, 10, CREAM), { x: 50, y: 50, w: 10, h: 10 })).toBe(0);
  });

  it('clamps an oversized region to the buffer instead of reading out of bounds', () => {
    const pixels = solid(8, 8, CREAM);
    const clamped = meanLuminance(pixels, { x: -100, y: -100, w: 400, h: 400 });
    expect(clamped).toBeCloseTo(relativeLuminance(244, 243, 238), 6);
  });

  it('ignores fully transparent pixels rather than counting them as black', () => {
    // Left half cream, right half transparent: the mean must stay at cream.
    const pixels = makePixels(64, 64, (x) => (x < 32 ? CREAM : TRANSPARENT));
    const mean = meanLuminance(pixels, { x: 0, y: 0, w: 64, h: 64 });
    expect(mean).toBeCloseTo(relativeLuminance(244, 243, 238), 6);
  });

  it('returns 0 when every sampled pixel is transparent', () => {
    expect(meanLuminance(solid(16, 16, TRANSPARENT), { x: 0, y: 0, w: 16, h: 16 })).toBe(0);
  });

  it('strides over a large region and still reports the right mean', () => {
    // Far more than the 4000-sample cap, so this exercises the stepped path.
    const pixels = solid(1920, 1080, CREAM);
    expect(meanLuminance(pixels, { x: 0, y: 0, w: 1920, h: 1080 })).toBeCloseTo(
      relativeLuminance(244, 243, 238),
      6,
    );
  });

  it('is deterministic — repeated calls agree exactly', () => {
    const pixels = makePixels(900, 900, (x, y) => grey((x * 7 + y * 13) % 256));
    const region: Rect = { x: 10, y: 10, w: 800, h: 800 };
    expect(meanLuminance(pixels, region)).toBe(meanLuminance(pixels, region));
  });
});

describe('detectTone', () => {
  it('calls an all-black image dark', () => {
    expect(detectTone(solid(W, H, BLACK), toneRegions(), WEIGHTS)).toBe('dark');
  });

  it('calls an all-cream image light', () => {
    expect(detectTone(solid(W, H, CREAM), toneRegions(), WEIGHTS)).toBe('light');
  });

  it('weights the bottom band at 0.4 — bright bottom alone is not enough for light', () => {
    // 0.3·0 + 0.3·0 + 0.4·0.895 ≈ 0.358 < 0.52
    const pixels = makePixels(W, H, (_x, y) => (y >= MID ? CREAM : BLACK));
    expect(detectTone(pixels, toneRegions(), WEIGHTS)).toBe('dark');
  });

  it('two bright top boxes (0.6 combined) tip the verdict to light', () => {
    // 0.6·0.895 ≈ 0.537 >= 0.52
    const pixels = makePixels(W, H, (_x, y) => (y < MID ? CREAM : BLACK));
    expect(detectTone(pixels, toneRegions(), WEIGHTS)).toBe('light');
  });

  it('flips at the threshold: grey 190 is dark, grey 191 is light', () => {
    expect(relativeLuminance(190, 190, 190)).toBeLessThan(TONE_THRESHOLD);
    expect(relativeLuminance(191, 191, 191)).toBeGreaterThanOrEqual(TONE_THRESHOLD);
    expect(detectTone(solid(W, H, grey(190)), toneRegions(), WEIGHTS)).toBe('dark');
    expect(detectTone(solid(W, H, grey(191)), toneRegions(), WEIGHTS)).toBe('light');
  });

  it('does not let transparent pixels drag a light photo into dark', () => {
    // Cream where opaque, transparent elsewhere — a PNG with a knocked-out background.
    const pixels = makePixels(W, H, (x, y) => ((x + y) % 2 === 0 ? CREAM : TRANSPARENT));
    expect(detectTone(pixels, toneRegions(), WEIGHTS)).toBe('light');
  });

  it('normalises weights that do not sum to 1', () => {
    const pixels = makePixels(W, H, (_x, y) => (y < MID ? CREAM : BLACK));
    const scaled = WEIGHTS.map((w) => w * 10);
    expect(detectTone(pixels, toneRegions(), scaled)).toBe(
      detectTone(pixels, toneRegions(), WEIGHTS),
    );
  });

  it('falls back to dark when there are no usable regions', () => {
    expect(detectTone(solid(W, H, CREAM), [], [])).toBe('dark');
  });

  it('throws when regions and weights differ in length', () => {
    const pixels = solid(W, H, CREAM);
    // toneRegions() is 2 long, so 3 weights is the mismatch to assert on.
    expect(() => detectTone(pixels, toneRegions(), [0.3, 0.3, 0.4])).toThrow(
      /same length/i,
    );
    expect(() => detectTone(pixels, [], [1])).toThrow(/same length/i);
  });
});

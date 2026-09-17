/**
 * Auto tone detection (docs/02-DESIGN-SYSTEM.md § E → "Auto tone detection").
 *
 * Mean relative luminance over the sampling boxes the layout hands us, weighted
 * 0.3 / 0.3 / 0.4, compared against TONE_THRESHOLD. Pure TypeScript: the caller
 * reads the pixels, this module only does arithmetic.
 */

import { relativeLuminance } from '@/lib/luminance';
import { TONE_THRESHOLD } from './types';
import type { PixelData, Rect, Tone } from './types';

/** Work cap per region — a 1920×1080 bottom band is ~500k pixels, far more than the mean needs. */
const MAX_SAMPLES_PER_REGION = 4000;

/**
 * Mean relative luminance of `region`, clamped to the buffer. Fully transparent
 * pixels are ignored (an empty canvas must not read as pitch black); returns 0
 * when nothing was sampled.
 */
export function meanLuminance(pixels: PixelData, region: Rect): number {
  const { width, height, data } = pixels;
  if (width <= 0 || height <= 0) return 0;

  // Normalise, so a negative w/h can never produce an inverted loop.
  const left = Math.min(region.x, region.x + region.w);
  const right = Math.max(region.x, region.x + region.w);
  const top = Math.min(region.y, region.y + region.h);
  const bottom = Math.max(region.y, region.y + region.h);

  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(width, Math.ceil(right));
  const y1 = Math.min(height, Math.ceil(bottom));
  if (x1 <= x0 || y1 <= y0) return 0;

  const step = sampleStep((x1 - x0) * (y1 - y0));

  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += step) {
    const rowStart = y * width;
    for (let x = x0; x < x1; x += step) {
      const i = (rowStart + x) * 4;
      const a = data[i + 3];
      if (a === undefined || a === 0) continue;
      sum += relativeLuminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      count += 1;
    }
  }

  return count === 0 ? 0 : sum / count;
}

/** Deterministic stride that keeps a region under the sample cap. */
function sampleStep(area: number): number {
  if (area <= MAX_SAMPLES_PER_REGION) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(area / MAX_SAMPLES_PER_REGION)));
}

/**
 * Weighted tone verdict over the layout's sampling boxes. `weights` are
 * normalised here, so callers can pass the raw TONE_WEIGHTS tuple.
 */
export function detectTone(pixels: PixelData, regions: Rect[], weights: number[]): Tone {
  if (regions.length !== weights.length) {
    throw new Error(
      `detectTone: regions and weights must be the same length (got ${regions.length} regions, ${weights.length} weights)`,
    );
  }

  let weightSum = 0;
  let weighted = 0;
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const weight = weights[i];
    if (region === undefined || weight === undefined || weight <= 0) continue;
    weighted += meanLuminance(pixels, region) * weight;
    weightSum += weight;
  }

  // No usable regions — fall through to the same branch as a dark result, which
  // is the safer default (cream artwork on an unknown photo).
  if (weightSum <= 0) return 'dark';

  return weighted / weightSum >= TONE_THRESHOLD ? 'light' : 'dark';
}

/**
 * Auto tone detection, shared by the live preview and the batch export.
 *
 * Extracted from `use-composition` so a headless batch render can reach the same
 * verdict the preview would — the PRD asks batch mode to auto-detect tone per
 * image, and two implementations would eventually disagree.
 *
 * It needs a Layout because the boxes it samples ARE the boxes the logos will
 * occupy (`layout.toneRegions`) and the photo it samples is the cover-fitted one
 * `layout.image` describes.
 */

import { detectTone } from '@/engine/tone';
import type { Layout, Rect, Tone } from '@/engine/types';

/** Width of the tone sampling raster (docs/03-ARCHITECTURE.md § Tone detection). */
export const TONE_SAMPLE_WIDTH = 128;

/** Anything canvas can draw. Mirrors the store's own field. */
type Photo = CanvasImageSource;

interface SampleCtx {
  canvas: { width: number; height: number };
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}

/** One scratch surface for the whole session — tone runs on every pan/zoom rest. */
let scratch: SampleCtx | null = null;

function scratchContext(w: number, h: number): SampleCtx | null {
  if (!scratch) {
    const options = { willReadFrequently: true } as const;
    if (typeof OffscreenCanvas !== 'undefined') {
      scratch = (new OffscreenCanvas(w, h).getContext('2d', options) as SampleCtx | null) ?? null;
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      scratch = (canvas.getContext('2d', options) as SampleCtx | null) ?? null;
    }
  }
  if (!scratch) return null;
  if (scratch.canvas.width !== w) scratch.canvas.width = w;
  if (scratch.canvas.height !== h) scratch.canvas.height = h;
  return scratch;
}

function scaleRect(rect: Rect, factor: number): Rect {
  return { x: rect.x * factor, y: rect.y * factor, w: rect.w * factor, h: rect.h * factor };
}

/**
 * Draws the photo ALONE (no overlays — they would bias their own sampling boxes)
 * into a small raster and asks the engine for a verdict. Null when the sample
 * could not be taken, in which case the tone is simply left alone.
 */
export function sampleTone(layout: Layout, photo: Photo): Tone | null {
  const placement = layout.image;
  if (!placement || layout.W <= 0 || layout.H <= 0) return null;

  const w = TONE_SAMPLE_WIDTH;
  const h = Math.max(1, Math.round((w * layout.H) / layout.W));
  const ctx = scratchContext(w, h);
  if (!ctx) return null;

  try {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(
      photo,
      placement.sx,
      placement.sy,
      placement.sw,
      placement.sh,
      0,
      0,
      w,
      h,
    );
    const pixels = ctx.getImageData(0, 0, w, h);
    const factor = w / layout.W;
    const regions = layout.toneRegions.regions.map((rect) => scaleRect(rect, factor));
    return detectTone(pixels, regions, [...layout.toneRegions.weights]);
  } catch {
    // A tainted or zero-sized surface must never break the preview.
    return null;
  }
}

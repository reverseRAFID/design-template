/**
 * Alpha bounding-box scan (docs/03-ARCHITECTURE.md § loader, docs/02-DESIGN-SYSTEM.md § 155).
 *
 * Logo files ship with wildly different transparent padding, so the layout aligns on
 * real ink instead of the file box. The result is expressed as fractions of the source
 * raster so it survives any later re-raster at a different pixel size.
 *
 * Bounds convention: INCLUSIVE pixel bounds. A block covering columns 20..60 of a
 * 100px-wide raster yields x = 20/100 and w = (60 - 20 + 1)/100 = 0.41 — the box
 * contains the last opaque column, it does not stop at its left edge.
 */

import type { PixelData, Rect01 } from '@/engine/types';

/** Alpha must EXCEED this to count as ink. 8/255 ignores anti-aliasing dust and JPEG-ish fringes. */
export const DEFAULT_ALPHA_THRESHOLD = 8;

/**
 * Fallback for an empty or degenerate buffer. Never zero-area: the layout divides by
 * the optical box to map a placed rect back onto the source raster.
 */
const FULL_BOX: Rect01 = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Tight bounding box of the pixels whose alpha exceeds `alphaThreshold`, as fractions
 * (0..1) of the source dimensions. A fully transparent buffer returns the full box.
 */
export function opticalBounds(
  pixels: PixelData,
  alphaThreshold: number = DEFAULT_ALPHA_THRESHOLD,
): Rect01 {
  const { width, height, data } = pixels;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...FULL_BOX };
  }

  let minX = width;
  let maxX = -1;
  let minY = -1;
  let maxY = -1;

  // One pass over the rows. Each row costs two scans that break at the first ink they
  // meet, so a solid raster is O(height) and only fully transparent rows cost a full
  // width — never the four edge-walking passes the naive version would need.
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;

    let rowLeft = -1;
    for (let x = 0; x < width; x++) {
      if ((data[row + x * 4 + 3] ?? 0) > alphaThreshold) {
        rowLeft = x;
        break;
      }
    }
    if (rowLeft < 0) continue; // transparent row: cannot move any edge

    // Walk back from the right, stopping at rowLeft — we already know there is ink there.
    let rowRight = rowLeft;
    for (let x = width - 1; x > rowLeft; x--) {
      if ((data[row + x * 4 + 3] ?? 0) > alphaThreshold) {
        rowRight = x;
        break;
      }
    }

    if (rowLeft < minX) minX = rowLeft;
    if (rowRight > maxX) maxX = rowRight;
    if (minY < 0) minY = y;
    maxY = y;
  }

  if (maxX < 0 || maxY < 0) return { ...FULL_BOX };

  return {
    x: minX / width,
    y: minY / height,
    w: (maxX - minX + 1) / width,
    h: (maxY - minY + 1) / height,
  };
}

/**
 * True pixel aspect ratio (w / h) of an optical box on a raster of `srcW` × `srcH`.
 * Falls back to 1 rather than Infinity/NaN, which would poison the sponsor flow.
 */
export function aspectOf(bounds: Rect01, srcW: number, srcH: number): number {
  const w = bounds.w * srcW;
  const h = bounds.h * srcH;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
  return w / h;
}

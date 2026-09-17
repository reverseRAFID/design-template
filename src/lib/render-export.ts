/**
 * Render a scene to a blob at full preset resolution.
 *
 * Extracted from `use-export` so the single-image download, the multi-preset ZIP
 * and the batch ZIP all go through ONE path. Nothing here is React-aware, and
 * nothing here is preview-aware: `devicePixelRatio` is ignored outright
 * (CLAUDE.md rule 6) — the backing store IS the preset's pixel size and the
 * context is never scaled, so the output is the layout at 1:1.
 *
 * Two things must be ready before the first pixel is drawn, because the renderer
 * silently skips what is not: the mono face (or the frame's telemetry labels go
 * missing) and every logo raster at the export-size buckets (or a logo does).
 * Both are awaited, and a raster that never arrives fails loudly rather than
 * shipping an image the preview did not show.
 */

import { computeLayout } from '@/engine/layout';
import { renderComposition } from '@/engine/render';
import { readPalette } from '@/lib/palette';
import type { AssetBundle } from '@/assets/loader';
import type { Artwork, Ctx2D, Drawable, Layout, PlacedLogo, Scene } from '@/engine/types';

export type ExportFormat = 'png' | 'jpg';

/** JPG quality, per PRD § F7. */
const JPEG_QUALITY = 0.92;

/** How long to wait for the last logo raster before giving up. */
const RASTER_TIMEOUT_MS = 8000;

/** Backstop for a raster that lands without notifying (belt and braces). */
const RASTER_POLL_MS = 120;

const MIME: Record<ExportFormat, string> = { png: 'image/png', jpg: 'image/jpeg' };

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

interface ExportSurface {
  ctx: Ctx2D;
  toBlob: (type: string, quality: number) => Promise<Blob | null>;
}

/** OffscreenCanvas where available, a detached <canvas> otherwise. */
function exportSurface(w: number, h: number): ExportSurface | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      return { ctx, toBlob: (type, quality) => canvas.convertToBlob({ type, quality }) };
    }
  }

  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  return {
    ctx,
    toBlob: (type, quality) =>
      new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, type, quality);
      }),
  };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // An engine without the API must not block the export; the labels are
    // monospace with a system fallback either way.
  }
}

interface RasterRequest {
  slug: string;
  artwork: Artwork;
  h: number;
}

/** Every (slug, tone, height) the render will ask for, deduplicated. */
function requiredRasters(layout: Layout): RasterRequest[] {
  const seen = new Set<string>();
  const requests: RasterRequest[] = [];

  const add = (logo: PlacedLogo): void => {
    if (!(logo.w > 0) || !(logo.h > 0)) return;
    const key = `${logo.slug}|${logo.artwork}|${logo.h}`;
    if (seen.has(key)) return;
    seen.add(key);
    requests.push({ slug: logo.slug, artwork: logo.artwork, h: logo.h });
  };

  add(layout.top.bracu);
  add(layout.top.mongoltori);
  for (const row of layout.strip.rows) for (const logo of row) add(logo);
  return requests;
}

/**
 * Resolves with the slugs still missing when the deadline passes. Asking for a
 * raster is also what starts it, so the first pass both probes and primes.
 */
function awaitRasters(
  bundle: AssetBundle,
  requests: RasterRequest[],
  timeoutMs: number,
): Promise<string[]> {
  const pending = (): RasterRequest[] =>
    requests.filter((r) => bundle.raster(r.slug, r.artwork, r.h) === null);

  let missing = pending();
  if (missing.length === 0) return Promise.resolve([]);

  return new Promise<string[]>((resolve) => {
    let unsubscribe: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finish = (result: string[]): void => {
      if (settled) return;
      settled = true;
      if (unsubscribe) unsubscribe();
      if (poll !== null) clearInterval(poll);
      if (deadline !== null) clearTimeout(deadline);
      resolve(result);
    };

    const check = (): void => {
      if (settled) return;
      missing = pending();
      if (missing.length === 0) finish([]);
    };

    unsubscribe = bundle.onRaster(check);
    poll = setInterval(check, RASTER_POLL_MS);
    deadline = setTimeout(() => finish([...new Set(missing.map((r) => r.slug))]), timeoutMs);
    check();
  });
}

// ---------------------------------------------------------------------------
// The one render path
// ---------------------------------------------------------------------------

export interface RenderJob {
  scene: Scene;
  bundle: AssetBundle;
  /** The photo. Omitted for the overlay-only mode, or when none is loaded. */
  photo?: Drawable | null | undefined;
  format: ExportFormat;
  /**
   * Draw the brand layer alone on transparency, for dropping over video in
   * Premiere or CapCut (PRD Phase 2 § "Logo-only mode"). Forces PNG at the
   * caller's discretion — a JPG has no alpha to preserve.
   */
  overlayOnly?: boolean | undefined;
}

export async function renderToBlob(job: RenderJob): Promise<Blob> {
  const { scene, bundle, photo, format, overlayOnly } = job;

  const layout = computeLayout(scene, {
    bracu: bundle.bracu,
    mongoltori: bundle.mongoltori,
    sponsors: bundle.sponsors,
    meta: bundle.meta,
  });

  const surface = exportSurface(layout.W, layout.H);
  if (!surface) throw new Error('This browser cannot open a canvas to export into.');

  await waitForFonts();
  const missing = await awaitRasters(bundle, requiredRasters(layout), RASTER_TIMEOUT_MS);
  if (missing.length > 0) {
    // Exporting anyway would silently drop a logo the preview showed.
    throw new Error(`Logo artwork never finished loading: ${missing.join(', ')}`);
  }

  renderComposition(surface.ctx, {
    scene,
    layout,
    palette: readPalette(),
    rasters: bundle.raster,
    image: overlayOnly ? null : photo,
    fontsReady: true,
    overlayOnly: overlayOnly ?? false,
  });

  const blob = await surface.toBlob(MIME[format], JPEG_QUALITY);
  if (!blob) throw new Error('The browser returned no image data.');
  return blob;
}

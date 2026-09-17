/**
 * The asset pipeline (docs/03-ARCHITECTURE.md § Asset loading).
 *
 * Two separate jobs, deliberately not conflated:
 *
 * 1. **Measure, once.** Each logo is rasterised small (256px tall) purely to find
 *    its alpha bounding box. The layout aligns on real ink, so this has to happen
 *    before the first frame — hence `loadAssets` awaits it.
 * 2. **Rasterise, lazily.** SVGs drawn at the wrong scale render soft, so every
 *    (slug, tone, height-bucket) gets its own `ImageBitmap`. The renderer is
 *    synchronous, so a cache miss returns null and fires the work off; subscribers
 *    redraw when it lands.
 */

import { toMeta as toCustomMeta } from './custom-sponsors';
import type { CustomSponsor } from './custom-sponsors';
import { aspectOf, opticalBounds } from './optical-bounds';
import { loadManifest, resolveBaseUrl } from './manifest';
import type { SponsorManifest } from './manifest';
import type {
  Artwork,
  Drawable,
  LogoMetrics,
  RasterProvider,
  Rect01,
  SponsorMeta,
  Tone,
} from '@/engine/types';

/** Height the measuring raster is scaled to. Big enough for a tight box, cheap enough for 18 logos. */
const MEASURE_HEIGHT = 256;

/** Raster heights are quantised to this, so pan/zoom does not thrash the cache. */
const BUCKET_STEP = 8;

/**
 * Ceiling on the rasterised FILE height.
 *
 * The file is rasterised large enough that its optical box lands at the requested
 * size, and a logo sitting in a mostly-empty 1080-square needs a file 5× taller
 * than the ink. This stops a pathological file from asking for a 20000px bitmap.
 */
const MAX_FILE_RASTER = 4096;

/** Guard against dividing by a degenerate optical box. */
const MIN_OPTICAL_FRACTION = 0.02;

/** Brand logos ship a tone pair; sponsors ship colour art (plus an ink fallback). */
const BRAND_ARTWORK: readonly Artwork[] = ['light', 'dark'];

/** Never zero-area: the renderer divides by the optical box to map back onto the raster. */
const FULL_BOX: Rect01 = { x: 0, y: 0, w: 1, h: 1 };

export interface LoadedLogo {
  metrics: LogoMetrics;
  sources: Partial<Record<Artwork, Blob>>;
}

export type RasterListener = () => void;

export interface AssetBundle {
  bracu: LogoMetrics;
  mongoltori: LogoMetrics;
  /** Keyed by slug, in tier-then-order sequence. */
  sponsors: Record<string, LogoMetrics>;
  meta: Record<string, SponsorMeta>;
  manifest: SponsorManifest;
  /** True when any logo fell back to placeholder art or is flagged in the manifest. */
  anyPlaceholder: boolean;
  raster: RasterProvider;
  /** Subscribe to late-arriving rasters. Returns an unsubscribe. */
  onRaster: (listener: RasterListener) => () => void;
  /** Resolves once every logo's optical metrics are measured. */
  ready: Promise<void>;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Where an artwork file lives. The naming convention is the contract with whoever
 * adds a sponsor, so it is spelled out in one place:
 *
 *   brand/<slug>-light.svg           the two top logos, cream artwork
 *   brand/<slug>-dark.svg            the two top logos, ink artwork
 *   brand/sponsors/<slug>-color.svg  a sponsor's brand artwork (or .png)
 *   brand/sponsors/<slug>-dark.png   ink fallback, only for light sponsor artwork
 */
function assetUrl(
  base: string,
  slug: string,
  artwork: Artwork,
  sponsor: boolean,
  ext: string,
  /** Data URL, for a logo uploaded through the app rather than committed. */
  uploaded?: string,
): string {
  // An uploaded logo has no file on disk; its data URL IS the source, and `fetch`
  // handles data: the same as any other URL.
  if (uploaded) return uploaded;
  if (!sponsor) return `${base}brand/${slug}-${artwork}.svg`;
  if (artwork === 'color') return `${base}brand/sponsors/${slug}-color.${ext}`;
  return `${base}brand/sponsors/${slug}-${artwork}.png`;
}

function placeholderUrl(base: string, tone: Tone): string {
  return `${base}brand/placeholder-${tone}.svg`;
}

/** Null on any failure — a missing sponsor logo must never take the whole app down. */
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rasterising + measuring
// ---------------------------------------------------------------------------

/** The slice of a 2D context measurement needs, so either canvas flavour fits. */
interface Measurable {
  drawImage(image: ImageBitmap, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}

function measuringContext(w: number, h: number): Measurable | null {
  const options = { willReadFrequently: true } as const;
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(w, h).getContext('2d', options);
    return (ctx as Measurable | null) ?? null;
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return (canvas.getContext('2d', options) as Measurable | null) ?? null;
}

/** A canvas of either flavour, plus its context, for compositing. */
interface Surface {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

function surface(w: number, h: number): Surface | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

/** Aspect from the viewBox, falling back to width/height, then square. */
function svgAspect(text: string): number {
  const viewBox = /viewBox\s*=\s*"([^"]+)"/i.exec(text);
  if (viewBox?.[1]) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    const [, , vw, vh] = parts;
    if (parts.length === 4 && vw && vh && vw > 0 && vh > 0) return vw / vh;
  }
  const w = Number(/\bwidth\s*=\s*"([\d.]+)/i.exec(text)?.[1]);
  const h = Number(/\bheight\s*=\s*"([\d.]+)/i.exec(text)?.[1]);
  if (w > 0 && h > 0) return w / h;
  return 1;
}

/**
 * Rasterise an SVG through an `<img>` rather than `createImageBitmap`.
 *
 * docs/03-ARCHITECTURE.md prescribes `createImageBitmap(svgBlob, { resizeHeight })`,
 * but **Chrome cannot decode an SVG blob that way** — it throws
 * `InvalidStateError: The source image could not be decoded`. Since Chrome is the
 * team's browser, the documented recipe would have shipped an app that draws no
 * logos at all. See docs/DECISIONS.md D11.
 *
 * The SVG's own width/height are overwritten with the target pixel size before
 * loading, so the browser rasterises the *vector* at that scale. Without it an
 * `<img>` holding a viewBox-only SVG falls back to 300×150 and the result is soft.
 */
async function rasteriseSvg(blob: Blob, height: number): Promise<ImageBitmap | null> {
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return null;

  const text = await blob.text();
  const h = Math.max(1, Math.round(height));
  const w = Math.max(1, Math.round(h * svgAspect(text)));

  const sized = text.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const stripped = attrs.replace(/\s(?:width|height)\s*=\s*"[^"]*"/gi, '');
    return `<svg${stripped} width="${w}" height="${h}">`;
  });

  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const target = surface(w, h);
    if (!target) return null;
    target.ctx.drawImage(img, 0, 0, w, h);
    return await createImageBitmap(target.canvas);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function rasterise(blob: Blob, height: number): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  if (blob.type.includes('svg')) return rasteriseSvg(blob, height);
  try {
    // PNG/WEBP fallbacks for sponsors who never ship vector art.
    return await createImageBitmap(blob, { resizeHeight: height, resizeQuality: 'high' });
  } catch {
    return null;
  }
}

function fallbackMetrics(slug: string, placeholder: boolean): LogoMetrics {
  return { slug, optical: { ...FULL_BOX }, aspect: 1, placeholder };
}

/**
 * Optical bounds of the light variant. Tone only changes the fill colour, never the
 * geometry, so one measurement serves both — see docs/02-DESIGN-SYSTEM.md § G.
 */
async function measure(
  slug: string,
  sources: Partial<Record<Artwork, Blob>>,
  placeholder: boolean,
): Promise<LogoMetrics> {
  // Tone only changes fill colour, never geometry, so one measurement serves all.
  const blob = sources.color ?? sources.light ?? sources.dark;
  if (!blob) return fallbackMetrics(slug, true);

  const bitmap = await rasterise(blob, MEASURE_HEIGHT);
  if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) return fallbackMetrics(slug, placeholder);

  try {
    const ctx = measuringContext(bitmap.width, bitmap.height);
    if (!ctx) return fallbackMetrics(slug, placeholder);
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const optical = opticalBounds(pixels);
    return { slug, optical, aspect: aspectOf(optical, bitmap.width, bitmap.height), placeholder };
  } catch {
    return fallbackMetrics(slug, placeholder);
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// One logo
// ---------------------------------------------------------------------------

interface LogoRequest {
  slug: string;
  sponsor: boolean;
  /** Which artwork files to try, in order. */
  wanted: readonly Artwork[];
  /** Colour-artwork extension; brand logos are always svg. */
  ext: string;
  /** Data URL for an uploaded logo, if this sponsor came from the app. */
  uploaded?: string | undefined;
  /** Manifest said so. D4: a named placeholder file still loads fine but is not real art. */
  flagged: boolean;
}

async function loadLogo(base: string, request: LogoRequest): Promise<LoadedLogo> {
  const fetched = await Promise.all(
    request.wanted.map(async (artwork) => {
      const url = assetUrl(
        base,
        request.slug,
        artwork,
        request.sponsor,
        request.ext,
        request.uploaded,
      );
      const own = await fetchBlob(url);
      if (own) return { artwork, blob: own, fellBack: false };
      // Sponsors never fall back to a stand-in: a sponsor with no artwork is
      // reported as missing so the team can supply it, not faked.
      if (request.sponsor) return { artwork, blob: null, fellBack: false };
      const tone: Tone = artwork === 'dark' ? 'dark' : 'light';
      return { artwork, blob: await fetchBlob(placeholderUrl(base, tone)), fellBack: true };
    }),
  );

  const sources: Partial<Record<Artwork, Blob>> = {};
  let placeholder = request.flagged;
  for (const entry of fetched) {
    if (entry.fellBack) placeholder = true;
    if (entry.blob) sources[entry.artwork] = entry.blob;
  }

  return { metrics: await measure(request.slug, sources, placeholder), sources };
}

// ---------------------------------------------------------------------------
// Lazy raster cache
// ---------------------------------------------------------------------------

/** Quantise so a 41px and a 47px request share one bitmap. */
function bucketFor(targetH: number): number {
  if (!Number.isFinite(targetH) || targetH <= 0) return BUCKET_STEP;
  return Math.max(BUCKET_STEP, Math.ceil(targetH / BUCKET_STEP) * BUCKET_STEP);
}

function createRasterStore(logos: Map<string, LoadedLogo>) {
  const cache = new Map<string, Drawable>();
  /** Keys already requested. Failures stay in here so a miss cannot loop per frame. */
  const claimed = new Set<string>();
  const listeners = new Set<RasterListener>();

  function emit(): void {
    // Copy first: a listener may unsubscribe itself while redrawing.
    for (const listener of [...listeners]) listener();
  }

  async function fill(key: string, slug: string, artwork: Artwork, bucket: number): Promise<void> {
    const logo = logos.get(slug);
    if (!logo) return;
    // Layout already chose the artwork; fall back only if that file is absent.
    const blob = logo.sources[artwork] ?? logo.sources.color ?? logo.sources.light ?? logo.sources.dark;
    if (!blob) return;

    // `bucket` is the height the INK will be drawn at, but the renderer crops to
    // the optical box — so the FILE has to be rasterised proportionally larger.
    // The sponsor artwork is 1080-square with the logo in a thin slice, so
    // rasterising the file at the ink height left CompleTech's mark 8px tall and
    // then stretched back to 48. That is what "the SVGs are blurry" was.
    const opticalH = Math.max(MIN_OPTICAL_FRACTION, Math.min(1, logo.metrics.optical.h));
    const fileHeight = Math.min(MAX_FILE_RASTER, Math.ceil(bucket / opticalH));

    const bitmap = await rasterise(blob, fileHeight);
    if (!bitmap) return;
    cache.set(key, bitmap);
    emit();
  }

  function raster(slug: string, artwork: Artwork, targetH: number): Drawable | null {
    const bucket = bucketFor(targetH);
    const key = `${slug}|${artwork}|${bucket}`;
    const hit = cache.get(key);
    if (hit) return hit;

    if (!claimed.has(key)) {
      claimed.add(key);
      void fill(key, slug, artwork, bucket);
    }
    return null;
  }

  function onRaster(listener: RasterListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { raster, onRaster };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Boot the asset layer. Resolves once every logo is measured, because `LogoMetrics`
 * are plain values handed to the layout — there is no later moment at which a
 * provisional metric could be swapped for a real one without lying to a memoised
 * layout. `ready` is the same promise, exposed for callers that hold the bundle.
 */
export async function loadAssets(
  baseUrl?: string,
  /** Logos uploaded through the app. Merged on top of the manifest. */
  uploaded: readonly CustomSponsor[] = [],
): Promise<AssetBundle> {
  const base = resolveBaseUrl(baseUrl);
  const { manifest, meta: manifestMeta } = await loadManifest(base);

  // Uploaded logos win: uploading artwork for a sponsor the manifest lists as
  // `missing` is the main reason to use the feature, and it must take effect.
  const uploads = new Map(uploaded.map((entry) => [entry.slug, entry]));
  const meta: Record<string, SponsorMeta> = { ...manifestMeta };
  let nextOrder = 1 + Math.max(0, ...Object.values(manifestMeta).map((m) => m.order));
  for (const entry of uploaded) {
    const existing = manifestMeta[entry.slug];
    meta[entry.slug] = existing
      ? // Keep the manifest's name, tier and order; take only the artwork.
        { ...existing, ext: entry.ext, missing: false, placeholder: true }
      : toCustomMeta(entry, nextOrder++);
  }

  const requests: LogoRequest[] = [
    { slug: 'bracu', sponsor: false, wanted: BRAND_ARTWORK, ext: 'svg', flagged: false },
    { slug: 'mongoltori', sponsor: false, wanted: BRAND_ARTWORK, ext: 'svg', flagged: false },
    // A sponsor with no colour artwork is skipped entirely — see D17.
    ...Object.values(meta)
      .filter((entry) => !entry.missing)
      .map((entry) => ({
        slug: entry.slug,
        sponsor: true,
        // The ink variant only exists for artwork too light for the banner.
        wanted: (entry.lightArtwork ? ['color', 'dark'] : ['color']) as Artwork[],
        ext: entry.ext ?? 'svg',
        uploaded: uploads.get(entry.slug)?.data,
        flagged: entry.placeholder,
      })),
  ];

  const logos = new Map<string, LoadedLogo>();
  const measuring = Promise.all(requests.map((request) => loadLogo(base, request))).then(
    (loaded) => {
      requests.forEach((request, index) => {
        const logo = loaded[index];
        if (logo) logos.set(request.slug, logo);
      });
    },
  );

  const ready = measuring.then(() => undefined);
  await ready;

  const metricsFor = (slug: string): LogoMetrics =>
    logos.get(slug)?.metrics ?? fallbackMetrics(slug, true);

  const sponsors: Record<string, LogoMetrics> = {};
  // Only sponsors that actually loaded; the layout skips any slug it cannot find.
  for (const [slug, entry] of Object.entries(meta)) {
    if (entry.missing || !logos.has(slug)) continue;
    sponsors[slug] = metricsFor(slug);
  }

  const bracu = metricsFor('bracu');
  const mongoltori = metricsFor('mongoltori');
  const anyPlaceholder =
    bracu.placeholder ||
    mongoltori.placeholder ||
    Object.values(sponsors).some((logo) => logo.placeholder);

  const { raster, onRaster } = createRasterStore(logos);

  return { bracu, mongoltori, sponsors, meta, manifest, anyPlaceholder, raster, onRaster, ready };
}

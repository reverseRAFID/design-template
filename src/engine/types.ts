/**
 * The engine's contract. Pure TypeScript — no React, no DOM globals.
 *
 * Deliberate deviation from docs/03-ARCHITECTURE.md: the types here never mention
 * `ImageBitmap`. That is a DOM lib type, and CLAUDE.md requires src/engine to be
 * importable with zero DOM. Drawable sources reach the renderer through
 * `RenderInput.image` and `RenderInput.rasters` instead, typed structurally so the
 * unit tests can hand the engine plain objects. See docs/DECISIONS.md → D7.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A rect expressed as fractions (0..1) of some parent box. */
export type Rect01 = Rect;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export type PresetId = 'square' | 'portrait34' | 'portrait45' | 'story' | 'wide' | 'og';

export interface Preset {
  id: PresetId;
  /** Display name, shown in the picker. */
  name: string;
  w: number;
  h: number;
  /** Human-readable ratio for the UI, e.g. '4:5'. */
  ratio: string;
  /** Frame toggle default when this preset is selected. */
  defaultFrame: boolean;
  /** One-line "what it's for", shown under the name. */
  use: string;
}

// ---------------------------------------------------------------------------
// Scene — everything the user controls
// ---------------------------------------------------------------------------

export type Tone = 'dark' | 'light';

/**
 * Which artwork file to draw.
 *
 * `light` / `dark` are the tone-mapped mono variants, used by the two top logos.
 * `color` is the sponsor's own brand artwork, used on the sponsor banner — which
 * has a fixed light background, so it never changes with the photo's tone.
 * See docs/DECISIONS.md D17.
 */
export type Artwork = 'light' | 'dark' | 'color';

export interface ImageTransform {
  /** 1..3 */
  scale: number;
  /** Pan offset in export-space pixels, relative to the centred cover fit. */
  dx: number;
  dy: number;
}

export const IDENTITY_TRANSFORM: ImageTransform = { scale: 1, dx: 0, dy: 0 };

export interface SourceImage {
  /** Intrinsic pixel size of the uploaded photo. */
  w: number;
  h: number;
}

export interface Scene {
  preset: Preset;
  image?: SourceImage | undefined;
  transform: ImageTransform;
  tone: Tone;
  toneOverridden: boolean;
  frame: boolean;
  /** 0..1. Multiplied into the scrim alpha; 0.7 is the default. */
  scrim: number;
  /** Sponsor slugs, in no particular order — the flow sorts by tier then order. */
  selectedSponsors: string[];
  /**
   * Explicit left-to-right order within each tier, overriding the manifest's
   * `order`. Set by dragging in the sponsor list. Slugs absent from this list fall
   * back to their manifest order.
   */
  sponsorOrder?: string[] | undefined;
  /**
   * Per-sponsor tier overrides, set by dragging a logo into another tier's row.
   * Falls back to the manifest's tier for anything not listed.
   */
  sponsorTiers?: Record<string, number> | undefined;
  /** The user's telemetry note, drawn at the left of the photo's HUD line. */
  label?: string | undefined;
  /**
   * Export date, preformatted (DD.MM.YYYY), drawn at the right of the HUD line.
   *
   * Passed in rather than read from a clock: the engine is pure, and a layout that
   * changed with the time of day could not be unit-tested.
   */
  stamp?: string | undefined;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/**
 * Everything the layout needs to know about one logo. Geometry only: no pixels.
 * `optical` is the alpha bounding box as fractions of the source raster, so the
 * renderer can crop transparent padding and the layout can align on real ink.
 */
export interface LogoMetrics {
  slug: string;
  optical: Rect01;
  /** Aspect ratio (w / h) of the OPTICAL box, not the file box. */
  aspect: number;
  placeholder: boolean;
}

export interface SponsorMeta {
  slug: string;
  name: string;
  /** 1 = highest. Lower tiers are the first to be dropped on overflow. */
  tier: number;
  /** Position within a tier. */
  order: number;
  variants: Tone[];
  /**
   * Extension of this sponsor's colour artwork. Optional because only the asset
   * layer cares: the layout works in geometry and never touches a filename.
   */
  ext?: 'svg' | 'png' | undefined;
  /**
   * The brand artwork is light-on-transparent, so it would disappear on the
   * banner's light background. Such logos are drawn from their ink variant instead.
   */
  lightArtwork?: boolean | undefined;
  /**
   * No colour artwork was supplied. The sponsor stays in the manifest and the UI
   * flags it, but nothing is drawn — we do not invent a logo.
   */
  missing?: boolean | undefined;
  placeholder: boolean;
  url?: string | undefined;
}

/** What `computeLayout` needs. Tests construct these literally. */
export interface LayoutAssets {
  bracu: LogoMetrics;
  mongoltori: LogoMetrics;
  /** Keyed by slug. Sponsors missing from this map are skipped. */
  sponsors: Record<string, LogoMetrics>;
  /** Keyed by slug. Drives sort order and tier-dropping. */
  meta: Record<string, SponsorMeta>;
}

// ---------------------------------------------------------------------------
// Sponsor strip flow (engine/sponsor-flow.ts)
// ---------------------------------------------------------------------------

export interface FlowItem {
  slug: string;
  /** Optical aspect ratio (w / h). */
  aspect: number;
  tier: number;
  order: number;
}

/** One logo, sized. Heights differ within a row — see WEIGHT_EXPONENT. */
export interface FlowPlacement {
  slug: string;
  w: number;
  h: number;
}

export interface FlowRow {
  /** The tier this row represents. Rows run top tier first. */
  tier: number;
  items: FlowPlacement[];
  /** Total width including gaps. */
  width: number;
  /** Band height: the tallest logo in the row. */
  height: number;
}

export interface FlowOptions {
  /** Horizontal space the strip may occupy (W − 2·m, or the frame-inset equivalent). */
  available: number;
  /** Preferred logo height, h2 = 0.045·S. */
  targetH: number;
  /** Shrink floor for a SINGLE row, 0.030·S. Below this we wrap instead. */
  minH: number;
  /**
   * Shrink floor once wrapped to two rows, 0.017·S. Defaults to `minH`.
   * Lower than `minH` on purpose — see SPONSOR_H_MIN_ROWS.
   */
  minHRows?: number | undefined;
  /** Horizontal gap between logos, 0.018·S. */
  gap: number;
}

export interface FlowResult {
  /** One row per tier present, capped at MAX_SPONSOR_ROWS. Empty when nothing is selected. */
  rows: FlowRow[];
  /** The base height every row is scaled from, after any shrink. */
  logoH: number;
  /** Slugs dropped because even two rows at minH would not fit. */
  dropped: string[];
}

// ---------------------------------------------------------------------------
// Frame (engine/frame.ts)
// ---------------------------------------------------------------------------

/**
 * The card the composition sits in when the Frame toggle is on: photo and sponsor
 * banner share one rounded container on an ink ground. Replaces § F's HUD viewport
 * — see docs/DECISIONS.md D20.
 */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Which corners of a panel are cut, and by how much. */
export interface PanelShape {
  /** Size of the 45° cut. 0 leaves the corner square. */
  chamfer: number;
  cut: Record<Corner, boolean>;
}

/** An orange run at a chamfered corner: along one edge, across the cut, along the next. */
export interface Bracket {
  corner: Corner;
  points: Point[];
}

export interface FrameGeometry {
  inset: number;
  /** The card. Contains BOTH the photo region and the banner. */
  rect: Rect;
  shape: PanelShape;
  /** Stroke weight of the corner brackets. */
  stroke: number;
  /** Orange L-shapes at the card's corners, in place of a continuous border. */
  brackets: Bracket[];
  /** Margin overlays respect inside the card. */
  effectiveMargin: number;
  /** Width of the ink mat around the card. Non-zero only for `og`. */
  mat: number;
}

// ---------------------------------------------------------------------------
// Layout (engine/layout.ts)
// ---------------------------------------------------------------------------

export interface PlacedLogo extends Rect {
  slug: string;
  /** Which file to ask the RasterProvider for. */
  artwork: Artwork;
  /** Source crop within the raster, as fractions — copied from LogoMetrics.optical. */
  optical: Rect01;
  placeholder: boolean;
}

export interface ScrimBand {
  y0: number;
  y1: number;
}

export interface Scrims {
  top: ScrimBand;
  /**
   * Null once the sponsor banner is opaque — there is nothing left down there for
   * a gradient to make legible.
   */
  bottom: ScrimBand | null;
  /** 'ink' | 'cream' — resolved against the Palette at draw time. */
  color: 'ink' | 'cream';
  /** Final alpha at the opaque end of each gradient. */
  alpha: number;
}

/**
 * The sponsor banner: a rounded, opaque band the sponsor logos sit on. Always
 * present when there are sponsors, and always light, whatever the photo's tone.
 */
export interface StripBacking extends Rect {
  /** Bottom corners follow the card's cut; the top edge is the seam, so square. */
  shape: PanelShape;
  color: 'ink' | 'cream';
  alpha: number;
  /** Orange hairline along the top edge — the seam between photo and banner. */
  rule: { h: number } | null;
  /** The dotted-grid motif, drawn in ink across the band. */
  grid: { spacing: number; dot: number; alpha: number } | null;
  /** A short heavier orange run at the left of the seam. */
  seamTab: { w: number; h: number } | null;
}

export interface HudLayer {
  /** The user's note. Null when they have not set one. */
  left: BannerLabel | null;
  /** The export date. Null when no stamp was supplied. */
  right: BannerLabel | null;
  color: 'ink' | 'cream';
}

export interface BannerLabel {
  text: string;
  /** Left edge of the text. */
  x: number;
  /** Vertical centre. */
  y: number;
  size: number;
  tracking: number;
  alpha: number;
  align: 'left' | 'right';
}

export interface ImagePlacement {
  /** Source crop. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination in export-space pixels. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export interface Layout {
  W: number;
  H: number;
  /** min(W, H) — every overlay dimension is a fraction of this. */
  S: number;
  /** Effective safe margin: m, or the frame's effectiveMargin when frame is on. */
  margin: number;
  image: ImagePlacement | null;
  /**
   * Height of the photo region. The sponsor banner occupies `H − photoH` beneath
   * it, so the photo is cover-fitted into W × photoH rather than the whole canvas.
   */
  photoH: number;
  top: { bracu: PlacedLogo; mongoltori: PlacedLogo };
  strip: {
    rows: PlacedLogo[][];
    bbox: Rect;
    dropped: string[];
    backing: StripBacking | null;
    /** Height of the banner band. Zero when no sponsors are selected. */
    bandHeight: number;
  };
  scrims: Scrims | null;
  frame: FrameGeometry | null;
  /**
   * The telemetry HUD along the bottom of the photo: status tags or the user's
   * note on the left, coordinates on the right. § A's mission-control language.
   */
  hud: HudLayer | null;
  /** Boxes the tone detector samples, in export-space pixels. */
  toneRegions: { regions: Rect[]; weights: number[] };
}

// ---------------------------------------------------------------------------
// Render (engine/render.ts)
// ---------------------------------------------------------------------------

/** Brand colours, resolved from CSS by the app. The engine never reads `document`. */
export interface Palette {
  orange: string;
  orangeHot: string;
  orangeDeep: string;
  cream: string;
  ink: string;
}

/**
 * Anything `ctx.drawImage` accepts. Kept structural so node tests can pass fakes
 * without pulling in the DOM lib.
 */
export interface Drawable {
  readonly width: number;
  readonly height: number;
}

/**
 * Supplies a raster for one logo at (roughly) the requested height. The app
 * buckets heights to multiples of 8px and caches; returning `null` means the
 * asset is not ready and the renderer should skip that logo rather than throw.
 */
export type RasterProvider = (
  slug: string,
  artwork: Artwork,
  targetH: number,
) => Drawable | null;

/**
 * The subset of CanvasRenderingContext2D the engine uses. Declaring it
 * structurally keeps `engine/` free of the DOM lib and makes the draw calls
 * trivially assertable in tests.
 */
export interface Ctx2D {
  canvas: { width: number; height: number };
  fillStyle: string | object;
  strokeStyle: string | object;
  globalAlpha: number;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  letterSpacing?: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality?: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect?(x: number, y: number, w: number, h: number, r: number | number[]): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  /**
   * The one deliberately loose signature in this file.
   *
   * A real `CanvasRenderingContext2D.drawImage` is typed against
   * `CanvasImageSource`, which is neither a supertype nor a subtype of
   * `Drawable` — so with any concrete type here, a real context fails to satisfy
   * `Ctx2D` in both directions and every caller needs an `as unknown as` cast.
   *
   * The engine only ever hands back a drawable the caller gave it (via
   * `RenderInput.image` or `RasterProvider`), both of which stay strictly typed,
   * so nothing is actually unchecked: this parameter is pass-through only.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawImage(src: any, ...args: number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface RenderInput {
  scene: Scene;
  layout: Layout;
  palette: Palette;
  rasters: RasterProvider;
  /** The photo. Omitted when nothing has been uploaded yet. */
  image?: Drawable | null | undefined;
  /**
   * Set once `document.fonts.ready` has resolved. When false the renderer skips
   * the frame's telemetry labels rather than drawing them in a fallback face.
   */
  fontsReady?: boolean | undefined;
  /** Phase 3: draw overlays only, leaving the photo out for a transparent PNG. */
  overlayOnly?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Tone detection (engine/tone.ts)
// ---------------------------------------------------------------------------

/** Structural stand-in for ImageData. */
export interface PixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

export const TONE_THRESHOLD = 0.52;

/**
 * The single source of truth for overlay placement (docs/02-DESIGN-SYSTEM.md § E).
 *
 * Pure geometry — no DOM, no React, no colours beyond the 'ink' | 'cream' tags the
 * renderer resolves against the Palette. Preview and export both consume this, which
 * is what keeps them from diverging (CLAUDE.md rule 3).
 *
 * `PlacedLogo.tone` carries the SCENE tone, not a file suffix. The asset layer owns
 * the "dark tone → cream artwork" mapping in § E's variant table; the layout engine
 * has no business knowing filenames.
 */

import { computeFrame } from './frame';
import {
  BANNER_ALPHA,
  BANNER_GRID_ALPHA,
  BANNER_GRID_DOT,
  BANNER_GRID_SPACING,
  BANNER_NOTE_MAX_CHARS,
  BANNER_SEAM_TAB_H,
  BANNER_SEAM_TAB_W,
  HUD_ALPHA,
  HUD_OFFSET,
  HUD_PREFIX,
  HUD_SIZE,
  HUD_TRACKING_EM,
  BANNER_RULE_H,
  MARGIN,
  MAX_ZOOM,
  MIN_ZOOM,
  SCRIM_MAX_ALPHA,
  SCRIM_TOP_FALLOFF,
  SPONSOR_GAP,
  SPONSOR_H,
  SPONSOR_H_MIN,
  SPONSOR_H_MIN_ROWS,
  SPONSOR_ROW_GAP,
  STRIP_PAD_X,
  STRIP_PAD_Y,
  TONE_TOP_BOX_W,
  TONE_WEIGHTS,
  TOP_GAP_FACTOR,
  TOP_LOGO_H,
  TOP_LOGO_H_MAX_PX,
} from './metrics';
import { flowSponsors } from './sponsor-flow';
import type {
  Artwork,
  FlowItem,
  ImagePlacement,
  ImageTransform,
  Layout,
  LayoutAssets,
  LogoMetrics,
  PanelShape,
  PlacedLogo,
  Rect,
  Scene,
  SourceImage,
  StripBacking,
  Tone,
} from './types';

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Collapses -0 to 0. When a photo exactly covers the canvas the pan range is
 * [-0, 0], and clamping into it yields -0 — arithmetically harmless, but it
 * reaches persisted state and equality checks, where it reads as a different value.
 */
function normZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Scale that makes the source cover W×H, or null if the source is degenerate. */
function coverScale(image: SourceImage, W: number, H: number): number | null {
  if (!(image.w > 0) || !(image.h > 0) || !(W > 0) || !(H > 0)) return null;
  return Math.max(W / image.w, H / image.h);
}

/**
 * Keeps the pan inside the photo: at the cover fit the drawn image is at least as
 * large as the canvas on both axes, so the pan may only travel the overhang. Shared
 * with the pan/zoom hook so a drag and the render agree on the limit.
 */
export function clampTransform(
  t: ImageTransform,
  image: SourceImage,
  W: number,
  H: number,
): ImageTransform {
  const scale = clamp(t.scale, MIN_ZOOM, MAX_ZOOM);
  const cover = coverScale(image, W, H);
  if (cover === null) return { scale, dx: 0, dy: 0 };

  const drawnW = image.w * cover * scale;
  const drawnH = image.h * cover * scale;
  const maxDx = Math.max(0, (drawnW - W) / 2);
  const maxDy = Math.max(0, (drawnH - H) / 2);

  return {
    scale,
    dx: normZero(clamp(t.dx, -maxDx, maxDx)),
    dy: normZero(clamp(t.dy, -maxDy, maxDy)),
  };
}

/**
 * The transform expressed as a source crop drawn over the whole canvas. The renderer
 * therefore never draws outside the canvas and never needs a clip.
 */
function placeImage(
  image: SourceImage,
  transform: ImageTransform,
  originX: number,
  originY: number,
  W: number,
  H: number,
): ImagePlacement | null {
  const cover = coverScale(image, W, H);
  if (cover === null) return null;

  const t = clampTransform(transform, image, W, H);
  const total = cover * t.scale;
  const imgX = (W - image.w * total) / 2 + t.dx;
  const imgY = (H - image.h * total) / 2 + t.dy;

  // min() absorbs float slop: W/total can land a hair over image.w at scale 1.
  const sw = Math.min(image.w, W / total);
  const sh = Math.min(image.h, H / total);

  return {
    sx: clamp(-imgX / total, 0, image.w - sw),
    sy: clamp(-imgY / total, 0, image.h - sh),
    sw,
    sh,
    dx: originX,
    dy: originY,
    dw: W,
    dh: H,
  };
}

// ---------------------------------------------------------------------------
// Top logos
// ---------------------------------------------------------------------------

/** Scrim and pill colour: ink under cream artwork, cream under ink artwork. */
function overlayColor(tone: Tone): 'ink' | 'cream' {
  return tone === 'dark' ? 'ink' : 'cream';
}

/** Unreachable in practice; keeps the row loop total under noUncheckedIndexedAccess. */
function fallbackMetrics(slug: string): LogoMetrics {
  return { slug, optical: { x: 0, y: 0, w: 1, h: 1 }, aspect: 1, placeholder: true };
}

function placeLogo(metrics: LogoMetrics, rect: Rect, artwork: Artwork): PlacedLogo {
  return {
    ...rect,
    slug: metrics.slug,
    artwork,
    optical: { ...metrics.optical },
    placeholder: metrics.placeholder,
  };
}

interface TopLogos {
  bracu: PlacedLogo;
  mongoltori: PlacedLogo;
  /** Height actually used — below TOP_LOGO_H·S when the pair had to shrink. */
  h1: number;
}

function placeTopLogos(
  assets: LayoutAssets,
  W: number,
  S: number,
  m: number,
  tone: Tone,
  box: Rect,
): TopLogos {
  // A dark photo takes the cream artwork and vice versa — § E's variant table.
  const artwork: Artwork = tone === 'dark' ? 'light' : 'dark';
  // `m` is measured from the canvas edge, so the usable run is the box inset by it.
  const left = Math.max(box.x, m);
  const right = Math.min(box.x + box.w, W - m);
  const available = right - left;
  let h1 = Math.min(TOP_LOGO_H * S, TOP_LOGO_H_MAX_PX);

  const aspectSum = Math.max(0, assets.bracu.aspect) + Math.max(0, assets.mongoltori.aspect);
  // The gap is a factor of h1, so one uniform factor makes the whole run fit exactly
  // and both heights stay identical — the PRD's ±1px rule is satisfied by equality.
  const unitWidth = aspectSum + TOP_GAP_FACTOR;
  if (unitWidth > 0 && available > 0 && unitWidth * h1 > available) {
    h1 = available / unitWidth;
  }

  const bracuW = Math.max(0, assets.bracu.aspect) * h1;
  const mtW = Math.max(0, assets.mongoltori.aspect) * h1;

  return {
    bracu: placeLogo(assets.bracu, { x: left, y: Math.max(box.y, m), w: bracuW, h: h1 }, artwork),
    mongoltori: placeLogo(
      assets.mongoltori,
      { x: right - mtW, y: Math.max(box.y, m), w: mtW, h: h1 },
      artwork,
    ),
    h1,
  };
}

// ---------------------------------------------------------------------------
// Sponsor strip
// ---------------------------------------------------------------------------

interface Strip {
  rows: PlacedLogo[][];
  bbox: Rect;
  dropped: string[];
  backing: StripBacking | null;
  /** Height of the band. The photo gets `H − bandHeight`. */
  bandHeight: number;
}

function buildFlowItems(
  assets: LayoutAssets,
  selected: readonly string[],
  sponsorOrder: readonly string[] | undefined,
  sponsorTiers: Record<string, number> | undefined,
): { items: FlowItem[]; metrics: Map<string, LogoMetrics> } {
  const items: FlowItem[] = [];
  const metrics = new Map<string, LogoMetrics>();

  // A dragged order wins over the manifest's. Anything not in the list keeps its
  // manifest order, offset so it trails the explicitly-placed ones.
  const dragged = new Map((sponsorOrder ?? []).map((slug, index) => [slug, index]));
  const TRAILING = 100000;

  for (const slug of selected) {
    if (metrics.has(slug)) continue; // a slug selected twice must not flow twice
    const logo = assets.sponsors[slug];
    const meta = assets.meta[slug];
    // A sponsor without geometry or without tier/order cannot be placed or sorted.
    if (!logo || !meta) continue;
    metrics.set(slug, logo);
    items.push({
      slug,
      aspect: logo.aspect,
      tier: sponsorTiers?.[slug] ?? meta.tier,
      order: dragged.get(slug) ?? TRAILING + meta.order,
    });
  }

  return { items, metrics };
}

/**
 * The sponsor banner: a full-bleed light band across the bottom of the canvas.
 *
 * It is NOT an overlay on the photo — it is an extension added beneath it, and the
 * photo gets whatever height is left (docs/DECISIONS.md D17). Its own height is
 * therefore computed FIRST, before anything that has to fit in the remaining space.
 */
function placeStrip(
  assets: LayoutAssets,
  scene: Scene,
  S: number,
  /** The box the composition occupies: the whole canvas, or the card. */
  box: Rect,
  /** The card's panel shape, so the banner's bottom corners match it. */
  frameShape: PanelShape | null,
): Strip {
  const { items, metrics } = buildFlowItems(
    assets,
    scene.selectedSponsors,
    scene.sponsorOrder,
    scene.sponsorTiers,
  );
  const gap = SPONSOR_GAP * S;
  const padX = STRIP_PAD_X * S;
  const padY = STRIP_PAD_Y * S;

  const flow = flowSponsors(items, {
    available: box.w - 2 * padX,
    targetH: SPONSOR_H * S,
    minH: SPONSOR_H_MIN * S,
    minHRows: SPONSOR_H_MIN_ROWS * S,
    gap,
  });

  const count = flow.rows.length;
  if (count === 0) {
    // No sponsors, no band: the photo gets the whole canvas.
    return {
      rows: [],
      bbox: { x: box.x + box.w / 2, y: box.y + box.h, w: 0, h: 0 },
      dropped: flow.dropped,
      backing: null,
      bandHeight: 0,
    };
  }

  const rowGap = SPONSOR_ROW_GAP * S;
  // Each tier has its own band height, so the stack is summed, not multiplied out.
  const rowsH = flow.rows.reduce((sum, row) => sum + row.height, 0) + (count - 1) * rowGap;

  // No standing heading any more: it cost a whole line of band height to say what
  // the logos already say. The note, when there is one, shares the bottom padding.
  const padTop = padY;
  const padBottom = padY;
  const bandHeight = rowsH + padTop + padBottom;
  const bandTop = box.y + box.h - bandHeight;
  const top = bandTop + padTop;

  let widest = 0;
  let cursorY = top;
  const rows: PlacedLogo[][] = flow.rows.map((row) => {
    const y = cursorY;
    cursorY += row.height + rowGap;
    widest = Math.max(widest, row.width);

    let x = box.x + (box.w - row.width) / 2;
    return row.items.map((item) => {
      // Always present: the flow items were built from this very map.
      const logo = metrics.get(item.slug) ?? fallbackMetrics(item.slug);
      // Sponsors are drawn in their own brand colours, because the band behind them
      // is a known light background. The exception is artwork that is itself light
      // — it would vanish — which the manifest flags so the ink variant is used.
      const artwork: Artwork = assets.meta[item.slug]?.lightArtwork ? 'dark' : 'color';
      const placed = placeLogo(
        logo,
        { x, y: y + (row.height - item.h) / 2, w: item.w, h: item.h },
        artwork,
      );
      x += item.w + gap;
      return placed;
    });
  });

  return {
    rows,
    bbox: { x: box.x + (box.w - widest) / 2, y: top, w: widest, h: rowsH },
    dropped: flow.dropped,
    // Full bleed and fully opaque: this is a block of the composition, not a scrim.
    backing: {
      x: box.x,
      y: bandTop,
      w: box.w,
      h: bandHeight,
      // Bottom corners follow the card's cut so photo and banner read as one
      // panel; the top edge is the seam, so it stays square.
      shape: {
        chamfer: frameShape ? frameShape.chamfer : 0,
        cut: { tl: false, tr: false, bl: true, br: true },
      },
      color: 'cream',
      alpha: BANNER_ALPHA,
      rule: { h: Math.max(1, BANNER_RULE_H * S) },
      grid: {
        spacing: BANNER_GRID_SPACING * S,
        dot: Math.max(0.5, BANNER_GRID_DOT * S),
        alpha: BANNER_GRID_ALPHA,
      },
      seamTab: { w: BANNER_SEAM_TAB_W * box.w, h: BANNER_SEAM_TAB_H },
    },
    bandHeight,
  };
}

// ---------------------------------------------------------------------------
// computeLayout
// ---------------------------------------------------------------------------

export function computeLayout(scene: Scene, assets: LayoutAssets): Layout {
  const W = scene.preset.w;
  const H = scene.preset.h;
  // S stays the CANVAS short side, per § E, so a logo keeps the same visual weight
  // whether or not a banner is present.
  const S = Math.min(W, H);

  // Frame on = card: the whole composition is inset and rounded. Frame off = full
  // bleed. Both are the same geometry with a different box, which is why there is
  // no second layout path (docs/DECISIONS.md D20).
  const frame = scene.frame ? computeFrame(W, H, { isOg: scene.preset.id === 'og' }) : null;
  const box: Rect = frame ? frame.rect : { x: 0, y: 0, w: W, h: H };

  // The banner is measured first: the photo gets what it leaves.
  const strip = placeStrip(assets, scene, S, box, frame ? frame.shape : null);
  const photoH = Math.max(1, box.h - strip.bandHeight);

  const m = frame ? frame.effectiveMargin : MARGIN * S;

  const top = placeTopLogos(assets, W, S, m, scene.tone, box);

  // Dark tone only.
  //
  // The scrim exists to guarantee contrast behind the top logos. On a dark photo
  // that means darkening, which reads as a natural vignette. On a light photo it
  // would mean washing cream over an already-bright area — and the ink logos a
  // light tone selects already have their contrast. It flattened the photo for
  // nothing, so it is gone (docs/DECISIONS.md D24).
  //
  // The bottom scrim went earlier: it existed to lift sponsor logos off the photo,
  // and they now sit on the banner.
  const scrims =
    scene.tone === 'dark'
      ? {
          top: { y0: box.y, y1: m + top.h1 + SCRIM_TOP_FALLOFF * S },
          bottom: null,
          color: overlayColor(scene.tone),
          alpha: SCRIM_MAX_ALPHA * clamp(scene.scrim, 0, 1),
        }
      : null;

  const toneBoxW = TONE_TOP_BOX_W * W;


  // The HUD sits along the bottom of the PHOTO, above the banner's seam. § A asks
  // for negative space and the photo has it, so this costs the banner no height.
  const hudSize = HUD_SIZE * S;
  const hudY = box.y + photoH - HUD_OFFSET * S;
  const note = (scene.label ?? '').trim().toUpperCase().slice(0, BANNER_NOTE_MAX_CHARS);
  const stamp = (scene.stamp ?? '').trim();
  const roomForHud = photoH > hudSize * 4;

  const hud =
    roomForHud && (note || stamp)
      ? {
          left: note
            ? {
                text: HUD_PREFIX + note,
                x: m,
                y: hudY,
                size: hudSize,
                tracking: hudSize * HUD_TRACKING_EM,
                alpha: HUD_ALPHA,
                align: 'left' as const,
              }
            : null,
          right: stamp
            ? {
                text: stamp,
                x: box.x + box.w - (m - box.x),
                y: hudY,
                size: hudSize,
                tracking: hudSize * HUD_TRACKING_EM,
                alpha: HUD_ALPHA * 0.8,
                align: 'right' as const,
              }
            : null,
          color: overlayColor(scene.tone) === 'ink' ? ('cream' as const) : ('ink' as const),
        }
      : null;

  return {
    W,
    H,
    S,
    margin: m,
    // Cover-fitted into the photo region of the box, never the raw canvas.
    image: scene.image
      ? placeImage(scene.image, scene.transform, box.x, box.y, box.w, photoH)
      : null,
    photoH,
    top: { bracu: top.bracu, mongoltori: top.mongoltori },
    strip,
    scrims,
    frame,
    hud,
    toneRegions: {
      regions: [
        { x: m, y: m, w: toneBoxW, h: top.h1 },
        { x: box.x + box.w - (m - box.x) - toneBoxW, y: m, w: toneBoxW, h: top.h1 },
      ],
      weights: [...TONE_WEIGHTS],
    },
  };
}

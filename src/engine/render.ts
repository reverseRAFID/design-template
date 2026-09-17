/**
 * The one draw path (CLAUDE.md rule 3). Preview and export both call
 * `renderComposition`; the preview only differs by a `ctx.scale(k, k)` applied by
 * the caller, so every coordinate below is export-space and comes from `Layout`.
 *
 * Pure with respect to the context: every step is wrapped in save()/restore(), so
 * the scaled preview context comes back exactly as it was handed in.
 *
 * No colours are computed here beyond alpha — `Palette` arrives already resolved
 * from CSS by the app, because the engine never touches `document`.
 */

import type {
  Ctx2D,
  FrameGeometry,
  HudLayer,
  PanelShape,
  Palette,
  PlacedLogo,
  RenderInput,
  ScrimBand,
  StripBacking,
} from './types';

/**
 * Where the app reads the brand colours from. Kept here so the engine and the app
 * agree on one list of variable names without the engine importing `document`.
 */
export const PALETTE_VARS = {
  orange: '--mt-orange',
  orangeHot: '--mt-orange-hot',
  orangeDeep: '--mt-orange-deep',
  cream: '--mt-cream',
  ink: '--mt-ink',
} as const;

/** The telemetry note stays monospace — it is a readout, not a title. */
const NOTE_FONT_STACK = '"JetBrains Mono", ui-monospace, monospace';

// ---------------------------------------------------------------------------
// Small canvas helpers
// ---------------------------------------------------------------------------

/** Ctx2D has no fillRect — it is not in the subset the engine declares. */
function fillRect(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  if (!(w > 0) || !(h > 0)) return;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
}

function hex(component: string): number {
  return Number.parseInt(component, 16);
}

/**
 * Palette values are hex from tokens.css, but a CSS variable could resolve to
 * anything. Null when it is not a hex we can split, and callers fall back to
 * globalAlpha rather than inventing a colour.
 */
function hexToRgba(color: string, alpha: number): string | null {
  const raw = color.trim().replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return null;

  const r = hex(full.slice(0, 2));
  const g = hex(full.slice(2, 4));
  const b = hex(full.slice(4, 6));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Tracking fallback for engines without `ctx.letterSpacing`: lays the glyphs out
 * by hand from the context's current font and baseline. Gaps sit only BETWEEN
 * glyphs (n−1 of them), which is what centres the run optically.
 */
export function drawTrackedText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'center' | 'left' | 'right' = 'center',
): void {
  const glyphs = Array.from(text);
  if (glyphs.length === 0) return;

  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  let total = tracking * (glyphs.length - 1);
  for (const w of widths) total += w;

  ctx.save();
  ctx.textAlign = 'left';
  let cursor = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  for (let i = 0; i < glyphs.length; i += 1) {
    const glyph = glyphs[i];
    if (glyph === undefined) continue;
    ctx.fillText(glyph, cursor, y);
    cursor += (widths[i] ?? 0) + tracking;
  }
  ctx.restore();
}


// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function drawScrimBand(
  ctx: Ctx2D,
  band: ScrimBand,
  W: number,
  color: string,
  alpha: number,
  fullAtTop: boolean,
): void {
  const h = band.y1 - band.y0;
  if (!(h > 0) || !(alpha > 0)) return;

  const opaque = hexToRgba(color, alpha);
  const clear = hexToRgba(color, 0);

  ctx.save();
  const grad = ctx.createLinearGradient(0, band.y0, 0, band.y1);
  if (opaque !== null && clear !== null) {
    grad.addColorStop(fullAtTop ? 0 : 1, opaque);
    grad.addColorStop(fullAtTop ? 1 : 0, clear);
  } else {
    // Unparseable palette entry: let globalAlpha carry the strength and lean on
    // the premultiplied gradient interpolation for the transparent end.
    ctx.globalAlpha = alpha;
    grad.addColorStop(fullAtTop ? 0 : 1, color);
    grad.addColorStop(fullAtTop ? 1 : 0, 'transparent');
  }
  ctx.fillStyle = grad;
  fillRect(ctx, 0, band.y0, W, h);
  ctx.restore();
}

/** Intersection of two perpendicular straight runs, or null when they are parallel. */
/**
 * The card outline. The frame is a card now (docs/DECISIONS.md D20): the clipping
 * that puts photo and banner inside it happens in `renderComposition`, so all that
 * is left here is the hairline around the edge.
 */
/**
 * A panel outline with 45° cut corners. Chamfered panels are what the reference
 * boards are built from, and this is the path every panel in the composition uses.
 */
function panelPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, shape: PanelShape): void {
  const c = Math.max(0, Math.min(shape.chamfer, Math.min(w, h) / 2));
  const x1 = x + w;
  const y1 = y + h;
  const { cut } = shape;

  ctx.beginPath();
  if (c <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }

  ctx.moveTo(cut.tl ? x + c : x, y);
  ctx.lineTo(cut.tr ? x1 - c : x1, y);
  if (cut.tr) ctx.lineTo(x1, y + c);
  ctx.lineTo(x1, cut.br ? y1 - c : y1);
  if (cut.br) ctx.lineTo(x1 - c, y1);
  ctx.lineTo(cut.bl ? x + c : x, y1);
  if (cut.bl) ctx.lineTo(x, y1 - c);
  ctx.lineTo(x, cut.tl ? y + c : y);
  if (cut.tl) ctx.lineTo(x + c, y);
  ctx.closePath();
}

/** Orange runs across each cut corner — the reference boards' panel marking. */
function strokeCard(ctx: Ctx2D, g: FrameGeometry, palette: Palette): void {
  if (!(g.stroke > 0) || g.brackets.length === 0) return;
  ctx.save();
  ctx.strokeStyle = palette.orange;
  ctx.lineWidth = g.stroke;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  for (const bracket of g.brackets) {
    const [first, ...rest] = bracket.points;
    if (!first) continue;
    ctx.moveTo(first.x, first.y);
    for (const point of rest) ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBacking(ctx: Ctx2D, backing: StripBacking, palette: Palette): void {
  if (!(backing.w > 0) || !(backing.h > 0) || !(backing.alpha > 0)) return;
  const { x, y, w, h } = backing;

  ctx.save();

  // Ground.
  ctx.globalAlpha = backing.alpha;
  ctx.fillStyle = palette[backing.color];
  panelPath(ctx, x, y, w, h, backing.shape);
  ctx.fill();

  // Everything else is confined to the band.
  ctx.clip();

  // Dotted grid, in ink. Offset half a step so dots never sit on the edges.
  if (backing.grid && backing.grid.spacing > 0 && backing.grid.dot > 0) {
    const { spacing, dot, alpha } = backing.grid;
    ctx.globalAlpha = backing.alpha * alpha;
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    for (let gy = y + spacing / 2; gy < y + h; gy += spacing) {
      for (let gx = x + spacing / 2; gx < x + w; gx += spacing) {
        // A square dot at this size is indistinguishable from a round one and
        // avoids an arc call per dot — there can be several hundred.
        ctx.rect(gx - dot / 2, gy - dot / 2, dot, dot);
      }
    }
    ctx.fill();
  }

  // Orange seam between photo and banner: a hairline the full width, plus a short
  // heavier run at the left so it reads as a mission-control tab, not a divider.
  if (backing.rule && backing.rule.h > 0) {
    ctx.globalAlpha = backing.alpha;
    ctx.fillStyle = palette.orange;
    ctx.beginPath();
    ctx.rect(x, y, w, backing.rule.h);
    if (backing.seamTab && backing.seamTab.w > 0) {
      ctx.rect(x, y, backing.seamTab.w, backing.rule.h * backing.seamTab.h);
    }
    ctx.fill();
  }

  ctx.restore();
}

/**
 * The telemetry HUD along the bottom of the photo: § A's mono micro-labels, status
 * tags and footer coordinates. Skipped until the mono face is loaded — a
 * substituted face reads as a different brand.
 */
function drawHud(ctx: Ctx2D, hud: HudLayer, palette: Palette): void {
  ctx.save();
  ctx.fillStyle = palette[hud.color];
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  for (const label of [hud.left, hud.right]) {
    if (!label || label.text.length === 0 || !(label.size > 0)) continue;
    ctx.globalAlpha = label.alpha;
    ctx.font = `${label.size}px ${NOTE_FONT_STACK}`;
    drawTrackedText(ctx, label.text, label.x, label.y, label.tracking, label.align);
  }

  ctx.restore();
}

/**
 * Optical alignment lives here: the source rect is the logo's alpha bounding box
 * scaled to the raster's intrinsic size, so transparent padding in the file never
 * reaches the canvas and every logo lands on its ink.
 */
function drawLogo(ctx: Ctx2D, logo: PlacedLogo, input: RenderInput): void {
  if (!(logo.w > 0) || !(logo.h > 0)) return;

  const raster = input.rasters(logo.slug, logo.artwork, logo.h);
  if (!raster) return; // asset not ready — skip silently, never throw mid-render

  const sx = logo.optical.x * raster.width;
  const sy = logo.optical.y * raster.height;
  const sw = logo.optical.w * raster.width;
  const sh = logo.optical.h * raster.height;
  if (!(sw > 0) || !(sh > 0)) return;

  ctx.drawImage(raster, sx, sy, sw, sh, logo.x, logo.y, logo.w, logo.h);
}

// ---------------------------------------------------------------------------
// renderComposition
// ---------------------------------------------------------------------------

export function renderComposition(ctx: Ctx2D, input: RenderInput): void {
  const { layout, palette } = input;
  const { W, H } = layout;
  const overlayOnly = input.overlayOnly === true;

  ctx.save();

  // 1. Ground. Skipped for overlayOnly, which wants a transparent PNG.
  if (!overlayOnly) {
    ctx.save();
    ctx.fillStyle = palette.ink;
    fillRect(ctx, 0, 0, W, H);
    ctx.restore();
  }

  // 2-6 are confined to the card when the frame is on, so the photo, the scrims
  //      and the banner all take its rounded corners together.
  const card = layout.frame;
  if (card) {
    ctx.save();
    panelPath(ctx, card.rect.x, card.rect.y, card.rect.w, card.rect.h, card.shape);
    ctx.clip();
  }

  // 2. Photo.
  if (!overlayOnly && input.image && layout.image) {
    const p = layout.image;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(input.image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    ctx.restore();
  }

  // 3. Scrims (frame off).
  if (layout.scrims) {
    const { top, bottom, color, alpha } = layout.scrims;
    const resolved = palette[color];
    drawScrimBand(ctx, top, W, resolved, alpha, true);
    // The bottom scrim is gone once the sponsor banner is opaque.
    if (bottom) drawScrimBand(ctx, bottom, W, resolved, alpha, false);
  }

  // 4. Telemetry HUD along the bottom of the photo.
  if (layout.hud && input.fontsReady === true) drawHud(ctx, layout.hud, palette);

  // 5. The sponsor banner — an opaque block, drawn even in overlay mode, since
  //    the sponsors' brand colours depend on it being there.
  if (layout.strip.backing) drawBacking(ctx, layout.strip.backing, palette);

  // 6 + 7. Logos. One smoothing setup for the whole pass.
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  drawLogo(ctx, layout.top.bracu, input);
  drawLogo(ctx, layout.top.mongoltori, input);
  for (const row of layout.strip.rows) {
    for (const logo of row) drawLogo(ctx, logo, input);
  }
  ctx.restore();

  // 8. Card brackets, outside the clip so they are not half-cut by it.
  if (card) {
    ctx.restore();
    if (!overlayOnly) strokeCard(ctx, card, palette);
  }

  ctx.restore();
}

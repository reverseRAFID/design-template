/**
 * The Mission Frame, redesigned as a CARD.
 *
 * It began as the HUD viewport docs/02-DESIGN-SYSTEM.md § F describes — an orange
 * rule with broken edges, corner brackets and telemetry labels — then became a
 * rounded card, and is now a CHAMFERED panel: photo and sponsor banner share one
 * cut-cornered container on an ink ground, joined by the orange seam the banner
 * carries, with orange accents across each cut.
 *
 * See docs/DECISIONS.md D20. The toggle is still called "Frame"; what changed is
 * what it draws, not what it means — with it off the composition is full bleed.
 *
 * Pure geometry: this module hands the renderer numbers and never draws.
 */

import {
  CARD_ACCENT_LEN,
  CARD_CHAMFER,
  CARD_INSET,
  CARD_STROKE,
  CARD_STROKE_MIN_PX,
  FRAME_MARGIN_FACTOR,
  MARGIN,
} from './metrics';
import type { Bracket, FrameGeometry, Rect } from './types';

/**
 * Orange runs at the card's cut corners: along one edge, across the chamfer, then
 * along the next. This is how the reference boards mark a panel — the cut itself
 * is the accent — and it needs no continuous border eating the margin.
 */
function makeAccents(rect: Rect, chamfer: number, len: number): Bracket[] {
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const y0 = rect.y;
  const y1 = rect.y + rect.h;
  const c = chamfer;

  return [
    {
      corner: 'tl',
      points: [
        { x: x0, y: y0 + c + len },
        { x: x0, y: y0 + c },
        { x: x0 + c, y: y0 },
        { x: x0 + c + len, y: y0 },
      ],
    },
    {
      corner: 'tr',
      points: [
        { x: x1 - c - len, y: y0 },
        { x: x1 - c, y: y0 },
        { x: x1, y: y0 + c },
        { x: x1, y: y0 + c + len },
      ],
    },
    {
      corner: 'br',
      points: [
        { x: x1, y: y1 - c - len },
        { x: x1, y: y1 - c },
        { x: x1 - c, y: y1 },
        { x: x1 - c - len, y: y1 },
      ],
    },
    {
      corner: 'bl',
      points: [
        { x: x0 + c + len, y: y1 },
        { x: x0 + c, y: y1 },
        { x: x0, y: y1 - c },
        { x: x0, y: y1 - c - len },
      ],
    },
  ];
}

export interface FrameOptions {
  /** Link previews get a crisp ink edge; every other preset is the same card. */
  isOg: boolean;
}

/**
 * The card the whole composition sits in, for a canvas of `W × H`.
 *
 * `H` is the FULL canvas height: the card contains the photo AND the banner, and
 * the layout divides the card between them.
 */
export function computeFrame(W: number, H: number, opts: FrameOptions): FrameGeometry {
  const S = Math.min(W, H);

  const inset = CARD_INSET * S;
  const rect: Rect = { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset };
  const chamfer = Math.min(CARD_CHAMFER * S, Math.min(rect.w, rect.h) / 3);

  return {
    inset,
    rect,
    // Capped so a very flat card cannot cut past its own middle.
    shape: { chamfer, cut: { tl: true, tr: true, bl: true, br: true } },
    stroke: Math.max(CARD_STROKE_MIN_PX, CARD_STROKE * S),
    brackets: makeAccents(rect, chamfer, CARD_ACCENT_LEN * S),
    // Overlays sit inside the card, measured from its edge.
    effectiveMargin: inset + MARGIN * S * FRAME_MARGIN_FACTOR,
    mat: opts.isOg ? inset : 0,
  };
}

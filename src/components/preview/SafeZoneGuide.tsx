/**
 * The safe-zone guide (PRD § F2): while the photo is being framed, show where the
 * overlays will land so nobody parks a face under a logo.
 *
 * UI only — this is an SVG sibling of the canvas, never a draw call. It reads the
 * same `Layout` the canvas was drawn from and multiplies by the preview scale, so
 * it cannot drift from what gets exported.
 */

import type { Layout, Rect } from '@/engine/types';

export interface SafeZoneGuideProps {
  layout: Layout | null;
  /** CSS pixels per export pixel, from `useComposition`. */
  scale: number;
  visible: boolean;
}

/** Restrained: dashed for the margin, solid hairlines for the boxes, 30% opacity. */
const OPACITY = 0.3;
const DASH = '6 5';

function scaled(rect: Rect, k: number): Rect {
  return { x: rect.x * k, y: rect.y * k, w: rect.w * k, h: rect.h * k };
}

export function SafeZoneGuide({ layout, scale, visible }: SafeZoneGuideProps): JSX.Element | null {
  if (!visible || !layout || !(scale > 0)) return null;

  const w = layout.W * scale;
  const h = layout.H * scale;
  const m = layout.margin * scale;
  if (!(w > 0) || !(h > 0)) return null;

  const boxes: Rect[] = [scaled(layout.top.bracu, scale), scaled(layout.top.mongoltori, scale)];
  if (layout.strip.rows.length > 0) boxes.push(scaled(layout.strip.bbox, scale));

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none block"
    >
      <g fill="none" stroke="var(--mt-orange)" strokeWidth={1} opacity={OPACITY}>
        <rect
          x={m}
          y={m}
          width={Math.max(0, w - 2 * m)}
          height={Math.max(0, h - 2 * m)}
          strokeDasharray={DASH}
        />
        {boxes.map((box, index) => (
          <rect
            // Index is stable: the order is bracu, mongol-tori, strip, always.
            key={index}
            x={box.x}
            y={box.y}
            width={Math.max(0, box.w)}
            height={Math.max(0, box.h)}
          />
        ))}
      </g>
    </svg>
  );
}

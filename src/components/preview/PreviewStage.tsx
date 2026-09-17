/**
 * The centre column: one canvas on the dotted grid, with the corner readouts and
 * the safe-zone guide layered over it.
 *
 * The canvas is drawn by `useComposition` and sized by it too — this component
 * only guarantees the one structural thing the hook depends on: the canvas's
 * parent is `absolute inset-0`, so its box comes from the stage and never from
 * the canvas inside it. Measuring a parent that the canvas could grow would be a
 * feedback loop.
 *
 * The canvas renders even with no photo: the overlays alone are a genuinely
 * useful preview of the template.
 */

import { useEffect, useRef } from 'react';

import { CornerReadouts } from './CornerReadouts';
import { SafeZoneGuide } from './SafeZoneGuide';
import { getPreset } from '@/engine/presets';
import { ThumbnailStrip } from '@/components/preview/ThumbnailStrip';
import { useComposition } from '@/hooks/use-composition';
import { usePanZoom } from '@/hooks/use-pan-zoom';
import { useEditorStore } from '@/state/editor-store';
import type { AssetBundle } from '@/assets/loader';
import type { Layout } from '@/engine/types';

export interface PreviewStageProps {
  /** Null while the brand assets are still loading. */
  bundle: AssetBundle | null;
  /**
   * Slugs the strip had to drop to fit. Reported from here because this is where
   * the layout is computed; App turns it into the overflow toast the PRD asks for.
   * Fires on change, not every frame.
   */
  onDropped?: ((dropped: string[]) => void) | undefined;
}

const HELP_ID = 'mt-preview-help';

/** Same cell of the canvas layer's grid, so overlay and canvas stay registered. */
const CELL = { gridArea: '1 / 1' } as const;

function sponsorCount(layout: Layout | null): number {
  if (!layout) return 0;
  return layout.strip.rows.reduce((total, row) => total + row.length, 0);
}

export function PreviewStage({ bundle, onDropped }: PreviewStageProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { layout, scale } = useComposition(canvasRef, bundle);

  const dropped = layout?.strip.dropped;
  const droppedKey = dropped?.join(',') ?? '';
  // Both through refs: keyed on the dropped SET, never on the callback's identity,
  // so an inline `onDropped` that pushes a toast cannot re-enter through the
  // re-render the toast causes. computeLayout also returns a fresh array each run,
  // which is why the key is the joined string.
  const notify = useRef(onDropped);
  notify.current = onDropped;
  const latest = useRef<string[] | undefined>(dropped);
  latest.current = dropped;
  useEffect(() => {
    const current = latest.current;
    if (current) notify.current?.(current);
  }, [droppedKey]);

  const presetId = useEditorStore((s) => s.presetId);
  const tone = useEditorStore((s) => s.tone);
  const frame = useEditorStore((s) => s.frame);
  const zoom = useEditorStore((s) => s.transform.scale);
  const hasImage = useEditorStore((s) => s.image !== null);

  const { dragging } = usePanZoom(canvasRef, { enabled: hasImage });

  const preset = getPreset(presetId);
  const label = [
    `Preview: ${preset.name}, ${preset.w} by ${preset.h} pixels`,
    `${tone} tone`,
    `frame ${frame ? 'on' : 'off'}`,
    `${sponsorCount(layout)} sponsor logos`,
    hasImage ? `photo framed at ${zoom.toFixed(2)} times zoom` : 'no photo yet',
  ].join(', ');

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        {/* Fixed by the stage, never by its children — see the note above. */}
        <div className="absolute inset-0 grid place-items-center px-2 py-7">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={label}
            aria-describedby={hasImage ? HELP_ID : undefined}
            tabIndex={hasImage ? 0 : -1}
            style={CELL}
            className={[
              // outline, not border: a border would eat into the canvas box under
              // Tailwind's border-box reset and soften the 1:1 pixel mapping.
              'outline outline-1 outline-mt-line',
              hasImage ? 'touch-none' : '',
              hasImage ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />

          <div style={CELL} className="pointer-events-none">
            <SafeZoneGuide layout={layout} scale={scale} visible={dragging} />
          </div>

          {layout ? null : (
            <p style={CELL} className="mt-telemetry text-mt-text-mute">
              &rsaquo; Loading brand assets&hellip;
            </p>
          )}
        </div>

        <CornerReadouts layout={layout} />
      </div>

      <ThumbnailStrip />

      <p id={HELP_ID} className="sr-only">
        Drag to pan the photo, scroll to zoom, double-click to reset. With the preview focused,
        arrow keys pan, plus and minus zoom, and zero resets the framing.
      </p>
    </div>
  );
}

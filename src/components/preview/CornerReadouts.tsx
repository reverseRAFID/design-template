/**
 * The four mono readouts around the stage (Design System § D → Preview stage).
 *
 * UI only: these are never drawn into the canvas and never exported. They are
 * aria-hidden because the canvas's own label already states the same facts — a
 * screen reader should hear the composition once, not five times.
 */

import { getPreset } from '@/engine/presets';
import { useEditorStore } from '@/state/editor-store';
import type { Layout } from '@/engine/types';

export interface CornerReadoutsProps {
  /** Null until the brand assets load; the preset then supplies the pixel size. */
  layout: Layout | null;
}

const CORNER = 'mt-telemetry absolute max-w-[46%] truncate text-mt-text-mute';

export function CornerReadouts({ layout }: CornerReadoutsProps): JSX.Element {
  const presetId = useEditorStore((s) => s.presetId);
  const tone = useEditorStore((s) => s.tone);
  const zoom = useEditorStore((s) => s.transform.scale);
  const frame = useEditorStore((s) => s.frame);

  const preset = getPreset(presetId);
  const w = layout?.W ?? preset.w;
  const h = layout?.H ?? preset.h;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      {/* mt-telemetry uppercases in CSS, so the DOM keeps readable text. */}
      <span className={`${CORNER} left-0 top-0`}>
        Preset: {preset.name} {w}&#215;{h}
      </span>
      <span className={`${CORNER} right-0 top-0 text-right`}>Tone: {tone}</span>
      <span className={`${CORNER} bottom-0 left-0`}>Zoom: {zoom.toFixed(2)}&#215;</span>
      <span className={`${CORNER} bottom-0 right-0 text-right`}>
        Frame: {frame ? 'on' : 'off'}
      </span>
    </div>
  );
}

/**
 * Multi-preset and batch export (PRD Phase 3 § 3.2 / 3.3).
 *
 * The same control serves both: tick the formats you want, and every loaded photo
 * is rendered into each of them. One photo × one preset is just the degenerate
 * case, so there is no separate "batch mode" to switch into.
 */
import { useState } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { Pill } from '@/components/ui/Pill';
import { PRESETS } from '@/engine/presets';
import type { PresetId } from '@/engine/types';
import type { BatchProgress } from '@/hooks/use-batch-export';
import type { ExportFormat } from '@/lib/render-export';

export interface BatchBarProps {
  onExportZip: (presetIds: PresetId[], format: ExportFormat) => Promise<void>;
  busy: boolean;
  progress: BatchProgress | null;
  /** How many photos are loaded, so the button can say what it will do. */
  imageCount: number;
  /** The preset shown in the preview — the sensible default to have ticked. */
  currentPresetId: PresetId;
}

export function BatchBar({
  onExportZip,
  busy,
  progress,
  imageCount,
  currentPresetId,
}: BatchBarProps): JSX.Element {
  const [chosen, setChosen] = useState<Set<PresetId>>(() => new Set([currentPresetId]));
  const [format, setFormat] = useState<ExportFormat>('png');

  function toggle(id: PresetId): void {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = imageCount * chosen.size;
  const locked = busy || imageCount === 0 || chosen.size === 0;

  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>EXPORT MANY</Eyebrow>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Formats to include in the archive</legend>
        {PRESETS.map((preset) => (
          <label
            key={preset.id}
            className="flex cursor-pointer items-center gap-2.5 font-mono text-[11px] text-mt-text-dim"
          >
            <input
              type="checkbox"
              checked={chosen.has(preset.id)}
              onChange={() => toggle(preset.id)}
              className="h-3.5 w-3.5 shrink-0 accent-mt-orange"
            />
            <span className="flex-1 uppercase tracking-[0.08em]">{preset.name}</span>
            <span className="text-mt-text-mute">
              {preset.w}×{preset.h}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-2">
        <Pill
          as="button"
          variant={format === 'png' ? 'outline' : 'ghost'}
          size="sm"
          active={format === 'png'}
          onClick={() => setFormat('png')}
        >
          PNG
        </Pill>
        <Pill
          as="button"
          variant={format === 'jpg' ? 'outline' : 'ghost'}
          size="sm"
          active={format === 'jpg'}
          onClick={() => setFormat('jpg')}
        >
          JPG
        </Pill>
      </div>

      <Pill
        as="button"
        variant="outline"
        disabled={locked}
        aria-busy={busy}
        onClick={() => void onExportZip([...chosen], format).catch(() => undefined)}
      >
        {busy ? 'RENDERING…' : `DOWNLOAD ZIP (${count})`}
      </Pill>

      {progress ? (
        <p className="mt-telemetry text-mt-text-dim" role="status" aria-live="polite">
          RENDERING {progress.done} / {progress.total}
          {progress.current ? ` · ${progress.current.toUpperCase()}` : ''}
        </p>
      ) : null}

      {imageCount === 0 ? (
        <p className="mt-telemetry text-mt-text-mute">↳ Load photos to enable</p>
      ) : (
        <p className="mt-telemetry text-mt-text-mute">
          {imageCount} PHOTO{imageCount === 1 ? '' : 'S'} × {chosen.size} FORMAT
          {chosen.size === 1 ? '' : 'S'} · TONE AUTO-DETECTED PER PHOTO
        </p>
      )}
    </div>
  );
}

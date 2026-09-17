/**
 * The frame's optional telemetry label (PRD Phase 2).
 *
 * Only meaningful while the frame is on — it is drawn in the frame's bottom HUD
 * opening — so App renders it there. Empty falls back to `URC · IRC · ERC`, which
 * is what `computeFrame` does with a blank label.
 */
import { useId } from 'react';

import { Pill } from '@/components/ui/Pill';
import { todayLabelDate } from '@/lib/filename';

/** Matches LABEL_MAX_CHARS in engine/frame.ts, which truncates beyond this. */
const MAX_CHARS = 48;

export interface LabelFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function LabelField({ value, onChange }: LabelFieldProps): JSX.Element {
  const id = useId();
  const today = todayLabelDate();
  const remaining = MAX_CHARS - value.length;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="mt-eyebrow">
        <span aria-hidden="true">{'// '}</span>
        TELEMETRY LABEL
      </label>

      <input
        id={id}
        type="text"
        value={value}
        maxLength={MAX_CHARS}
        // Uppercased on the way in, not with text-transform: the canvas draws the
        // stored string, so what is shown here has to be what gets exported.
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={`OUTREACH · DHAKA · ${today}`}
        className="w-full rounded-md border border-mt-line bg-mt-surface-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mt-text placeholder:text-mt-text-mute focus:border-mt-orange"
      />

      <div className="flex items-center justify-between gap-2">
        <Pill
          as="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(`OUTREACH · DHAKA · ${today}`)}
        >
          USE TODAY
        </Pill>
        <span className="mt-telemetry text-mt-text-mute" aria-live="polite">
          {value ? `${remaining} LEFT` : 'OPTIONAL — LEFT OF THE DATE'}
        </span>
      </div>
    </div>
  );
}

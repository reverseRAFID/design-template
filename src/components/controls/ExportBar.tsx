import { Pill } from '@/components/ui/Pill';

export type ExportFormat = 'png' | 'jpg';

export interface ExportBarProps {
  onExport: (format: ExportFormat) => Promise<void>;
  /**
   * Brand layer alone on transparency, for dropping over video. Enabled even with
   * no photo loaded — the overlay does not need one.
   */
  onExportOverlay?: (() => Promise<void>) | undefined;
  /** A render is in flight. Both buttons lock and the primary reads RENDERING…. */
  busy: boolean;
  /** No photo loaded — nothing to export. */
  disabled: boolean;
}

const HINT_ID = 'mt-export-hint';

/** Visual line and its spoken equivalent: arrows and ⌘ do not read aloud usefully. */
const SHORTCUTS = '↑↓ PRESET · D/L TONE · F FRAME · ⌘/CTRL+S DOWNLOAD';
const SHORTCUTS_SPOKEN =
  'Keyboard shortcuts: up and down arrows change preset, D or L sets tone, ' +
  'F toggles the frame, Command or Control plus S downloads.';

export function ExportBar({
  onExport,
  onExportOverlay,
  busy,
  disabled,
}: ExportBarProps): JSX.Element {
  const locked = busy || disabled;

  function run(format: ExportFormat): void {
    if (locked) return;
    // App.tsx owns the export and surfaces failures as a toast; swallowing here
    // only keeps a rejected promise from becoming an unhandled rejection.
    void onExport(format).catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Pill
          variant="primary"
          className="flex-1"
          disabled={locked}
          aria-busy={busy}
          aria-describedby={disabled && !busy ? HINT_ID : undefined}
          onClick={() => run('png')}
        >
          {busy ? <span className="mt-telemetry">RENDERING…</span> : 'DOWNLOAD PNG'}
        </Pill>
        <Pill
          variant="outline"
          disabled={locked}
          aria-busy={busy}
          aria-describedby={disabled && !busy ? HINT_ID : undefined}
          aria-label="Download JPG"
          onClick={() => run('jpg')}
        >
          JPG
        </Pill>
      </div>

      {onExportOverlay ? (
        <Pill
          as="button"
          variant="outline"
          size="sm"
          // Deliberately not gated on `disabled`: the overlay layer is exactly
          // what you want WITHOUT a photo.
          disabled={busy}
          aria-busy={busy}
          onClick={() => void onExportOverlay().catch(() => undefined)}
        >
          OVERLAY PNG (TRANSPARENT)
        </Pill>
      ) : null}

      {disabled && !busy ? (
        <p id={HINT_ID} className="mt-telemetry text-mt-warn">
          ↳ Load a photo to enable export
        </p>
      ) : null}

      <p className="mt-telemetry text-mt-text-mute" aria-hidden="true">
        {SHORTCUTS}
      </p>
      <span className="sr-only">{SHORTCUTS_SPOKEN}</span>
    </div>
  );
}

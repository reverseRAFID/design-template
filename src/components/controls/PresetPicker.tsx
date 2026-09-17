/**
 * Output format list. Radiogroup semantics rather than a set of toggle buttons:
 * exactly one preset is always chosen, which is what a radio group means, and it
 * buys the arrow-key behaviour the PRD asks for.
 */

import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Pill } from '@/components/ui/Pill';
import type { PillElement } from '@/components/ui/Pill';
import { PRESETS } from '@/engine/presets';
import { useEditorStore } from '@/state/editor-store';

export interface PresetPickerProps {
  className?: string;
}

/** Thumbnail box, and the longest side a ratio rect may use inside it. */
const THUMB_BOX = 28;
const THUMB_MAX = 24;

/** The rect is drawn at the preset's true aspect so story reads tall, wide reads wide. */
function thumbRect(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const aspect = w / h;
  const rw = aspect >= 1 ? THUMB_MAX : THUMB_MAX * aspect;
  const rh = aspect >= 1 ? THUMB_MAX / aspect : THUMB_MAX;
  return { x: (THUMB_BOX - rw) / 2, y: (THUMB_BOX - rh) / 2, w: rw, h: rh };
}

export function PresetPicker({ className }: PresetPickerProps): JSX.Element {
  const presetId = useEditorStore((s) => s.presetId);
  const setPreset = useEditorStore((s) => s.setPreset);
  const refs = useRef<(PillElement | null)[]>([]);

  const found = PRESETS.findIndex((p) => p.id === presetId);
  const activeIndex = found < 0 ? 0 : found;

  function select(index: number): void {
    const preset = PRESETS[index];
    if (!preset) return;
    if (preset.id !== presetId) setPreset(preset.id);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = PRESETS.length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        select(index === last ? 0 : index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        select(index === 0 ? last : index - 1);
        break;
      case 'Home':
        event.preventDefault();
        select(0);
        break;
      case 'End':
        event.preventDefault();
        select(last);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Output preset"
      className={['flex flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}
    >
      {PRESETS.map((preset, index) => {
        const checked = preset.id === presetId;
        const r = thumbRect(preset.w, preset.h);
        return (
          <Pill
            key={preset.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            variant="outline"
            active={checked}
            role="radio"
            aria-checked={checked}
            aria-label={`${preset.name}, ${preset.w} by ${preset.h} pixels, ratio ${preset.ratio}`}
            // Roving tabindex: one stop for the whole group, arrows move within it.
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="w-full"
          >
            <span className="flex w-full items-center gap-3 text-left">
              <svg
                width={THUMB_BOX}
                height={THUMB_BOX}
                viewBox={`0 0 ${THUMB_BOX} ${THUMB_BOX}`}
                aria-hidden="true"
                className="shrink-0"
              >
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                />
              </svg>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="mt-display truncate text-[13px] leading-4">{preset.name}</span>
                <span className="mt-telemetry text-mt-text-mute">
                  {preset.w}×{preset.h}
                </span>
              </span>
            </span>
          </Pill>
        );
      })}
    </div>
  );
}

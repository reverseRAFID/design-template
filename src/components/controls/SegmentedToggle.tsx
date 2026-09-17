/**
 * Two-option segmented control (Tone, Frame). A segmented pill, never an iOS
 * switch: both options stay visible and nameable, which matters when one of them
 * is the auto-detected default.
 */

import { useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Pill } from '@/components/ui/Pill';
import type { PillElement } from '@/components/ui/Pill';

export interface SegmentedOption<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface SegmentedToggleProps<T> {
  /** Exactly two — this control is a choice, not a list. */
  options: readonly [SegmentedOption<T>, SegmentedOption<T>];
  value: T;
  onChange: (v: T) => void;
  /** Visible group label, also the accessible name of the radiogroup. */
  label: string;
  /** Option to tag as machine-chosen. */
  autoValue?: T;
}

const LABEL_CLS = 'text-[12px] font-medium uppercase tracking-[0.08em] text-mt-text-dim';
const AUTO_CLS =
  'rounded-pill border border-mt-line-strong px-1 font-mono text-[9px] leading-[14px] tracking-[0.1em] text-mt-text-mute';

export function SegmentedToggle<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  autoValue,
}: SegmentedToggleProps<T>): JSX.Element {
  const labelId = useId();
  const refs = useRef<(PillElement | null)[]>([]);

  const found = options.findIndex((o) => o.value === value);
  const activeIndex = found < 0 ? 0 : found;
  const last = options.length - 1;

  function select(index: number): void {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        select(index === last ? 0 : index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        select(index === 0 ? last : index - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className={LABEL_CLS}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex w-full items-stretch gap-1 rounded-pill border border-mt-line bg-mt-surface-2 p-1"
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          const isAuto = autoValue !== undefined && option.value === autoValue;
          return (
            <Pill
              key={String(option.value)}
              ref={(el) => {
                refs.current[index] = el;
              }}
              variant="ghost"
              size="sm"
              active={checked}
              role="radio"
              aria-checked={checked}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className="flex-1 flex-col gap-0.5 py-2"
            >
              <span className="flex items-center gap-1.5">
                <span className="mt-display text-[11px] leading-4">{option.label}</span>
                {isAuto ? (
                  <>
                    <span aria-hidden="true" className={AUTO_CLS}>
                      AUTO
                    </span>
                    <span className="sr-only">auto-detected</span>
                  </>
                ) : null}
              </span>
              {option.hint ? (
                <span className="mt-telemetry text-[9px] leading-3 text-mt-text-mute">{option.hint}</span>
              ) : null}
            </Pill>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Scrim / zoom slider. Built on a real <input type="range"> so keyboard control,
 * the accessible name and value announcement come from the platform; only the
 * track and thumb are restyled.
 */

import { useId, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}

/** Module counter, not Math.random: the class must be stable and SSR-safe. */
let sliderSeq = 0;

const LABEL_CLS = 'text-[12px] font-medium uppercase tracking-[0.08em] text-mt-text-dim';

/**
 * Pseudo-elements cannot be reached from inline styles, so the per-instance rules
 * ship with the component. The fill position rides in on the --mt-fill custom
 * property, which the track pseudo-element inherits.
 */
function sliderCss(cls: string): string {
  return `
.${cls}{-webkit-appearance:none;appearance:none;width:100%;height:18px;background:transparent;cursor:pointer;}
.${cls}:disabled{cursor:not-allowed;}
.${cls}::-webkit-slider-runnable-track{height:2px;border-radius:var(--r-pill);background:linear-gradient(to right,var(--mt-orange) 0 var(--mt-fill),var(--mt-line) var(--mt-fill) 100%);}
.${cls}::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;box-sizing:border-box;width:14px;height:14px;margin-top:-6px;border-radius:var(--r-pill);background:var(--mt-cream);border:2px solid var(--mt-orange);}
.${cls}::-moz-range-track{height:2px;border-radius:var(--r-pill);background:var(--mt-line);}
.${cls}::-moz-range-progress{height:2px;border-radius:var(--r-pill);background:var(--mt-orange);}
.${cls}::-moz-range-thumb{box-sizing:border-box;width:14px;height:14px;border-radius:var(--r-pill);background:var(--mt-cream);border:2px solid var(--mt-orange);}
`;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled = false,
}: SliderProps): JSX.Element {
  const id = useId();
  const [cls] = useState(() => `mt-slider-${(sliderSeq += 1)}`);

  const span = max - min;
  const ratio = span > 0 ? (value - min) / span : 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const text = format ? format(value) : String(value);

  function handle(event: ChangeEvent<HTMLInputElement>): void {
    const next = Number(event.currentTarget.value);
    if (Number.isFinite(next)) onChange(next);
  }

  return (
    <div className={['flex flex-col gap-1', disabled ? 'opacity-45' : ''].filter(Boolean).join(' ')}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL_CLS}>
          {label}
        </label>
        {/* aria-valuetext already carries this for screen readers. */}
        <span aria-hidden="true" className="mt-telemetry text-mt-text">
          {text}
        </span>
      </div>
      <style>{sliderCss(cls)}</style>
      <input
        id={id}
        type="range"
        className={cls}
        style={{ '--mt-fill': `${pct}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format ? text : undefined}
        onChange={handle}
      />
    </div>
  );
}

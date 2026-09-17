import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'ok' | 'warn' | 'placeholder';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone: BadgeTone;
  /** Ignored for the `placeholder` tone, which always reads PLACEHOLDER. */
  children?: ReactNode;
}

const SHELL = 'mt-telemetry inline-flex items-center rounded-pill align-middle';
const TONES: Record<'ok' | 'warn', string> = {
  ok: 'border border-mt-line-strong px-2 py-0.5 text-mt-ok',
  warn: 'border border-mt-line-strong px-2 py-0.5 text-mt-warn',
};

/** Hazard stripes read as "not the real asset". Colours come from the tokens, never hex. */
const STRIPES: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, var(--mt-orange) 0 5px, var(--mt-ink) 5px 10px)',
};

export function Badge({ tone, className, children, ...rest }: BadgeProps): JSX.Element {
  const cls = [SHELL, tone === 'placeholder' ? 'p-[2px]' : TONES[tone], className ?? '']
    .filter(Boolean)
    .join(' ');

  if (tone === 'placeholder') {
    return (
      <span className={cls} style={STRIPES} {...rest}>
        {/* Solid chip over the stripes — the label has to stay legible. */}
        <span className="rounded-pill bg-mt-ink px-2 py-0.5 text-mt-orange">PLACEHOLDER</span>
      </span>
    );
  }

  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}

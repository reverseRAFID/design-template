import { forwardRef } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  Ref,
} from 'react';

export type PillVariant = 'primary' | 'outline' | 'ghost';
export type PillSize = 'sm' | 'md';

/** Every element Pill can become. Union keeps `href` / `disabled` honestly typed. */
export type PillTag = 'button' | 'a' | 'div';
export type PillElement = HTMLButtonElement | HTMLAnchorElement | HTMLDivElement;

interface PillOwn {
  variant: PillVariant;
  /** Selected state. Adds an orange ring + glow and never fills. */
  active?: boolean;
  size?: PillSize;
  className?: string;
  children?: ReactNode;
}

type Strip<T> = Omit<T, 'className' | 'children'>;

export type PillProps =
  | (PillOwn & { as?: 'button' } & Strip<ButtonHTMLAttributes<HTMLButtonElement>>)
  | (PillOwn & { as: 'a' } & Strip<AnchorHTMLAttributes<HTMLAnchorElement>>)
  | (PillOwn & { as: 'div' } & Strip<HTMLAttributes<HTMLDivElement>>);

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-pill ' +
  // box-shadow explicitly: the active state's orange glow is a shadow, and
  // `transition-colors` alone left it snapping in (§ D: 160ms ease-out).
  'border font-body font-medium duration-state ease-out ' +
  'transition-[color,background-color,border-color,box-shadow] ' +
  'disabled:pointer-events-none disabled:opacity-40';

const SIZES: Record<PillSize, string> = {
  sm: 'px-3 py-1.5 text-[12px] leading-4',
  md: 'px-4 py-2.5 text-[14px] leading-5',
};

/** `mt-chrome` is the single chrome highlight allowed on screen — primary only. */
const VARIANTS: Record<PillVariant, string> = {
  primary: 'mt-chrome overflow-hidden border-transparent bg-mt-orange text-mt-ink hover:bg-mt-orange-hot',
  outline: 'border-mt-line-strong bg-transparent text-mt-text hover:border-mt-orange hover:text-mt-orange',
  ghost: 'border-transparent bg-transparent text-mt-text-dim hover:bg-mt-surface-2 hover:text-mt-text',
};

/** Active must read as selected without becoming a second filled button. */
const ACTIVE = 'border-mt-orange text-mt-orange shadow-glow';

export const Pill = forwardRef<PillElement, PillProps>(function Pill(props, ref) {
  const { as = 'button', variant, active = false, size = 'md', className, children, ...rest } = props;

  const cls = [BASE, SIZES[size], VARIANTS[variant], active ? ACTIVE : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  // data-active gives consumers a styling hook without inventing ARIA semantics
  // (selected-ness is aria-pressed here, aria-current there — the caller decides).
  const shared = { className: cls, 'data-active': active ? 'true' : undefined };

  if (as === 'a') {
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} {...shared} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  if (as === 'div') {
    return (
      <div ref={ref as Ref<HTMLDivElement>} {...shared} {...(rest as HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      {...shared}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
});

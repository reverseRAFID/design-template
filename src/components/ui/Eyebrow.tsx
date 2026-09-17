import type { HTMLAttributes, ReactNode } from 'react';

export interface EyebrowProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children' | 'prefix'> {
  /** Prepend the `// ` mission-control marker. */
  prefix?: boolean;
  children: ReactNode;
}

export function Eyebrow({ prefix = true, className, children, ...rest }: EyebrowProps): JSX.Element {
  return (
    <p className={['mt-eyebrow', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {/* Decoration only — screen readers should not spell out the slashes. */}
      {prefix ? <span aria-hidden="true">{'// '}</span> : null}
      {children}
    </p>
  );
}

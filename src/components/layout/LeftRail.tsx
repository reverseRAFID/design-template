import type { ReactNode } from 'react';

export interface LeftRailProps {
  children: ReactNode;
}

/**
 * Scrollable left column on desktop; a plain stacked block on mobile.
 *
 * `shrink-0` matters: `min-h-0` is what lets the desktop grid column scroll, but
 * in the stacked mobile column the same rule let the panel shrink below its
 * content, which then overflowed on top of the section beneath it. Both are
 * therefore `lg:` only.
 */
export function LeftRail({ children }: LeftRailProps): JSX.Element {
  return (
    <aside
      aria-label="Format and image"
      className="flex shrink-0 flex-col gap-6 border-b border-mt-line bg-mt-surface p-4 lg:min-h-0 lg:shrink lg:border-b-0 lg:border-r lg:overflow-y-auto lg:p-5"
    >
      {children}
    </aside>
  );
}

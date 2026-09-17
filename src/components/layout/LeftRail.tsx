import type { ReactNode } from 'react';

export interface LeftRailProps {
  children: ReactNode;
}

/** Scrollable left column. Hairline sits on the inner edge, so border-r on desktop. */
export function LeftRail({ children }: LeftRailProps): JSX.Element {
  return (
    <aside
      aria-label="Format and image"
      className="flex min-h-0 flex-col gap-6 border-b border-mt-line bg-mt-surface p-4 lg:border-b-0 lg:border-r lg:overflow-y-auto lg:p-5"
    >
      {children}
    </aside>
  );
}

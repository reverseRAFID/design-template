import type { ReactNode } from 'react';

export interface RightPanelProps {
  children: ReactNode;
}

/** Scrollable right column. Hairline on the inner edge, so border-l on desktop. */
export function RightPanel({ children }: RightPanelProps): JSX.Element {
  return (
    <aside
      aria-label="Overlay and export"
      className="flex min-h-0 flex-col gap-6 border-t border-mt-line bg-mt-surface p-4 lg:border-l lg:border-t-0 lg:overflow-y-auto lg:p-5"
    >
      {children}
    </aside>
  );
}

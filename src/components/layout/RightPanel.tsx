import type { ReactNode } from 'react';

export interface RightPanelProps {
  children: ReactNode;
}

/** Scrollable right column on desktop; a plain stacked block on mobile — see LeftRail. */
export function RightPanel({ children }: RightPanelProps): JSX.Element {
  return (
    <aside
      aria-label="Overlay and export"
      className="flex shrink-0 flex-col gap-6 border-t border-mt-line bg-mt-surface p-4 lg:min-h-0 lg:shrink lg:border-l lg:border-t-0 lg:overflow-y-auto lg:p-5"
    >
      {children}
    </aside>
  );
}

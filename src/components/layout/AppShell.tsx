import type { ReactNode } from 'react';

export interface AppShellProps {
  header: ReactNode;
  left: ReactNode;
  centre: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}

const STAGE_ID = 'mt-stage';

/**
 * Three columns on desktop, stacked with the preview on top below 1024px.
 *
 * Two different scrolling models, on purpose:
 *
 * - **Desktop** pins the shell to the viewport (`h-[100dvh]`, `overflow-hidden`)
 *   and lets each column scroll on its own, so the preview never leaves the screen.
 * - **Mobile** lets the PAGE scroll, and nothing inside it. An inner scroller on a
 *   phone fights the browser's own chrome-collapsing scroll and, when the shell
 *   also had a fixed height, produced two nested scrollbars.
 */
export function AppShell({ header, left, centre, right, footer }: AppShellProps): JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:overflow-hidden">
      <a
        href={`#${STAGE_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-mt-orange focus:px-4 focus:py-2 focus:text-mt-ink"
      >
        Skip to preview
      </a>

      {header}

      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)_minmax(18rem,21rem)] lg:overflow-hidden">
        {left}

        {/* min-h-0 + flex is what lets the preview measure its own box instead of
            inflating the grid row. Background stays transparent so the body's
            dotted grid shows through behind the canvas. */}
        <main
          id={STAGE_ID}
          tabIndex={-1}
          className="order-first flex min-h-[60vh] min-w-0 shrink-0 flex-col overflow-hidden p-4 lg:order-none lg:min-h-0 lg:shrink lg:p-6"
        >
          {centre}
        </main>

        {right}
      </div>

      {footer ? (
        <footer className="shrink-0 border-t border-mt-line bg-mt-surface px-4 py-2 lg:px-6">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

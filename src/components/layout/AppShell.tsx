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
 * The viewport box owns the only scrollbar on desktop (`overflow-hidden` here,
 * `overflow-y-auto` on each column); below lg the body column scrolls instead,
 * so the page never scrolls twice.
 */
export function AppShell({ header, left, centre, right, footer }: AppShellProps): JSX.Element {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <a
        href={`#${STAGE_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-mt-orange focus:px-4 focus:py-2 focus:text-mt-ink"
      >
        Skip to preview
      </a>

      {header}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)_minmax(18rem,21rem)] lg:overflow-hidden">
        {left}

        {/* min-h-0 + flex is what lets the preview measure its own box instead of
            inflating the grid row. Background stays transparent so the body's
            dotted grid shows through behind the canvas. */}
        <main
          id={STAGE_ID}
          tabIndex={-1}
          className="order-first flex min-h-[55vh] min-w-0 flex-col overflow-hidden p-4 lg:order-none lg:min-h-0 lg:p-6"
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

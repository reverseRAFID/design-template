export interface HeaderProps {
  /** True while any loaded logo is a placeholder asset. */
  placeholder: boolean;
}

export function Header({ placeholder }: HeaderProps): JSX.Element {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-mt-line bg-mt-surface px-4 py-3 lg:px-6">
      <h1 className="mt-display text-[16px] leading-6 text-mt-text sm:text-[18px] lg:text-[20px] lg:leading-7">
        MONGOL-TORI <span className="text-mt-orange">//</span> BRAND KIT
      </h1>

      {/* role=status so the flip to ASSETS: PLACEHOLDER is announced, not just seen. */}
      <p
        role="status"
        aria-live="polite"
        className={[
          'mt-telemetry flex shrink-0 items-center gap-2',
          placeholder ? 'text-mt-warn' : 'text-mt-ok',
        ].join(' ')}
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-pill bg-current" />
        {placeholder ? 'ASSETS: PLACEHOLDER' : 'SYS: NOMINAL'}
      </p>
    </header>
  );
}

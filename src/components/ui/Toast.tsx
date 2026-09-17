import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'ok' | 'warn';

export interface ToastMessage {
  id: string;
  text: string;
  tone?: ToastTone;
}

export interface ToastControls {
  toasts: ToastMessage[];
  push(text: string, tone?: ToastTone): void;
  dismiss(id: string): void;
}

const TOAST_TTL_MS = 4000;

// Module counter, not Math.random: ids must be stable and collision-free for React keys.
let seq = 0;
const nextId = (): string => `toast-${++seq}`;

const TONES: Record<ToastTone, string> = {
  ok: 'border-mt-ok text-mt-ok',
  warn: 'border-mt-warn text-mt-warn',
};

export function useToasts(): ToastControls {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (text: string, tone?: ToastTone) => {
      const id = nextId();
      setToasts((list) => [...list, { id, text, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_TTL_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

export interface ToastHostProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps): JSX.Element {
  return (
    // The live region is always mounted: a region inserted together with its text
    // is not reliably announced.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[
            'pointer-events-auto flex max-w-[min(32rem,100%)] items-center gap-3 rounded-pill border',
            'bg-mt-surface-2 py-2 pl-4 pr-2 shadow-glow',
            toast.tone ? TONES[toast.tone] : 'border-mt-line-strong text-mt-text',
          ].join(' ')}
        >
          <span aria-hidden="true" className="mt-telemetry">
            &rsaquo;
          </span>
          <span className="font-body text-[13px] leading-5 text-mt-text">{toast.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label={`Dismiss: ${toast.text}`}
            className="ml-auto rounded-pill px-2 py-1 text-mt-text-dim transition-colors duration-state ease-out hover:text-mt-text"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      ))}
    </div>
  );
}

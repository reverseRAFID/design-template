/**
 * Photo intake: drop, click, or paste. Decoding happens here so the store only
 * ever receives a ready-to-draw bitmap plus its intrinsic size.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent as ReactDragEvent } from 'react';

import type { SourceImage } from '@/engine/types';

/** Exactly the payload the editor store's `setImage` wants. */
export interface DropzoneImage {
  source: SourceImage;
  drawable: ImageBitmap;
  name: string;
}

export interface DropzoneProps {
  /** Called once per successfully decoded file, in the order they were given. */
  onImages: (images: DropzoneImage[]) => void;
  onError: (message: string) => void;
  hasImage: boolean;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const DIRECT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

const HEIC_MESSAGE = 'HEIC not supported here — convert to JPG first';

/**
 * Resolved at runtime, never statically: heic2any is deliberately NOT a
 * dependency, and a literal specifier would make both tsc and the Vite build
 * fail on a module that is allowed to be absent.
 */
const HEIC_MODULE = 'heic2any';

type HeicConvert = (opts: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>;

/* Only the drag-over ring spins; prefers-reduced-motion is neutralised globally in globals.css. */
const ORBIT_CSS = `
@keyframes mt-orbit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.mt-orbit { transform-origin: 50% 50%; }
.mt-orbit--spin { animation: mt-orbit-spin 14s linear infinite; }
`;

function isHeic(file: File): boolean {
  return HEIC_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** null = the optional converter is not installed. Conversion errors throw instead. */
async function convertHeic(file: File): Promise<Blob | null> {
  let mod: unknown;
  try {
    mod = await import(/* @vite-ignore */ HEIC_MODULE);
  } catch {
    return null;
  }
  const candidate = typeof mod === 'function' ? mod : (mod as { default?: unknown } | null)?.default;
  if (typeof candidate !== 'function') return null;

  const out = await (candidate as HeicConvert)({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  return blob ?? null;
}

function OrbitMotif({ spinning }: { spinning: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20"
    >
      <svg
        viewBox="0 0 120 120"
        className={['mt-orbit h-40 w-40 max-w-full', spinning ? 'mt-orbit--spin' : ''].filter(Boolean).join(' ')}
        fill="none"
        stroke="currentColor"
      >
        <circle cx="60" cy="60" r="46" strokeWidth="1" />
        <ellipse cx="60" cy="60" rx="56" ry="20" strokeWidth="1" transform="rotate(-24 60 60)" />
        <ellipse cx="60" cy="60" rx="56" ry="20" strokeWidth="1" transform="rotate(36 60 60)" />
        <circle cx="60" cy="14" r="3.5" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Dropzone({ onImages, onError, hasImage }: DropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  // Monotonic token so a slow decode can never overwrite a newer one.
  const seq = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const decodeFile = useCallback(
    async (file: File, token: number): Promise<DropzoneImage | null> => {
      try {
        let blob: Blob = file;
        if (isHeic(file)) {
          const converted = await convertHeic(file);
          if (!converted) {
            onError(HEIC_MESSAGE);
            return null;
          }
          blob = converted;
        } else if (!DIRECT_TYPES.has(file.type)) {
          onError(`Unsupported file "${file.name}" — use JPG, PNG, WEBP or HEIC`);
          return null;
        }

        // EXIF-rotated phone photos must land upright; we never want to export sideways.
        const drawable = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        if (token !== seq.current) {
          drawable.close();
          return null;
        }
        const source: SourceImage = { w: drawable.width, h: drawable.height };
        return { source, drawable, name: file.name };
      } catch {
        onError(
          isHeic(file)
            ? HEIC_MESSAGE
            : `Could not read "${file.name}" — try another file`,
        );
        return null;
      }
    },
    [onError],
  );

  /**
   * Decodes sequentially, not with Promise.all: a drop of twenty 16MP photos
   * decoded at once will spike memory hard enough to lose the tab.
   */
  const handleFiles = useCallback(
    async (files: readonly File[]): Promise<void> => {
      if (files.length === 0) return;
      const token = (seq.current += 1);
      setBusy(true);
      try {
        const decoded: DropzoneImage[] = [];
        for (const file of files) {
          const image = await decodeFile(file, token);
          if (token !== seq.current) return; // superseded by a newer drop
          if (image) decoded.push(image);
        }
        if (decoded.length === 0) return;
        setName(decoded.length === 1 ? (decoded[0]?.name ?? null) : `${decoded.length} photos`);
        onImages(decoded);
      } finally {
        if (token === seq.current) setBusy(false);
      }
    },
    [decodeFile, onImages],
  );

  // Paste anywhere. Text pastes carry no files, so typing in the label field is unaffected.
  useEffect(() => {
    function onPaste(event: ClipboardEvent): void {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      void handleFiles(Array.from(files));
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFiles]);

  function onPick(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    // Clear the value so re-picking the same file fires change again.
    event.target.value = '';
    void handleFiles(files);
  }

  function onDragEnter(event: ReactDragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: ReactDragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  // Depth counter, because dragleave also fires when the pointer crosses a child.
  function onDragLeave(event: ReactDragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: ReactDragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void handleFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  const dragProps = { onDragEnter, onDragOver, onDragLeave, onDrop };
  const open = (): void => inputRef.current?.click();

  const compactCls = [
    'flex w-full items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2',
    'transition-colors duration-state ease-out',
    dragging ? 'border-mt-orange text-mt-orange' : 'border-mt-line-strong text-mt-text-dim hover:border-mt-orange',
  ].join(' ');

  const panelCls = [
    'relative flex min-h-[11rem] w-full flex-col items-center justify-center gap-2 overflow-hidden',
    'rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-state ease-out',
    dragging
      ? 'border-mt-orange bg-mt-surface-2 text-mt-orange'
      : 'border-mt-line-strong text-mt-text-dim hover:border-mt-orange hover:text-mt-text',
  ].join(' ');

  return (
    <div className="relative">
      <style>{ORBIT_CSS}</style>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
      />

      {hasImage ? (
        <button
          type="button"
          onClick={open}
          aria-label={name ? `Replace image, currently ${name}` : 'Replace image'}
          aria-busy={busy}
          className={compactCls}
          {...dragProps}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="mt-telemetry text-mt-text-mute">
              ›
            </span>
            <span className="truncate font-mono text-[12px] text-mt-text">
              {busy ? 'DECODING …' : (name ?? 'IMAGE LOADED')}
            </span>
          </span>
          <span className="mt-telemetry shrink-0 rounded-pill border border-mt-line-strong px-2 py-0.5">
            REPLACE
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          aria-label="Add an image: drop a file here, click to browse, or paste from the clipboard"
          aria-busy={busy}
          className={panelCls}
          {...dragProps}
        >
          <OrbitMotif spinning={dragging} />
          <span className="mt-telemetry relative">
            {busy ? '› DECODING …' : '› DROP IMAGE OR CLICK'}
          </span>
          <span className="relative text-[11px] text-mt-text-mute">
            JPG · PNG · WEBP · HEIC — or paste
          </span>
        </button>
      )}
    </div>
  );
}

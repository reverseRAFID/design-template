/**
 * The loaded photos, under the preview (PRD Phase 3 § Batch mode).
 *
 * Hidden entirely for a single photo: one thumbnail of the thing already filling
 * the stage is just noise.
 */
import { useEffect, useRef } from 'react';

import { useEditorStore } from '@/state/editor-store';
import type { EditorImage } from '@/state/editor-store';

/** Backing-store size of each thumbnail. Small: there may be dozens. */
const THUMB_W = 112;
const THUMB_H = 72;

function Thumbnail({ image }: { image: EditorImage }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Cover-fit, the same framing rule the export uses, so the thumbnail is an
    // honest preview of what that photo will look like.
    const scale = Math.max(THUMB_W / image.source.w, THUMB_H / image.source.h);
    const sw = THUMB_W / scale;
    const sh = THUMB_H / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, THUMB_W, THUMB_H);
    ctx.drawImage(
      image.drawable,
      (image.source.w - sw) / 2,
      (image.source.h - sh) / 2,
      sw,
      sh,
      0,
      0,
      THUMB_W,
      THUMB_H,
    );
  }, [image]);

  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="block" aria-hidden="true" />;
}

export function ThumbnailStrip(): JSX.Element | null {
  const images = useEditorStore((s) => s.images);
  const activeIndex = useEditorStore((s) => s.activeIndex);
  const selectImage = useEditorStore((s) => s.selectImage);
  const removeImage = useEditorStore((s) => s.removeImage);

  if (images.length < 2) return null;

  return (
    <div className="shrink-0 border-t border-mt-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="mt-eyebrow">
          <span aria-hidden="true">{'// '}</span>
          {images.length} PHOTOS
        </p>
        <p className="mt-telemetry text-mt-text-mute">
          {activeIndex + 1} / {images.length}
        </p>
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Loaded photos">
        {images.map((image, index) => {
          const active = index === activeIndex;
          return (
            <li key={`${image.name}-${index}`} className="relative shrink-0">
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                aria-label={`Photo ${index + 1}: ${image.name}`}
                onClick={() => selectImage(index)}
                className={`block overflow-hidden rounded-sm border transition-colors duration-state ease-out ${
                  active
                    ? 'border-mt-orange shadow-glow'
                    : 'border-mt-line opacity-70 hover:opacity-100'
                }`}
              >
                <Thumbnail image={image} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${image.name}`}
                onClick={() => removeImage(index)}
                className="absolute right-1 top-1 rounded-sm bg-mt-ink/80 px-1 font-mono text-[10px] leading-4 text-mt-text-dim hover:text-mt-orange"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

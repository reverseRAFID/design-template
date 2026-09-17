/**
 * Single-image export. The rendering itself lives in `@/lib/render-export`, which
 * the batch and multi-preset ZIPs share — there is one path to a pixel, here as
 * everywhere else.
 */

import { useCallback, useRef, useState } from 'react';

import { downloadBlob } from '@/lib/download';
import { exportFilename, todayLabelDate } from '@/lib/filename';
import { renderToBlob, type ExportFormat } from '@/lib/render-export';
import { useEditorStore, useScene } from '@/state/editor-store';
import type { AssetBundle } from '@/assets/loader';

export type { ExportFormat };

export interface ExportOptions {
  /** Brand layer alone, on transparency. Always PNG — a JPG has no alpha. */
  overlayOnly?: boolean;
}

export interface ExportControls {
  /** Renders, then hands the blob to the browser. Rejects with a readable Error. */
  exportImage: (format: ExportFormat, options?: ExportOptions) => Promise<void>;
  busy: boolean;
}

export function useExport(bundle: AssetBundle | null): ExportControls {
  const scene = useScene();
  const photo = useEditorStore((s) => s.image?.drawable ?? null);
  const [busy, setBusy] = useState(false);
  // Guards re-entry within one tick, which the state flag alone cannot.
  const running = useRef(false);

  const exportImage = useCallback(
    async (format: ExportFormat, options?: ExportOptions): Promise<void> => {
      if (running.current) return;
      if (!bundle) throw new Error('Brand assets are still loading — try again in a moment.');

      const overlayOnly = options?.overlayOnly ?? false;
      running.current = true;
      setBusy(true);
      try {
        // The HUD date is the date the file is written, not the date the preview
        // happened to be built on.
        const now = new Date();
        const blob = await renderToBlob({
          scene: { ...scene, stamp: todayLabelDate(now) },
          bundle,
          photo,
          // Transparency only survives PNG, so the overlay ignores the format.
          format: overlayOnly ? 'png' : format,
          overlayOnly,
        });
        downloadBlob(
          blob,
          exportFilename(scene.preset.id, overlayOnly ? 'png' : format, {
            now,
            ...(overlayOnly ? { suffix: 'overlay' } : {}),
          }),
        );
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [bundle, scene, photo],
  );

  return { exportImage, busy };
}

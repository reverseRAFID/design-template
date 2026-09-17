/**
 * Batch export to a ZIP (PRD Phase 3 § 3.2 / 3.3).
 *
 * One job per (photo × preset), rendered through the same `renderToBlob` the
 * single download uses. Two things make this more than a loop:
 *
 * 1. **Tone is detected per photo**, as the PRD requires. The scene's tone is only
 *    honoured when the user has overridden it; otherwise each image gets its own
 *    verdict from the same sampler the preview uses.
 * 2. **Renders are sequential.** Each one allocates a full-resolution canvas
 *    (1920×1080 and up); running twenty at once is how you lose the tab.
 */

import { useCallback, useRef, useState } from 'react';

import { computeLayout } from '@/engine/layout';
import { getPreset } from '@/engine/presets';
import { sampleTone } from '@/lib/auto-tone';
import { downloadBlob } from '@/lib/download';
import { exportFilename, todayLabelDate, zipFilename } from '@/lib/filename';
import { renderToBlob, type ExportFormat } from '@/lib/render-export';
import { useEditorStore, useScene } from '@/state/editor-store';
import type { AssetBundle } from '@/assets/loader';
import type { PresetId, Scene } from '@/engine/types';
import type { EditorImage } from '@/state/editor-store';

export interface BatchProgress {
  done: number;
  total: number;
  /** What is being rendered right now, for the mono readout. */
  current: string;
}

export interface BatchControls {
  /** Renders every photo × every preset into one ZIP. */
  exportZip: (presetIds: PresetId[], format: ExportFormat) => Promise<void>;
  busy: boolean;
  progress: BatchProgress | null;
}

/** Yield to the event loop so the progress readout can actually paint. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function useBatchExport(bundle: AssetBundle | null): BatchControls {
  const scene = useScene();
  const images = useEditorStore((s) => s.images);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const running = useRef(false);

  const exportZip = useCallback(
    async (presetIds: PresetId[], format: ExportFormat): Promise<void> => {
      if (running.current) return;
      if (!bundle) throw new Error('Brand assets are still loading — try again in a moment.');
      if (presetIds.length === 0) throw new Error('Pick at least one format to export.');
      if (images.length === 0) throw new Error('Load at least one photo first.');

      running.current = true;
      setBusy(true);
      setProgress({ done: 0, total: images.length * presetIds.length, current: '' });

      try {
        // Loaded lazily: ~100KB that a single-image export never needs.
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();

        let done = 0;
        const total = images.length * presetIds.length;
        const stamp = new Date();
        const stampText = todayLabelDate(stamp);
        const usedNames = new Set<string>();

        for (const image of images) {
          for (const presetId of presetIds) {
            const preset = getPreset(presetId);
            setProgress({ done, total, current: `${preset.name} · ${image.name}` });
            await breathe();

            const jobScene = sceneFor(scene, image, presetId, stampText);
            const toned = scene.toneOverridden
              ? jobScene
              : { ...jobScene, tone: autoTone(jobScene, image, bundle) ?? jobScene.tone };

            const blob = await renderToBlob({
              scene: toned,
              bundle,
              photo: image.drawable,
              format,
            });

            zip.file(uniqueName(usedNames, presetId, image.name, format, stamp), blob);
            done += 1;
            setProgress({ done, total, current: `${preset.name} · ${image.name}` });
          }
        }

        setProgress({ done, total, current: 'PACKING ZIP' });
        await breathe();
        const archive = await zip.generateAsync({ type: 'blob' });
        downloadBlob(archive, zipFilename('batch', stamp));
      } finally {
        running.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [bundle, scene, images],
  );

  return { exportZip, busy, progress };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The current treatment applied to one photo at one preset. Transform is reset
 * to identity: a pan framed for the photo on screen means nothing for the others.
 */
function sceneFor(
  scene: Scene,
  image: EditorImage,
  presetId: PresetId,
  stamp: string,
): Scene {
  return {
    ...scene,
    preset: getPreset(presetId),
    image: image.source,
    transform: { scale: 1, dx: 0, dy: 0 },
    // Every file in one archive carries the same date.
    stamp,
  };
}

/** This photo's own tone verdict, or null if it could not be sampled. */
function autoTone(scene: Scene, image: EditorImage, bundle: AssetBundle): ReturnType<typeof sampleTone> {
  const layout = computeLayout(scene, {
    bracu: bundle.bracu,
    mongoltori: bundle.mongoltori,
    sponsors: bundle.sponsors,
    meta: bundle.meta,
  });
  return sampleTone(layout, image.drawable);
}

/** Two photos named IMG_1234.jpg would otherwise collide inside the archive. */
function uniqueName(
  used: Set<string>,
  presetId: PresetId,
  photoName: string,
  format: ExportFormat,
  stamp: Date,
): string {
  const base = exportFilename(presetId, format, { suffix: photoName, now: stamp });
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let n = 2; ; n += 1) {
    const candidate = base.replace(/\.(png|jpg)$/, `-${n}.$1`);
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

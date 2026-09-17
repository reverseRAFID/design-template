/**
 * Wiring only. Every piece of behaviour lives in the engine, the store or a
 * component — this file boots the asset layer, arranges the shell, and owns the
 * two things that genuinely span the whole app: global keyboard shortcuts and
 * toasts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadAssets, type AssetBundle } from '@/assets/loader';
import {
  loadCustomSponsors,
  saveCustomSponsors,
  type CustomSponsor,
} from '@/assets/custom-sponsors';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { LeftRail } from '@/components/layout/LeftRail';
import { RightPanel } from '@/components/layout/RightPanel';
import { BatchBar } from '@/components/controls/BatchBar';
import { Dropzone, type DropzoneImage } from '@/components/controls/Dropzone';
import { ExportBar, type ExportFormat } from '@/components/controls/ExportBar';
import { LabelField } from '@/components/controls/LabelField';
import { PresetPicker } from '@/components/controls/PresetPicker';
import { ShareLink } from '@/components/controls/ShareLink';
import { SegmentedToggle } from '@/components/controls/SegmentedToggle';
import { Slider } from '@/components/controls/Slider';
import { SponsorList } from '@/components/controls/SponsorList';
import { SponsorUpload } from '@/components/controls/SponsorUpload';
import { PreviewStage } from '@/components/preview/PreviewStage';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Pill } from '@/components/ui/Pill';
import { ToastHost, useToasts } from '@/components/ui/Toast';
import { PRESETS } from '@/engine/presets';
import { useBatchExport } from '@/hooks/use-batch-export';
import { useExport } from '@/hooks/use-export';
import { readShareHash } from '@/lib/share-url';
import { registerSponsors, hasPersistedSelection, useEditorStore } from '@/state/editor-store';
import type { PresetId, Tone } from '@/engine/types';

const TONE_OPTIONS = [
  { value: 'dark' as Tone, label: 'DARK' },
  { value: 'light' as Tone, label: 'LIGHT' },
] as const;

export function App(): JSX.Element {
  const [bundle, setBundle] = useState<AssetBundle | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  // Read once; every change re-runs the boot effect, which re-measures the logos.
  const [uploaded, setUploaded] = useState<CustomSponsor[]>(loadCustomSponsors);
  const toasts = useToasts();
  const { exportImage, busy } = useExport(bundle);
  const batch = useBatchExport(bundle);

  const presetId = useEditorStore((s) => s.presetId);
  const setPreset = useEditorStore((s) => s.setPreset);
  const image = useEditorStore((s) => s.image);
  const imageCount = useEditorStore((s) => s.images.length);
  const addImages = useEditorStore((s) => s.addImages);
  const tone = useEditorStore((s) => s.tone);
  const setTone = useEditorStore((s) => s.setTone);
  const toneOverridden = useEditorStore((s) => s.toneOverridden);
  const frame = useEditorStore((s) => s.frame);
  const toggleFrame = useEditorStore((s) => s.toggleFrame);
  const scrim = useEditorStore((s) => s.scrim);
  const setScrim = useEditorStore((s) => s.setScrim);
  const label = useEditorStore((s) => s.label);
  const setLabel = useEditorStore((s) => s.setLabel);
  const setAllSponsors = useEditorStore((s) => s.setAllSponsors);
  const includeSponsors = useEditorStore((s) => s.includeSponsors);
  const applyShared = useEditorStore((s) => s.applyShared);
  const resetDefaults = useEditorStore((s) => s.resetDefaults);

  // --- boot ---------------------------------------------------------------
  useEffect(() => {
    let live = true;
    loadAssets(undefined, uploaded)
      .then(async (loaded) => {
        await loaded.ready;
        if (!live) return;
        registerSponsors(loaded.meta);
        // First run has no persisted choice; show every sponsor rather than none.
        if (!hasPersistedSelection()) setAllSponsors(true);
        // An uploaded logo is always shown: the user just chose it.
        includeSponsors(uploaded.map((entry) => entry.slug));
        // A shared link is an explicit instruction and outranks both of those.
        // Applied after registerSponsors so its slug list can be ordered.
        const shared = readShareHash(window.location.hash);
        if (shared) {
          applyShared(shared);
          toasts.push('SETTINGS LOADED FROM LINK', 'ok');
        }
        setBundle(loaded);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setBootError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAllSponsors, applyShared, includeSponsors, uploaded]);

  // --- export -------------------------------------------------------------
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        await exportImage(format);
        toasts.push(`EXPORTED ${format.toUpperCase()}`, 'ok');
      } catch (err) {
        toasts.push(err instanceof Error ? err.message : 'EXPORT FAILED', 'warn');
      }
    },
    [exportImage, toasts],
  );

  // --- keyboard -----------------------------------------------------------
  // Held in a ref so the listener can stay mounted once instead of rebinding on
  // every preset change.
  const shortcuts = useRef({ presetId, setPreset, setTone, toggleFrame, handleExport, image });
  shortcuts.current = { presetId, setPreset, setTone, toggleFrame, handleExport, image };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      // Never steal keys from a control the user is actually operating.
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const s = shortcuts.current;
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === 's') {
        event.preventDefault();
        if (s.image) void s.handleExport('png');
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (key === 'arrowdown' || key === 'arrowup') {
        const index = PRESETS.findIndex((p) => p.id === s.presetId);
        const next = PRESETS[(index + (key === 'arrowdown' ? 1 : PRESETS.length - 1)) % PRESETS.length];
        if (next) {
          event.preventDefault();
          s.setPreset(next.id);
        }
        return;
      }
      // D / L set the tone explicitly, so they count as a manual override.
      if (key === 'd') s.setTone('dark', true);
      else if (key === 'l') s.setTone('light', true);
      else if (key === 'f') s.toggleFrame();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- strip overflow -----------------------------------------------------
  const droppedKey = useRef('');
  const onDropped = useCallback(
    (dropped: string[]) => {
      const key = dropped.join(',');
      if (key === droppedKey.current) return; // one toast per change, not per frame
      droppedKey.current = key;
      if (dropped.length) {
        toasts.push(`STRIP OVERFLOW — DROPPED ${dropped.length} LOGO(S)`, 'warn');
      }
    },
    [toasts],
  );

  const handleExportOverlay = useCallback(async () => {
    try {
      await exportImage('png', { overlayOnly: true });
      toasts.push('EXPORTED OVERLAY PNG', 'ok');
    } catch (err) {
      toasts.push(err instanceof Error ? err.message : 'EXPORT FAILED', 'warn');
    }
  }, [exportImage, toasts]);

  const handleExportZip = useCallback(
    async (presetIds: PresetId[], format: ExportFormat) => {
      try {
        await batch.exportZip(presetIds, format);
        toasts.push('ZIP DOWNLOADED', 'ok');
      } catch (err) {
        toasts.push(err instanceof Error ? err.message.toUpperCase() : 'ZIP FAILED', 'warn');
      }
    },
    [batch, toasts],
  );

  const handleUploadedChange = useCallback(
    (next: CustomSponsor[]) => {
      try {
        saveCustomSponsors(next);
        // Re-running the boot effect re-measures optical bounds for the new logo,
        // which the layout needs before it can place it.
        setUploaded(next);
      } catch (err) {
        toasts.push(err instanceof Error ? err.message.toUpperCase() : 'COULD NOT SAVE', 'warn');
      }
    },
    [toasts],
  );

  const handleImages = useCallback(
    (loaded: DropzoneImage[]) => {
      addImages(loaded);
      const first = loaded[0];
      toasts.push(
        loaded.length === 1 && first
          ? `LOADED ${first.name.toUpperCase()}`
          : `LOADED ${loaded.length} PHOTOS`,
        'ok',
      );
    },
    [addImages, toasts],
  );

  const handleImageError = useCallback(
    (message: string) => toasts.push(message.toUpperCase(), 'warn'),
    [toasts],
  );

  const placeholder = bundle?.anyPlaceholder ?? false;
  const scrimPercent = useMemo(() => (v: number) => `${Math.round(v * 100)}%`, []);

  if (bootError) {
    return (
      <main className="mx-auto max-w-xl p-10">
        <Header placeholder={false} />
        <Eyebrow className="mt-8">ASSETS FAILED TO LOAD</Eyebrow>
        <p className="mt-2 font-mono text-mt-warn">{bootError}</p>
      </main>
    );
  }

  return (
    <>
      <AppShell
        header={<Header placeholder={placeholder} />}
        left={
          <LeftRail>
            <Eyebrow>FORMAT</Eyebrow>
            <PresetPicker />
            <Eyebrow className="mt-6">SOURCE</Eyebrow>
            <Dropzone
              onImages={handleImages}
              onError={handleImageError}
              hasImage={Boolean(image)}
            />
          </LeftRail>
        }
        centre={<PreviewStage bundle={bundle} onDropped={onDropped} />}
        right={
          <RightPanel>
            <Eyebrow>TREATMENT</Eyebrow>
            <SegmentedToggle
              label="Tone"
              options={TONE_OPTIONS}
              value={tone}
              onChange={(v) => setTone(v, true)}
              {...(toneOverridden ? {} : { autoValue: tone })}
            />
            <SegmentedToggle
              label="Frame"
              options={[
                { value: false, label: 'OFF' },
                { value: true, label: 'ON' },
              ]}
              value={frame}
              onChange={toggleFrame}
            />
            {/* The note is drawn on the sponsor banner, which is always present,
                so it is no longer gated on the frame toggle. */}
            <LabelField value={label} onChange={setLabel} />

            {/* Only dark tone has a scrim to adjust — see D24. */}
            {tone === 'dark' ? (
              <Slider
                label="Scrim"
                value={scrim}
                min={0}
                max={1}
                step={0.05}
                onChange={setScrim}
                format={scrimPercent}
              />
            ) : null}

            <Eyebrow className="mt-6">SPONSORS</Eyebrow>
            {bundle ? (
              <SponsorList
                bundle={bundle}
                onSaved={(outcome) =>
                  toasts.push(
                    outcome === 'written'
                      ? 'SAVED TO manifest.json — COMMIT IT'
                      : 'manifest.json DOWNLOADED — REPLACE public/brand/sponsors/manifest.json',
                    'ok',
                  )
                }
                onError={(message) => toasts.push(message.toUpperCase(), 'warn')}
              />
            ) : (
              <p className="mt-telemetry">LOADING…</p>
            )}

            <div className="mt-6">
              <ExportBar
                onExport={handleExport}
                onExportOverlay={handleExportOverlay}
                busy={busy}
                disabled={!image}
              />
              <Pill as="button" variant="ghost" size="sm" className="mt-3" onClick={resetDefaults}>
                RESET TO DEFAULTS
              </Pill>
            </div>

            <div className="mt-6 border-t border-mt-line pt-5">
              <SponsorUpload
                bundle={bundle}
                uploaded={uploaded}
                onChange={handleUploadedChange}
                onError={(message) => toasts.push(message.toUpperCase(), 'warn')}
                onDone={(message) => toasts.push(message, 'ok')}
              />
            </div>

            <div className="mt-6 border-t border-mt-line pt-5">
              <ShareLink />
            </div>

            <div className="mt-6 border-t border-mt-line pt-5">
              <BatchBar
                onExportZip={handleExportZip}
                busy={batch.busy}
                progress={batch.progress}
                imageCount={imageCount}
                currentPresetId={presetId}
              />
            </div>
          </RightPanel>
        }
      />
      <ToastHost toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </>
  );
}

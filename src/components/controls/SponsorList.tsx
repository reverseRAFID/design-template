import { useEffect, useMemo, useRef, useState } from 'react';

import type { AssetBundle } from '@/assets/loader';
import { applyArrangement, tierLabel } from '@/assets/manifest';
import { saveManifest, type SaveOutcome } from '@/lib/manifest-writer';
import { Badge } from '@/components/ui/Badge';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Pill } from '@/components/ui/Pill';
import type { LogoMetrics, SponsorMeta, Tone } from '@/engine/types';
import { useEditorStore } from '@/state/editor-store';

/** Thumbnail tile size in CSS pixels. UI chrome, not overlay geometry — no metrics.ts constant applies. */
const THUMB_W = 40;
const THUMB_H = 24;

/**
 * The loader inverts scene tone -> artwork: a 'dark' scene takes the cream
 * (`*-light.svg`) art. The rail is dark, so 'dark' is what makes a thumbnail
 * visible here. Passing 'light' would fetch the ink art and draw black on black.
 */
const THUMB_TONE: Tone = 'dark';

/** Retina thumbnails without letting a 3x display triple the raster cache. */
const MAX_DPR = 2;

interface TierGroup {
  tier: number;
  sponsors: SponsorMeta[];
}

function groupByTier(
  meta: Record<string, SponsorMeta>,
  order: readonly string[],
  tiers: Record<string, number>,
): TierGroup[] {
  const byTier = new Map<number, SponsorMeta[]>();
  // Walk the dragged order first so each bucket reads exactly left-to-right as the
  // strip draws it; anything not yet in that list keeps its manifest position.
  const rank = new Map(order.map((slug, index) => [slug, index]));
  const sorted = Object.values(meta)
    .slice()
    .sort((a, b) => (rank.get(a.slug) ?? Infinity) - (rank.get(b.slug) ?? Infinity));
  for (const sponsor of sorted) {
    // The dragged tier wins: a sponsor moved into another row belongs there.
    const tier = tiers[sponsor.slug] ?? sponsor.tier;
    const bucket = byTier.get(tier);
    if (bucket) bucket.push(sponsor);
    else byTier.set(tier, [sponsor]);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, sponsors]) => ({ tier, sponsors }));
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = words.map((word) => word[0] ?? '').join('');
  return (letters || name.slice(0, 2)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

interface ThumbProps {
  bundle: AssetBundle;
  slug: string;
  name: string;
  metrics: LogoMetrics | undefined;
}

/**
 * Rasters arrive asynchronously, so this never blocks a render: it paints when
 * the bitmap lands and shows the sponsor's initials until (or instead of) that.
 */
function SponsorThumb({ bundle, slug, name, metrics }: ThumbProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!metrics) return;
    setPainted(false);

    let stop: (() => void) | undefined;
    let done = false;

    const paint = (): void => {
      const canvas = canvasRef.current;
      if (done || !canvas) return;

      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);
      const source = bundle.raster(slug, THUMB_TONE, Math.round(THUMB_H * dpr));
      if (!source) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = Math.round(THUMB_W * dpr);
      canvas.height = Math.round(THUMB_H * dpr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Crop to the measured ink box so padding in the SVG does not shrink the mark.
      const sx = metrics.optical.x * source.width;
      const sy = metrics.optical.y * source.height;
      const sw = Math.max(1, metrics.optical.w * source.width);
      const sh = Math.max(1, metrics.optical.h * source.height);

      const scale = Math.min(canvas.width / sw, canvas.height / sh);
      const dw = sw * scale;
      const dh = sh * scale;

      ctx.imageSmoothingEnabled = true;
      // Drawable is structural (engine/types.ts keeps the DOM lib out); the loader
      // only ever hands back a real ImageBitmap.
      ctx.drawImage(
        source as unknown as CanvasImageSource,
        sx,
        sy,
        sw,
        sh,
        (canvas.width - dw) / 2,
        (canvas.height - dh) / 2,
        dw,
        dh,
      );

      done = true;
      stop?.();
      setPainted(true);
    };

    paint();
    if (!done) stop = bundle.onRaster(paint);

    return () => {
      done = true;
      stop?.();
    };
  }, [bundle, slug, metrics]);

  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-mt-surface-2"
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      {painted ? null : (
        <span
          className="mt-telemetry absolute inset-0 flex items-center justify-center text-mt-text-mute"
          aria-hidden="true"
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/** A sponsor's current tier, override first. Mirrors the store's own rule. */
function bundleTier(
  meta: Record<string, SponsorMeta>,
  tiers: Record<string, number>,
  slug: string,
): number {
  return tiers[slug] ?? meta[slug]?.tier ?? 1;
}

export interface SponsorListProps {
  bundle: AssetBundle;
  /** How the manifest was saved, so App can say where the file went. */
  onSaved?: (outcome: SaveOutcome) => void;
  onError?: (message: string) => void;
}

export function SponsorList({ bundle, onSaved, onError }: SponsorListProps): JSX.Element {
  const selectedSponsors = useEditorStore((s) => s.selectedSponsors);
  const toggleSponsor = useEditorStore((s) => s.toggleSponsor);
  const setTier = useEditorStore((s) => s.setTier);
  const setAllSponsors = useEditorStore((s) => s.setAllSponsors);
  const sponsorOrder = useEditorStore((s) => s.sponsorOrder);
  const sponsorTiers = useEditorStore((s) => s.sponsorTiers);
  const moveSponsor = useEditorStore((s) => s.moveSponsor);
  const moveSponsorToTier = useEditorStore((s) => s.moveSponsorToTier);
  const nudgeSponsor = useEditorStore((s) => s.nudgeSponsor);
  const arrangementDirty = useEditorStore((s) => s.arrangementDirty);
  const revertArrangement = useEditorStore((s) => s.revertArrangement);
  const commitArrangement = useEditorStore((s) => s.commitArrangement);
  const [saving, setSaving] = useState(false);

  /**
   * Saving writes the arrangement into the MANIFEST — the file in the repo — so it
   * follows the project rather than this browser (docs/DECISIONS.md D30).
   */
  async function save(): Promise<void> {
    setSaving(true);
    try {
      const next = applyArrangement(bundle.manifest, sponsorOrder, sponsorTiers);
      const outcome = await saveManifest(next);
      onSaved?.(outcome);
      // Clean again — but by adopting what was written, not by reverting to the
      // stale in-memory order, which would show the board snapping back.
      if (outcome === 'written') commitArrangement();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not save the arrangement.');
    } finally {
      setSaving(false);
    }
  }
  const [dragging, setDragging] = useState<string | null>(null);

  const groups = useMemo(
    () => groupByTier(bundle.meta, sponsorOrder, sponsorTiers),
    [bundle, sponsorOrder, sponsorTiers],
  );
  const selected = useMemo(() => new Set(selectedSponsors), [selectedSponsors]);
  const total = Object.keys(bundle.meta).length;

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="sr-only">Sponsors included in the bottom strip</legend>

      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="mt-telemetry text-mt-text-mute">
          {selected.size}/{total} included
        </span>
        <span className="flex items-center gap-1">
          <Pill variant="ghost" size="sm" aria-label="Include every sponsor" onClick={() => setAllSponsors(true)}>
            ALL
          </Pill>
          <Pill variant="ghost" size="sm" aria-label="Include no sponsors" onClick={() => setAllSponsors(false)}>
            NONE
          </Pill>
        </span>
      </div>

      {/* Dragging is immediate but unsaved; saving rewrites manifest.json, which
          is what makes the board follow the project instead of this browser. */}
      <div className="flex items-center gap-2 border-y border-mt-line py-2">
        <Pill
          variant={arrangementDirty ? 'outline' : 'ghost'}
          size="sm"
          active={arrangementDirty}
          disabled={saving || !arrangementDirty}
          onClick={() => void save()}
        >
          {saving ? 'SAVING…' : 'SAVE POSITIONS'}
        </Pill>
        {arrangementDirty ? (
          <Pill
            variant="ghost"
            size="sm"
            aria-label="Discard unsaved changes and use the manifest order"
            onClick={revertArrangement}
          >
            REVERT
          </Pill>
        ) : null}
      </div>
      <p className="mt-telemetry pb-1 pt-1.5 text-mt-text-mute">
        {arrangementDirty ? '↳ UNSAVED — SAVE TO WRITE manifest.json' : '◆ MATCHES manifest.json'}
      </p>

      {total === 0 ? (
        <p className="mt-telemetry text-mt-text-mute">No sponsors in manifest</p>
      ) : null}

      {groups.map((group) => (
        <div
          key={group.tier}
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            // Only fires when the drop missed a row — append to this tier.
            event.preventDefault();
            if (dragging) moveSponsorToTier(dragging, group.tier);
            setDragging(null);
          }}
          className={`rounded-md pt-4 transition-colors duration-state ease-out first:pt-0 ${
            dragging && bundleTier(bundle.meta, sponsorTiers, dragging) !== group.tier
              ? 'bg-mt-surface-2/40'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>
              {`TIER ${String(group.tier).padStart(2, '0')} — ${tierLabel(bundle.manifest, group.tier).toUpperCase()}`}
            </Eyebrow>
            <span className="flex items-center gap-1">
              <Pill
                variant="ghost"
                size="sm"
                aria-label={`Include every tier ${group.tier} sponsor`}
                onClick={() => setTier(group.tier, true)}
              >
                ALL
              </Pill>
              <Pill
                variant="ghost"
                size="sm"
                aria-label={`Include no tier ${group.tier} sponsor`}
                onClick={() => setTier(group.tier, false)}
              >
                NONE
              </Pill>
            </span>
          </div>

          <ul className="mt-1 flex flex-col">
            {group.sponsors.map((sponsor) => {
              const metrics = bundle.sponsors[sponsor.slug];
              const on = selected.has(sponsor.slug);
              const isDragging = dragging === sponsor.slug;
              return (
                <li
                  key={sponsor.slug}
                  draggable
                  onDragStart={(event) => {
                    setDragging(sponsor.slug);
                    event.dataTransfer.effectAllowed = 'move';
                    // Firefox ignores a drag that carries no data at all.
                    event.dataTransfer.setData('text/plain', sponsor.slug);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => {
                    // Any row accepts any sponsor: dropping across tiers is how a
                    // sponsor is promoted or demoted.
                    if (!dragging || dragging === sponsor.slug) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) moveSponsor(dragging, sponsor.slug);
                    setDragging(null);
                  }}
                  className={isDragging ? 'opacity-40' : undefined}
                >
                  <label
                    className="group flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 transition-colors duration-state hover:bg-mt-surface-2"
                    htmlFor={`sponsor-${sponsor.slug}`}
                  >
                    <span
                      aria-hidden="true"
                      title="Drag to reorder, or into another tier"
                      className="cursor-grab select-none font-mono text-[11px] leading-none text-mt-text-mute"
                    >
                      ⠿
                    </span>
                    <input
                      id={`sponsor-${sponsor.slug}`}
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSponsor(sponsor.slug)}
                      className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-mt-line-strong bg-mt-surface-2 transition-colors duration-state checked:border-mt-orange checked:bg-mt-orange"
                    />
                    <SponsorThumb
                      bundle={bundle}
                      slug={sponsor.slug}
                      name={sponsor.name}
                      metrics={metrics}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-4">
                      {sponsor.name}
                    </span>
                    {(metrics?.placeholder ?? sponsor.placeholder) ? <Badge tone="placeholder" /> : null}
                    {/* Kept in flow when off so toggling never shifts the row. */}
                    <span aria-hidden="true" className={on ? 'text-mt-orange' : 'text-transparent'}>
                      ◆
                    </span>

                    {/* Dragging is mouse-only, so the same move needs buttons too. */}
                    <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-state focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={`Move ${sponsor.name} earlier in tier ${sponsor.tier}`}
                        onClick={(event) => {
                          event.preventDefault();
                          nudgeSponsor(sponsor.slug, -1);
                        }}
                        className="px-1 font-mono text-[11px] leading-4 text-mt-text-mute hover:text-mt-orange"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${sponsor.name} later in tier ${sponsor.tier}`}
                        onClick={(event) => {
                          event.preventDefault();
                          nudgeSponsor(sponsor.slug, 1);
                        }}
                        className="px-1 font-mono text-[11px] leading-4 text-mt-text-mute hover:text-mt-orange"
                      >
                        ↓
                      </button>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}

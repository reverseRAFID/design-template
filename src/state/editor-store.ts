/**
 * The single source of editor truth. Everything the user can change lives here;
 * `useScene()` projects it into the `Scene` the pure engine consumes.
 *
 * Two things deliberately sit OUTSIDE React state:
 *  - the sponsor registry, because it is loaded-once asset metadata, not UI state;
 *  - `frameTouched`, because it is a session-only memory of intent and persisting
 *    it would make the per-preset frame default unreachable forever.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { DEFAULT_SCRIM, MAX_ZOOM, MIN_ZOOM } from '@/engine/metrics';
import { DEFAULT_PRESET_ID, getPreset, getPresetOrDefault } from '@/engine/presets';
import { IDENTITY_TRANSFORM } from '@/engine/types';
import type { ImageTransform, PresetId, Scene, SourceImage, SponsorMeta, Tone } from '@/engine/types';
import { todayLabelDate } from '@/lib/filename';
import {
  clearArrangement as clearArrangementFromStorage,
  clearPersisted,
  loadArrangement,
  loadPersisted,
  saveArrangement as saveArrangementToStorage,
  savePersisted,
} from '@/lib/persist';
import type { PersistedState } from '@/lib/persist';
import type { SharedSettings } from '@/lib/share-url';

/** The uploaded photo: its intrinsic size for the engine, plus what canvas can draw. */
export interface EditorImage {
  source: SourceImage;
  drawable: ImageBitmap | HTMLImageElement;
  name: string;
}

/** The data half of the store, split out so the reset helpers can be typed. */
interface EditorData {
  presetId: PresetId;
  /** Every loaded photo, in the order they were added. */
  images: EditorImage[];
  /** Index into `images`. -1 when the list is empty. */
  activeIndex: number;
  /**
   * `images[activeIndex]`, kept in sync by the store rather than derived at the
   * call site: every component and hook that renders reads exactly one photo, and
   * making them all index the array would be a lot of places to get wrong.
   */
  image: EditorImage | null;
  transform: ImageTransform;
  tone: Tone;
  toneOverridden: boolean;
  frame: boolean;
  scrim: number;
  selectedSponsors: string[];
  /** Explicit order within each tier, set by dragging. Always the full list. */
  sponsorOrder: string[];
  /** Tier overrides, set by dragging a sponsor into another tier's row. */
  sponsorTiers: Record<string, number>;
  /** True when an arrangement has been pinned. Drives the UI's saved/unsaved hint. */
  arrangementPinned: boolean;
  label: string;
}

export interface EditorState extends EditorData {
  setPreset(id: PresetId): void;
  /** Replaces the whole list with one photo (or clears it). */
  setImage(img: EditorImage | null): void;
  /** Appends, and selects the first of the newly added. */
  addImages(images: EditorImage[]): void;
  selectImage(index: number): void;
  removeImage(index: number): void;
  clearImages(): void;
  setTransform(t: Partial<ImageTransform>): void;
  resetTransform(): void;
  setTone(tone: Tone, overridden: boolean): void;
  toggleFrame(): void;
  setFrame(on: boolean): void;
  setScrim(v: number): void;
  toggleSponsor(slug: string): void;
  setTier(tier: number, on: boolean): void;
  setAllSponsors(on: boolean): void;
  /**
   * Union these slugs into the selection. Used for logos uploaded through the
   * app: uploading one and then finding it unticked reads as the feature failing.
   */
  includeSponsors(slugs: readonly string[]): void;
  /**
   * Move `slug` so it sits immediately before `beforeSlug`. Crossing tiers is
   * allowed and re-ranks the sponsor: it adopts the target's tier, which is also
   * the row it will be drawn on.
   */
  moveSponsor(slug: string, beforeSlug: string): void;
  /** Drop onto a tier with no particular neighbour: append to the end of that row. */
  moveSponsorToTier(slug: string, tier: number): void;
  /** Keyboard equivalent of a drag: one step left or right within the tier. */
  nudgeSponsor(slug: string, delta: -1 | 1): void;
  /**
   * Pin the current arrangement. Written immediately to its own key, and reapplied
   * on every boot, so nothing can quietly put the board back to manifest order.
   */
  saveArrangement(): void;
  /** Drop the pinned arrangement and go back to the manifest's tiers and order. */
  clearArrangement(): void;
  setLabel(v: string): void;
  /** Apply a shared settings link. Treated as a deliberate choice, like a click. */
  applyShared(settings: SharedSettings): void;
  resetDefaults(): void;
}

const DEFAULT_TONE: Tone = 'dark';

/** Tier overrides, with the entry dropped when it matches the manifest again. */
function withTier(
  overrides: Record<string, number>,
  slug: string,
  tier: number,
): Record<string, number> {
  const next = { ...overrides };
  if (sponsorMeta[slug]?.tier === tier) delete next[slug];
  else next[slug] = tier;
  return next;
}

// ---------------------------------------------------------------------------
// Sponsor registry — populated once by the asset loader, read by tier actions
// ---------------------------------------------------------------------------

let sponsorMeta: Record<string, SponsorMeta> = {};

export function registerSponsors(meta: Record<string, SponsorMeta>): void {
  sponsorMeta = meta;

  // A pinned arrangement wins over whatever the volatile state happens to hold —
  // that pin is the user saying "this is the board", and it has to survive.
  const pinned = loadArrangement();
  const base = pinned ? pinned.order : useEditorStore.getState().sponsorOrder;

  // Reconcile with the manifest: keep the slugs the user arranged, in their order,
  // then append anything new by its manifest position. Adding a sponsor therefore
  // never scrambles an arrangement.
  const known = registrySlugs();
  const kept = base.filter((slug) => slug in meta);
  const seen = new Set(kept);

  useEditorStore.setState({
    sponsorOrder: [...kept, ...known.filter((slug) => !seen.has(slug))],
    ...(pinned
      ? {
          // Drop overrides for sponsors that no longer exist.
          sponsorTiers: Object.fromEntries(
            Object.entries(pinned.tiers).filter(([slug]) => slug in meta),
          ),
          arrangementPinned: true,
        }
      : {}),
  });
}

/**
 * The tier a sponsor is actually in: its override if it has been dragged into
 * another row, otherwise the manifest's.
 */
export function effectiveTier(slug: string, overrides: Record<string, number>): number {
  return overrides[slug] ?? sponsorMeta[slug]?.tier ?? 1;
}

/** Index of the last entry belonging to `tier`, or -1. */
function lastIndexOfTier(
  order: readonly string[],
  tier: number,
  overrides: Record<string, number>,
): number {
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const slug = order[i];
    if (slug && effectiveTier(slug, overrides) === tier) return i;
  }
  return -1;
}

/** Registry order = the strip's own sort, so selections stay diff-friendly. */
function registrySlugs(): string[] {
  return Object.values(sponsorMeta)
    .slice()
    .sort((a, b) => a.tier - b.tier || a.order - b.order || a.slug.localeCompare(b.slug))
    .map((m) => m.slug);
}

function orderSelection(slugs: Iterable<string>): string[] {
  const chosen = new Set(slugs);
  const known = registrySlugs().filter((slug) => chosen.has(slug));
  // Slugs the registry has never heard of (stale persistence) are kept, not
  // silently dropped: the manifest may simply not have loaded yet.
  const unknown = [...chosen].filter((slug) => !Object.hasOwn(sponsorMeta, slug)).sort();
  return [...known, ...unknown];
}

// ---------------------------------------------------------------------------
// Boot state
// ---------------------------------------------------------------------------

const persisted = loadPersisted();

/** Pinned once, at module load, the same way `persisted` is. */
const pinnedArrangement = loadArrangement();

/**
 * True when a previous session stored a selection — including an empty one, which
 * is a real choice ("no sponsors") and must not be overwritten by setAllSponsors.
 */
const HAD_PERSISTED_SELECTION = persisted.selectedSponsors !== undefined;

export function hasPersistedSelection(): boolean {
  return HAD_PERSISTED_SELECTION;
}

/** Session-only: has the user aimed the frame toggle themselves yet? */
let frameTouched = false;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function bootState(): EditorData {
  const preset = getPresetOrDefault(persisted.presetId);
  return {
    presetId: preset.id,
    images: [],
    activeIndex: -1,
    image: null,
    transform: IDENTITY_TRANSFORM,
    tone: DEFAULT_TONE,
    toneOverridden: persisted.toneOverride ?? false,
    frame: persisted.frame ?? preset.defaultFrame,
    scrim: persisted.scrim ?? DEFAULT_SCRIM,
    selectedSponsors: persisted.selectedSponsors ?? [],
    sponsorOrder: persisted.sponsorOrder ?? [],
    sponsorTiers: persisted.sponsorTiers ?? {},
    arrangementPinned: pinnedArrangement !== null,
    label: persisted.label ?? '',
  };
}

/** Reset target. The photo is user content, not a setting, so it survives. */
function defaultState(): Omit<EditorData, 'image' | 'images' | 'activeIndex'> {
  const preset = getPreset(DEFAULT_PRESET_ID);
  return {
    presetId: preset.id,
    transform: IDENTITY_TRANSFORM,
    tone: DEFAULT_TONE,
    toneOverridden: false,
    frame: preset.defaultFrame,
    scrim: DEFAULT_SCRIM,
    selectedSponsors: registrySlugs(),
    sponsorOrder: registrySlugs(),
    sponsorTiers: {},
    arrangementPinned: false,
    label: '',
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...bootState(),

  setPreset(id) {
    const preset = getPreset(id);
    set((s) => ({
      presetId: preset.id,
      // A new canvas shape invalidates the old pan/zoom framing.
      transform: IDENTITY_TRANSFORM,
      frame: frameTouched ? s.frame : preset.defaultFrame,
    }));
  },

  setImage(img) {
    set({
      images: img ? [img] : [],
      activeIndex: img ? 0 : -1,
      image: img,
      transform: IDENTITY_TRANSFORM,
    });
  },

  addImages(incoming) {
    if (incoming.length === 0) return;
    set((s) => {
      const images = [...s.images, ...incoming];
      // Land on the first of the new batch, so a drop always shows what arrived.
      const activeIndex = s.images.length;
      return {
        images,
        activeIndex,
        image: images[activeIndex] ?? null,
        transform: IDENTITY_TRANSFORM,
      };
    });
  },

  selectImage(index) {
    set((s) => {
      if (index < 0 || index >= s.images.length || index === s.activeIndex) return {};
      return {
        activeIndex: index,
        image: s.images[index] ?? null,
        // Framing is per-photo; carrying a pan from another image is never right.
        transform: IDENTITY_TRANSFORM,
      };
    });
  },

  removeImage(index) {
    set((s) => {
      if (index < 0 || index >= s.images.length) return {};
      const images = s.images.filter((_, i) => i !== index);
      // Stay on the same slot where possible, else step back to the new last one.
      const activeIndex = images.length === 0 ? -1 : Math.min(s.activeIndex, images.length - 1);
      return {
        images,
        activeIndex,
        image: activeIndex >= 0 ? (images[activeIndex] ?? null) : null,
        transform: IDENTITY_TRANSFORM,
      };
    });
  },

  clearImages() {
    set({ images: [], activeIndex: -1, image: null, transform: IDENTITY_TRANSFORM });
  },

  setTransform(t) {
    set((s) => {
      const next = { ...s.transform, ...t };
      return {
        transform: {
          scale: clamp(finite(next.scale, IDENTITY_TRANSFORM.scale), MIN_ZOOM, MAX_ZOOM),
          dx: finite(next.dx, 0),
          dy: finite(next.dy, 0),
        },
      };
    });
  },

  resetTransform() {
    set({ transform: IDENTITY_TRANSFORM });
  },

  setTone(tone, overridden) {
    const s = get();
    // Auto-detection (overridden === false) never overrules a manual choice.
    if (!overridden && s.toneOverridden) return;
    if (s.tone === tone && s.toneOverridden === overridden) return;
    set({ tone, toneOverridden: overridden });
  },

  toggleFrame() {
    frameTouched = true;
    set((s) => ({ frame: !s.frame }));
  },

  setFrame(on) {
    frameTouched = true;
    set({ frame: on });
  },

  setScrim(v) {
    set({ scrim: clamp(finite(v, DEFAULT_SCRIM), 0, 1) });
  },

  toggleSponsor(slug) {
    markSelectionInitialised();
    set((s) => {
      const next = new Set(s.selectedSponsors);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return { selectedSponsors: orderSelection(next) };
    });
  },

  setTier(tier, on) {
    markSelectionInitialised();
    const slugs = Object.values(sponsorMeta)
      .filter((m) => m.tier === tier)
      .map((m) => m.slug);
    if (slugs.length === 0) return;

    set((s) => {
      const next = new Set(s.selectedSponsors);
      for (const slug of slugs) {
        if (on) next.add(slug);
        else next.delete(slug);
      }
      return { selectedSponsors: orderSelection(next) };
    });
  },

  setAllSponsors(on) {
    markSelectionInitialised();
    set({ selectedSponsors: on ? registrySlugs() : [] });
  },

  includeSponsors(slugs) {
    if (slugs.length === 0) return;
    markSelectionInitialised();
    set((s) => {
      const next = new Set(s.selectedSponsors);
      const before = next.size;
      for (const slug of slugs) next.add(slug);
      if (next.size === before) return {};
      return { selectedSponsors: orderSelection(next) };
    });
  },

  saveArrangement() {
    const s = get();
    saveArrangementToStorage({ order: s.sponsorOrder, tiers: s.sponsorTiers });
    set({ arrangementPinned: true });
  },

  clearArrangement() {
    clearArrangementFromStorage();
    set({ sponsorOrder: registrySlugs(), sponsorTiers: {}, arrangementPinned: false });
  },

  moveSponsor(slug, beforeSlug) {
    if (!(slug in sponsorMeta) || !(beforeSlug in sponsorMeta) || slug === beforeSlug) return;

    set((s) => {
      // The sponsor adopts the target's tier, so a drag across rows also changes
      // its rank. That is the intent: the row IS the tier.
      const tier = effectiveTier(beforeSlug, s.sponsorTiers);
      const order = s.sponsorOrder.filter((entry) => entry !== slug);
      const at = order.indexOf(beforeSlug);
      if (at < 0) return {};
      order.splice(at, 0, slug);

      return { sponsorOrder: order, sponsorTiers: withTier(s.sponsorTiers, slug, tier) };
    });
  },

  moveSponsorToTier(slug, tier) {
    if (!(slug in sponsorMeta)) return;

    set((s) => {
      const order = s.sponsorOrder.filter((entry) => entry !== slug);
      const at = lastIndexOfTier(order, tier, s.sponsorTiers) + 1;
      order.splice(at, 0, slug);
      return { sponsorOrder: order, sponsorTiers: withTier(s.sponsorTiers, slug, tier) };
    });
  },

  nudgeSponsor(slug, delta) {
    const s = get();
    const tier = effectiveTier(slug, s.sponsorTiers);
    // Keyboard nudging stays within the row; changing a sponsor's tier is a
    // deliberate act, not something an arrow key should do by overshooting.
    const siblings = s.sponsorOrder.filter((e) => effectiveTier(e, s.sponsorTiers) === tier);
    const at = siblings.indexOf(slug);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= siblings.length) return;

    const target = delta < 0 ? siblings[to] : siblings[to + 1];
    if (target) get().moveSponsor(slug, target);
    else get().moveSponsorToTier(slug, tier);
  },

  setLabel(v) {
    set({ label: v });
  },

  applyShared(settings) {
    frameTouched = true; // the link states a frame; a preset switch must not undo it
    markSelectionInitialised();
    set({
      ...(settings.sponsorOrder.length > 0
        ? { sponsorOrder: orderSelection(settings.sponsorOrder), sponsorTiers: settings.sponsorTiers }
        : {}),
      presetId: settings.presetId,
      tone: settings.tone,
      toneOverridden: settings.toneOverridden,
      frame: settings.frame,
      scrim: settings.scrim,
      selectedSponsors: orderSelection(settings.selectedSponsors),
      label: settings.label,
      transform: IDENTITY_TRANSFORM,
    });
  },

  resetDefaults() {
    frameTouched = false;
    persistSuppressed = true;
    // Photos are deliberately kept: "reset to defaults" is about the treatment,
    // not about throwing away the user's uploads.
    //
    // Nor does it discard a PINNED arrangement — that is curated separately, and
    // losing it to a treatment reset is exactly the surprise the pin exists to
    // prevent. An unpinned arrangement does go back to manifest order.
    const pinned = loadArrangement();
    set({
      ...defaultState(),
      ...(pinned
        ? { sponsorOrder: pinned.order, sponsorTiers: pinned.tiers, arrangementPinned: true }
        : {}),
    });
    persistSuppressed = false;
    cancelPersist();
    clearPersisted();
  },
}));

// ---------------------------------------------------------------------------
// Persistence — debounced, and never the photo or its transform
// ---------------------------------------------------------------------------

const PERSIST_DEBOUNCE_MS = 250;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistSuppressed = false;

/**
 * The sponsor selection starts empty and is seeded from the manifest once assets
 * load. Until that has happened the empty array means "not known yet", NOT "the
 * user wants no sponsors" — and writing it would make the next boot read a
 * deliberate empty strip. So the field is withheld from storage until something
 * actually sets it.
 */
let selectionInitialised = HAD_PERSISTED_SELECTION;

function markSelectionInitialised(): void {
  selectionInitialised = true;
}

function toPersisted(s: EditorState): PersistedState {
  return {
    presetId: s.presetId,
    toneOverride: s.toneOverridden,
    frame: s.frame,
    scrim: s.scrim,
    ...(selectionInitialised ? { selectedSponsors: s.selectedSponsors } : {}),
    sponsorOrder: s.sponsorOrder,
    sponsorTiers: s.sponsorTiers,
    label: s.label,
  };
}

function cancelPersist(): void {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
}

function flushPersist(): void {
  cancelPersist();
  savePersisted(toPersisted(useEditorStore.getState()));
}

// Dragging the scrim slider fires on every pointer move; one write per rest is plenty.
useEditorStore.subscribe(() => {
  if (persistSuppressed) return;
  cancelPersist();
  saveTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
});

if (typeof window !== 'undefined') {
  // A tab closed mid-debounce would otherwise lose the last change.
  window.addEventListener('pagehide', flushPersist);
}

// ---------------------------------------------------------------------------
// Scene projection
// ---------------------------------------------------------------------------

/**
 * The engine's input, memoised. A fresh Scene object every render would defeat
 * the layout memo and redraw the canvas on every unrelated state change.
 */
export function useScene(): Scene {
  const slice = useEditorStore(
    useShallow((s) => ({
      presetId: s.presetId,
      source: s.image?.source ?? null,
      transform: s.transform,
      tone: s.tone,
      toneOverridden: s.toneOverridden,
      frame: s.frame,
      scrim: s.scrim,
      selectedSponsors: s.selectedSponsors,
      sponsorOrder: s.sponsorOrder,
      sponsorTiers: s.sponsorTiers,
      label: s.label,
    })),
  );

  return useMemo<Scene>(
    () => ({
      // Stamped once per scene change. Exports re-stamp with their own moment, so
      // a session left open overnight still writes the right date on the file.
      stamp: todayLabelDate(),
      preset: getPreset(slice.presetId),
      image: slice.source ?? undefined,
      transform: slice.transform,
      tone: slice.tone,
      toneOverridden: slice.toneOverridden,
      frame: slice.frame,
      scrim: slice.scrim,
      selectedSponsors: slice.selectedSponsors,
      sponsorOrder: slice.sponsorOrder,
      sponsorTiers: slice.sponsorTiers,
      label: slice.label,
    }),
    // useShallow hands back the same object until a field actually changes.
    [slice],
  );
}

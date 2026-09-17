/**
 * The preview draw loop: store → layout → one canvas, on one rAF.
 *
 * The preview IS the export, scaled (CLAUDE.md rule 3): the backing store is the
 * preset's pixel size multiplied by a single factor k, the context is scaled by
 * that same k once, and every coordinate `renderComposition` sees is export-space.
 * No preview-only geometry exists anywhere in this file.
 *
 * Tone auto-detection lives here too, because it needs the same layout: the boxes
 * the logos will occupy are `layout.toneRegions`, and the photo it samples is the
 * cover-fitted one `layout.image` describes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { computeLayout } from '@/engine/layout';
import { renderComposition } from '@/engine/render';
import { readPalette } from '@/lib/palette';
import { useEditorStore, useScene } from '@/state/editor-store';
import type { AssetBundle } from '@/assets/loader';
import type { Layout, LayoutAssets, RasterProvider, Scene } from '@/engine/types';
import { sampleTone } from '@/lib/auto-tone';
import type { EditorImage } from '@/state/editor-store';

/** The photo, in the two forms canvas accepts. Mirrors the store's own field. */
type Photo = EditorImage['drawable'];

/** Never blow the preview up past 1 CSS px per export px — it would only go soft. */
const MAX_PREVIEW_SCALE = 1;

/** Settle time after the image or its framing changes, before re-detecting tone. */
const TONE_DEBOUNCE_MS = 150;

export interface CompositionHandle {
  /** Export-space layout, or null until the brand assets have loaded. */
  layout: Layout | null;
  /** CSS pixels per export pixel. Overlay UI (the safe-zone guide) draws with this. */
  scale: number;
  /** Request a repaint on the next frame. Repeated calls coalesce into one draw. */
  redraw: () => void;
}

// ---------------------------------------------------------------------------
// Stage measurement
// ---------------------------------------------------------------------------

interface Box {
  w: number;
  h: number;
}

/**
 * Measures the canvas's PARENT, never the canvas: the canvas's size is this
 * measurement's output, so observing it would be a feedback loop. PreviewStage
 * therefore gives the canvas a parent whose box is fixed by the stage
 * (`absolute inset-0`), independent of its children.
 */
function useStageBox(canvasRef: RefObject<HTMLCanvasElement>): Box {
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });

  useEffect(() => {
    const parent = canvasRef.current?.parentElement ?? null;
    if (!parent) return;

    const apply = (w: number, h: number): void => {
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    if (typeof ResizeObserver === 'undefined') {
      const rect = parent.getBoundingClientRect();
      apply(rect.width, rect.height);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasRef]);

  return box;
}

// ---------------------------------------------------------------------------
// Tone sampling
// ---------------------------------------------------------------------------

/** The slice of a 2D context tone sampling needs, so either canvas flavour fits. */
// ---------------------------------------------------------------------------
// useComposition
// ---------------------------------------------------------------------------

interface PaintInputs {
  scene: Scene;
  layout: Layout | null;
  bundle: AssetBundle | null;
  scale: number;
  photo: Photo | null;
  fontsReady: boolean;
}

export function useComposition(
  canvasRef: RefObject<HTMLCanvasElement>,
  bundle: AssetBundle | null,
): CompositionHandle {
  const scene = useScene();
  const photo = useEditorStore((s) => s.image?.drawable ?? null);
  const toneOverridden = useEditorStore((s) => s.toneOverridden);
  const setTone = useEditorStore((s) => s.setTone);

  const assets = useMemo<LayoutAssets | null>(
    () =>
      bundle
        ? {
            bracu: bundle.bracu,
            mongoltori: bundle.mongoltori,
            sponsors: bundle.sponsors,
            meta: bundle.meta,
          }
        : null,
    [bundle],
  );

  const layout = useMemo(() => (assets ? computeLayout(scene, assets) : null), [scene, assets]);

  const box = useStageBox(canvasRef);
  const scale = useMemo(() => {
    if (!layout || layout.W <= 0 || layout.H <= 0) return 0;
    if (box.w <= 0 || box.h <= 0) return 0;
    return Math.min(box.w / layout.W, box.h / layout.H, MAX_PREVIEW_SCALE);
  }, [box, layout]);

  // The frame's telemetry labels are skipped until the mono face is live, rather
  // than drawn in a fallback that would not match the export.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) {
      setFontsReady(true);
      return;
    }
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const inputs = useRef<PaintInputs>({ scene, layout, bundle, scale, photo, fontsReady });
  const frame = useRef<number | null>(null);

  const paint = useCallback(() => {
    frame.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const current = inputs.current;
    const { layout: l, bundle: b, scale: k } = current;
    // Nothing to draw yet: hide rather than leave the canvas at its intrinsic
    // 300×150 default, which would flash as an empty outlined box.
    if (!l || !b || !(k > 0)) {
      canvas.hidden = true;
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.hidden = false;

    // devicePixelRatio, the one place it is allowed to matter: the EXPORT backing
    // store is exactly the preset size (rule 6, see use-export), but the preview's
    // CSS box is k× the export size, so its backing store needs k·dpr× to stay
    // crisp on a retina screen. dpr changes the pixel density, never the geometry.
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const draw = k * dpr;

    const backingW = Math.max(1, Math.round(l.W * draw));
    const backingH = Math.max(1, Math.round(l.H * draw));
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    // Sized from the rounded backing store so the CSS box is a whole number of
    // device pixels — the sub-pixel difference from l.W·k is under one device px.
    canvas.style.width = `${backingW / dpr}px`;
    canvas.style.height = `${backingH / dpr}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, backingW, backingH);
    // Ask for rasters at the size they will actually occupy in DEVICE pixels.
    // The engine works in export space and knows nothing about `draw`, so without
    // this the preview requests a raster for the export height and then paints it
    // `draw`× larger — which on a retina screen is a visible upscale.
    const rasters: RasterProvider = (slug, artwork, height) =>
      b.raster(slug, artwork, height * draw);

    ctx.save();
    ctx.scale(draw, draw);
    renderComposition(ctx, {
      scene: current.scene,
      layout: l,
      palette: readPalette(),
      rasters,
      image: current.photo,
      fontsReady: current.fontsReady,
    });
    ctx.restore();
  }, [canvasRef]);

  const redraw = useCallback(() => {
    if (frame.current !== null) return;
    if (typeof requestAnimationFrame !== 'function') {
      paint();
      return;
    }
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  // One place publishes the paint inputs and asks for a frame, so N changes in a
  // tick still cost exactly one draw.
  useEffect(() => {
    inputs.current = { scene, layout, bundle, scale, photo, fontsReady };
    redraw();
  }, [scene, layout, bundle, scale, photo, fontsReady, redraw]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );

  // A logo raster that lands after the first draw must repaint, or the strip stays
  // empty until the next unrelated change.
  useEffect(() => bundle?.onRaster(redraw), [bundle, redraw]);

  const { transform, preset } = scene;
  useEffect(() => {
    // The store ignores an auto verdict once the user has overridden, but there is
    // no point reading 128×128 pixels to be ignored.
    if (!photo || toneOverridden) return;
    const timer = setTimeout(() => {
      const current = inputs.current.layout;
      if (!current) return;
      const tone = sampleTone(current, photo);
      if (tone) setTone(tone, false);
    }, TONE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `bundle` is in here because the sampling boxes come from the layout: a photo
    // dropped before the assets land would otherwise never be sampled at all.
  }, [photo, transform, preset, bundle, toneOverridden, setTone]);

  return { layout, scale, redraw };
}

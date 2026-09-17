/**
 * Framing gestures on the preview: drag to pan, wheel to zoom about the cursor,
 * double-click to reset, and a full keyboard equivalent (PRD § F2 asks for the
 * gestures, CLAUDE.md rule 7 asks that none of them be mouse-only).
 *
 * Everything is written in EXPORT-space pixels, because that is what
 * `ImageTransform` means. The element's measured CSS width against the preset's
 * pixel width gives the preview scale, so a drag of 10 CSS px moves the photo by
 * 10/scale export px and the store's clamp is the only limit that exists.
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { MAX_ZOOM, MIN_ZOOM } from '@/engine/metrics';
import { getPreset } from '@/engine/presets';
import { useEditorStore } from '@/state/editor-store';
import type { ImageTransform, Preset } from '@/engine/types';

/**
 * Interaction tuning, not overlay geometry — metrics.ts owns the numbers that end
 * up in an exported pixel, and none of these do.
 */
/** Arrow-key pan step, as a fraction of the canvas's shorter side. */
const PAN_STEP = 0.02;
/** Shift multiplies the pan step. */
const PAN_STEP_COARSE = 10;
/** Zoom ratio per +/- press. */
const KEY_ZOOM_STEP = 1.1;
/** Zoom ratio per pixel of wheel travel, applied exponentially. */
const WHEEL_ZOOM_RATE = 0.0015;
/** Wheel deltas arrive in lines or pages on some platforms; normalise to pixels. */
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;
/** How long the guide stays up after a keyboard nudge (there is no "key up" rest). */
const KEY_GESTURE_TAIL_MS = 600;

export interface PanZoomOptions {
  /** False disables every gesture — there is nothing to frame without a photo. */
  enabled: boolean;
}

export interface PanZoomState {
  /** A framing gesture is in progress: a pointer drag, or a recent keyboard nudge. */
  dragging: boolean;
}

interface DragOrigin {
  pointerId: number;
  clientX: number;
  clientY: number;
  dx: number;
  dy: number;
  /** CSS px per export px, frozen for the duration of the drag. */
  scale: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Pixels of wheel travel, whatever unit the platform reported. */
function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_PX;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE_PX;
  return event.deltaY;
}

export function usePanZoom(el: RefObject<HTMLElement>, opts: PanZoomOptions): PanZoomState {
  const [dragging, setDragging] = useState(false);

  // Read through refs so the listeners are attached exactly once: re-binding them
  // on every store change would drop a drag mid-gesture.
  const enabled = useRef(opts.enabled);
  enabled.current = opts.enabled;

  useEffect(() => {
    const node = el.current;
    if (!node) return;

    const drag = { current: null as DragOrigin | null };
    let keyTail: ReturnType<typeof setTimeout> | null = null;

    const preset = (): Preset => getPreset(useEditorStore.getState().presetId);
    const transform = (): ImageTransform => useEditorStore.getState().transform;
    const apply = (next: Partial<ImageTransform>): void =>
      useEditorStore.getState().setTransform(next);

    /** CSS px per export px, measured live — the stage resizes under the gesture. */
    const previewScale = (): number => {
      const width = node.getBoundingClientRect().width;
      const w = preset().w;
      return w > 0 && width > 0 ? width / w : 0;
    };

    const endKeyTail = (): void => {
      if (keyTail !== null) clearTimeout(keyTail);
      keyTail = setTimeout(() => {
        keyTail = null;
        if (!drag.current) setDragging(false);
      }, KEY_GESTURE_TAIL_MS);
      setDragging(true);
    };

    /**
     * Zoom so the export-space point (px, py) keeps the same photo pixel under it.
     * Derived from the cover-fit placement, and independent of the photo's size:
     * only the distance from the canvas centre matters.
     */
    const zoomAbout = (px: number, py: number, nextScale: number): void => {
      const t = transform();
      const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
      if (scale === t.scale) return;
      const ratio = scale / t.scale;
      const { w: W, h: H } = preset();
      apply({
        scale,
        dx: t.dx + (px - W / 2 - t.dx) * (1 - ratio),
        dy: t.dy + (py - H / 2 - t.dy) * (1 - ratio),
      });
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!enabled.current || drag.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const scale = previewScale();
      if (scale <= 0) return;

      const t = transform();
      drag.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        dx: t.dx,
        dy: t.dy,
        scale,
      };
      node.setPointerCapture(event.pointerId);
      setDragging(true);
      // Suppresses the browser's own image-drag and text selection — which also
      // suppresses the click's default focus, so focus is moved by hand. Without
      // it, clicking the preview then reaching for the arrow keys would do nothing.
      event.preventDefault();
      node.focus({ preventScroll: true });
    };

    const onPointerMove = (event: PointerEvent): void => {
      const origin = drag.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      apply({
        dx: origin.dx + (event.clientX - origin.clientX) / origin.scale,
        dy: origin.dy + (event.clientY - origin.clientY) / origin.scale,
      });
    };

    const endDrag = (event: PointerEvent): void => {
      const origin = drag.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      drag.current = null;
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      if (keyTail === null) setDragging(false);
    };

    const onWheel = (event: WheelEvent): void => {
      if (!enabled.current) return;
      // Non-passive: the page must not scroll while the photo is being zoomed.
      event.preventDefault();

      const rect = node.getBoundingClientRect();
      const width = preset().w;
      const scale = width > 0 && rect.width > 0 ? rect.width / width : 0;
      if (scale <= 0) return;

      const t = transform();
      zoomAbout(
        (event.clientX - rect.left) / scale,
        (event.clientY - rect.top) / scale,
        t.scale * Math.exp(-wheelPixels(event) * WHEEL_ZOOM_RATE),
      );
    };

    const onDoubleClick = (event: MouseEvent): void => {
      if (!enabled.current) return;
      event.preventDefault();
      useEditorStore.getState().resetTransform();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!enabled.current || event.altKey || event.ctrlKey || event.metaKey) return;

      const { w: W, h: H } = preset();
      const step = PAN_STEP * Math.min(W, H) * (event.shiftKey ? PAN_STEP_COARSE : 1);
      const t = transform();

      switch (event.key) {
        // Arrows move the photo the way a drag would, not the way a scrollbar
        // would: pressing Right does what dragging right does.
        case 'ArrowLeft':
          apply({ dx: t.dx - step });
          break;
        case 'ArrowRight':
          apply({ dx: t.dx + step });
          break;
        case 'ArrowUp':
          apply({ dy: t.dy - step });
          break;
        case 'ArrowDown':
          apply({ dy: t.dy + step });
          break;
        case '+':
        case '=':
          zoomAbout(W / 2, H / 2, t.scale * KEY_ZOOM_STEP);
          break;
        case '-':
        case '_':
          zoomAbout(W / 2, H / 2, t.scale / KEY_ZOOM_STEP);
          break;
        case '0':
          useEditorStore.getState().resetTransform();
          break;
        default:
          return;
      }

      event.preventDefault();
      endKeyTail();
    };

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
    node.addEventListener('lostpointercapture', endDrag);
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('dblclick', onDoubleClick);
    node.addEventListener('keydown', onKeyDown);

    return () => {
      if (keyTail !== null) clearTimeout(keyTail);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
      node.removeEventListener('lostpointercapture', endDrag);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('dblclick', onDoubleClick);
      node.removeEventListener('keydown', onKeyDown);
    };
  }, [el]);

  // A photo removed mid-drag leaves nothing to frame.
  useEffect(() => {
    if (!opts.enabled) setDragging(false);
  }, [opts.enabled]);

  return { dragging };
}

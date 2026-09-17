/**
 * The one bridge between CSS custom properties and canvas colour strings.
 *
 * The engine never touches `document` (docs/DECISIONS.md D7), so somebody has to
 * resolve `--mt-*` into a plain `Palette`. That somebody is this file, and only
 * this file — grep for `getComputedStyle` and you should find it here and in the
 * tone sampler, nowhere else.
 */

import { PALETTE_VARS } from '@/engine/render';
import type { Palette } from '@/engine/types';

/**
 * Mirrors the `:root` block of src/styles/tokens.css, which remains the source of
 * truth. These literals exist only because `getComputedStyle` returns empty
 * strings for custom properties under jsdom and in any headless render where the
 * stylesheet was never parsed — without them the canvas would draw `''`.
 *
 * If a token value changes in tokens.css, change it here too. Nothing else in
 * src/ may carry a brand hex (CLAUDE.md rule 2).
 */
export const FALLBACK_PALETTE: Palette = {
  orange: '#FF6B1A',
  orangeHot: '#FF7D33',
  orangeDeep: '#E55A00',
  cream: '#F4F3EE',
  ink: '#0B0B0B',
};

const PALETTE_KEYS = Object.keys(PALETTE_VARS) as (keyof Palette)[];

/** Null whenever there is no live CSSOM to ask — node, workers, a detached doc. */
function computedStyleOf(el?: Element): CSSStyleDeclaration | null {
  if (typeof globalThis.getComputedStyle !== 'function') return null;
  const target = el ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!target) return null;
  try {
    return globalThis.getComputedStyle(target);
  } catch {
    return null;
  }
}

/**
 * Resolve the brand palette from `el` (default: `<html>`). Any variable that
 * resolves empty keeps its fallback, so a partially themed subtree still yields a
 * complete palette rather than blank fills.
 */
export function readPalette(el?: Element): Palette {
  const resolved: Palette = { ...FALLBACK_PALETTE };
  const style = computedStyleOf(el);
  if (!style) return resolved;

  for (const key of PALETTE_KEYS) {
    const value = style.getPropertyValue(PALETTE_VARS[key]).trim();
    if (value) resolved[key] = value;
  }
  return resolved;
}

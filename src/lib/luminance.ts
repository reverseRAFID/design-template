/**
 * sRGB → relative luminance, per WCAG 2.x. Pure maths, no DOM: the engine's tone
 * detector runs in unit tests as well as in the browser.
 */

/** Linearise one 0..255 sRGB channel to 0..1. */
export function srgbToLinear(channel: number): number {
  // Clamp first: Math.pow of a negative base with a fractional exponent is NaN,
  // and a stray out-of-range sample must not poison a whole region's mean.
  const c = Math.min(255, Math.max(0, channel)) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0..1) of an 8-bit sRGB triple. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

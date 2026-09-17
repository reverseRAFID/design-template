/**
 * Dev-only smoke render. Draws every preset headlessly through the SAME
 * renderComposition() the browser uses and writes PNGs to .sample/.
 *
 * This is the check docs/04-TASKS.md asks for at the end of Phase 1: if the
 * engine is wrong, it is usually obvious here long before it is obvious in the UI.
 *
 *   npm run sample              # every preset, dark tone, no frame
 *   npm run sample -- --frame   # with the mission frame
 *   npm run sample -- --light   # light tone (ink artwork)
 *   npm run sample -- --overlay # brand layer alone, on transparency
 *   npm run sample -- --label "OUTREACH · DHAKA · 17.09.2026"
 *   npm run sample -- --photo img/outreach.jpg   # a real photo, with auto tone
 *
 * Not part of the app bundle and not shipped.
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeLayout } from '../src/engine/layout';
import { detectTone } from '../src/engine/tone';
import { PRESETS } from '../src/engine/presets';
import { renderComposition } from '../src/engine/render';
import { DEFAULT_SCRIM } from '../src/engine/metrics';
import { IDENTITY_TRANSFORM } from '../src/engine/types';
import { todayLabelDate } from '../src/lib/filename';
import type {
  Ctx2D,
  Drawable,
  LayoutAssets,
  LogoMetrics,
  Palette,
  Scene,
  SponsorMeta,
  Tone,
} from '../src/engine/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = join(ROOT, 'public/brand');
const OUT = join(ROOT, '.sample');

/** Mirrors src/styles/tokens.css. The engine never reads CSS, so we hand it these. */
const PALETTE: Palette = {
  orange: '#FF6B1A',
  orangeHot: '#FF7D33',
  orangeDeep: '#E55A00',
  cream: '#F4F3EE',
  ink: '#0B0B0B',
};

GlobalFonts.registerFromPath(join(ROOT, 'public/fonts/jetbrains-mono-var.woff2'), 'JetBrains Mono');

type Raster = Awaited<ReturnType<typeof loadImage>>;

const rasterCache = new Map<string, Raster>();

async function loadLogo(path: string, key: string): Promise<Raster> {
  const cached = rasterCache.get(key);
  if (cached) return cached;
  const img = await loadImage(join(BRAND, path));
  rasterCache.set(key, img);
  return img;
}

/** Brand logos may be svg or png — BRACU's light-tone mark is a PNG (D3). */
async function loadBrandLogo(slug: string, variant: string): Promise<Raster> {
  for (const ext of ['svg', 'png']) {
    const file = `${slug}-${variant}.${ext}`;
    if (existsSync(join(BRAND, file))) return loadLogo(file, `${slug}|${variant}`);
  }
  throw new Error(`no artwork for ${slug}-${variant}`);
}

/**
 * Optical bounds from a real alpha scan, so the sample exercises the same
 * cropping path the browser does rather than assuming a tight file.
 */
function measure(img: Raster, slug: string, placeholder: boolean): LogoMetrics {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);

  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if ((data[(y * img.width + x) * 4 + 3] ?? 0) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { slug, optical: { x: 0, y: 0, w: 1, h: 1 }, aspect: img.width / img.height, placeholder };
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    slug,
    optical: { x: minX / img.width, y: minY / img.height, w: w / img.width, h: h / img.height },
    aspect: w / h,
    placeholder,
  };
}

/**
 * The same verdict `src/lib/auto-tone.ts` reaches, reimplemented here because that
 * module imports through the `@/` alias, which tsx does not resolve from a script.
 * Kept deliberately thin — it calls the engine's own `detectTone`.
 */
function sampleToneLocal(layout: ReturnType<typeof computeLayout>, source: Raster | ReturnType<typeof createCanvas>): Tone | null {
  const placement = layout.image;
  if (!placement) return null;

  const w = 128;
  const h = Math.max(1, Math.round((w * layout.H) / layout.W));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(
    source as never,
    placement.sx,
    placement.sy,
    placement.sw,
    placement.sh,
    0,
    0,
    w,
    h,
  );

  const factor = w / layout.W;
  const regions = layout.toneRegions.regions.map((r) => ({
    x: r.x * factor,
    y: r.y * factor,
    w: r.w * factor,
    h: r.h * factor,
  }));
  return detectTone(ctx.getImageData(0, 0, w, h), regions, [...layout.toneRegions.weights]);
}

async function main(): Promise<void> {
  const wantFrame = process.argv.includes('--frame');
  const photoArg = process.argv.indexOf('--photo');
  const photoPath = photoArg >= 0 ? process.argv[photoArg + 1] : undefined;
  const overlayOnly = process.argv.includes('--overlay');
  const labelArg = process.argv.indexOf('--label');
  const label = labelArg >= 0 ? process.argv[labelArg + 1] : undefined;
  const tone: Tone = process.argv.includes('--light') ? 'light' : 'dark';
  const variant = tone === 'dark' ? 'light' : 'dark'; // artwork variant is the inverse of the tone

  mkdirSync(OUT, { recursive: true });

  const manifest = JSON.parse(
    readFileSync(join(BRAND, 'sponsors/manifest.json'), 'utf8'),
  ) as { sponsors: SponsorMeta[] };

  // Both variants, because auto-tone can flip the tone AFTER this point — the
  // raster provider then picks by the artwork the layout asks for.
  for (const slug of ['bracu', 'mongoltori']) {
    for (const v of ['light', 'dark']) await loadBrandLogo(slug, v);
  }
  const bracuImg = await loadBrandLogo('bracu', variant);
  const mtImg = await loadBrandLogo('mongoltori', variant);

  const sponsors: Record<string, LogoMetrics> = {};
  const meta: Record<string, SponsorMeta> = {};
  for (const s of manifest.sponsors) {
    // Sponsors are drawn in colour on the banner; only light artwork uses ink.
    if (s.missing) {
      meta[s.slug] = s;
      continue;
    }
    const artwork = s.lightArtwork ? 'dark' : 'color';
    const file =
      artwork === 'color' ? `sponsors/${s.slug}-color.${s.ext ?? 'svg'}` : `sponsors/${s.slug}-dark.png`;
    const img = await loadLogo(file, `${s.slug}|${artwork}`);
    sponsors[s.slug] = measure(img, s.slug, s.placeholder ?? false);
    meta[s.slug] = s;
  }

  const assets: LayoutAssets = {
    bracu: measure(bracuImg, 'bracu', true),
    mongoltori: measure(mtImg, 'mongoltori', false),
    sponsors,
    meta,
  };

  // A real photo when one is given — that is the only way to QA tone detection and
  // the scrim against the kind of images the team actually posts.
  let photo: ReturnType<typeof createCanvas> | Raster;
  let PHOTO_W: number;
  let PHOTO_H: number;
  let autoTone: Tone | null = null;

  if (photoPath) {
    const img = await loadImage(join(ROOT, photoPath));
    photo = img;
    PHOTO_W = img.width;
    PHOTO_H = img.height;
  } else {
  const synthetic = createCanvas(2400, 1600);
  PHOTO_W = 2400;
  PHOTO_H = 1600;
  photo = synthetic;
  {
    const p = synthetic.getContext('2d');
    const g = p.createLinearGradient(0, 0, PHOTO_W, PHOTO_H);
    if (tone === 'dark') {
      g.addColorStop(0, '#3A2F26');
      g.addColorStop(1, '#14100D');
    } else {
      g.addColorStop(0, '#EDE7D8');
      g.addColorStop(1, '#BFB8A6');
    }
    p.fillStyle = g;
    p.fillRect(0, 0, PHOTO_W, PHOTO_H);
    // Coarse banding so cover-fit cropping and pan are visible at a glance.
    p.fillStyle = tone === 'dark' ? 'rgba(244,243,238,0.06)' : 'rgba(11,11,11,0.06)';
    for (let x = 0; x < PHOTO_W; x += 160) p.fillRect(x, 0, 80, PHOTO_H);
  }
  }

  const rasters = (slug: string, artwork: string): Drawable | null =>
    (rasterCache.get(`${slug}|${artwork}`) as unknown as Drawable) ?? null;

  for (const preset of PRESETS) {
    const scene: Scene = {
      preset,
      image: { w: PHOTO_W, h: PHOTO_H },
      transform: IDENTITY_TRANSFORM,
      tone,
      toneOverridden: false,
      frame: wantFrame || preset.defaultFrame,
      scrim: DEFAULT_SCRIM,
      selectedSponsors: manifest.sponsors.filter((s) => !s.missing).map((s) => s.slug),
      ...(label ? { label } : {}),
      stamp: todayLabelDate(),
    };

    let layout = computeLayout(scene, assets);

    // The app auto-detects tone from the framed photo; do the same here or the
    // QA is of a tone nobody would ever see.
    if (photoPath && !process.argv.includes('--light') && !process.argv.includes('--dark')) {
      const detected = sampleToneLocal(layout, photo);
      if (detected) {
        autoTone = detected;
        scene.tone = detected;
        layout = computeLayout(scene, assets);
      }
    }

    const canvas = createCanvas(preset.w, preset.h);
    const ctx = canvas.getContext('2d') as unknown as SKRSContext2D;

    renderComposition(ctx as unknown as Ctx2D, {
      scene,
      layout,
      palette: PALETTE,
      rasters,
      image: overlayOnly ? null : (photo as unknown as Drawable),
      fontsReady: true,
      overlayOnly,
    });

    const suffix = `${scene.frame ? '-frame' : ''}${overlayOnly ? '-overlay' : ''}`;
    const file = join(OUT, `${photoPath ? 'qa-' : ''}${preset.id}-${scene.tone}${suffix}.png`);
    writeFileSync(file, canvas.toBuffer('image/png'));

    const dropped = layout.strip.dropped.length;
    console.log(
      `${preset.id.padEnd(11)} ${preset.w}x${preset.h}  rows=${layout.strip.rows.length}` +
        `  dropped=${dropped}  tone=${scene.tone}${autoTone ? ' (auto)' : ''}` +
        `  -> ${file.replace(ROOT + '/', '')}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

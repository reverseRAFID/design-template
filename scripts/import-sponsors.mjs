#!/usr/bin/env node
/**
 * Publish the team's sponsor artwork and rewrite the sponsor manifest.
 *
 *   npm run import:sponsors
 *
 * ## Naming convention — this is the whole contract
 *
 *   img/partners/<slug>.svg      the sponsor's logo in ITS OWN BRAND COLOURS
 *   img/partners/<slug>.png      ...or PNG, if that is all they sent
 *
 * The filename IS the slug. Add the sponsor to the SPONSORS table below (slug,
 * display name, tier, order, website) and re-run. Nothing else to edit.
 *
 * **A sponsor with no artwork file is left blank on purpose.** It stays in the
 * manifest marked `missing`, the UI flags it, and nothing is drawn — we do not
 * invent or derive a logo. Drop the file in and re-run.
 *
 * ## What it produces
 *
 *   public/brand/sponsors/<slug>-color.svg   the colour artwork, copied verbatim
 *   public/brand/sponsors/<slug>-dark.png    ink silhouette, ONLY for light artwork
 *
 * Sponsors sit on the banner's fixed light background (docs/DECISIONS.md D17), so
 * they are drawn in colour and never follow the photo's tone. The one exception is
 * artwork that is itself light — EZ Gadgets' white "GADGETS" wordmark would vanish
 * on a light band — which gets an ink silhouette instead, flagged in the manifest.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'img/partners');
const OUT = join(ROOT, 'public/brand/sponsors');

const INK = [0x0b, 0x0b, 0x0b];

/** Resolution the source is rasterised at when an ink silhouette is needed. */
const WORK = 1400;
const TARGET_H = 512;
const MAX_W = 2400;

const ALPHA_MIN = 24;
/** Mean ink luminance above which artwork is too light for the banner. */
const LIGHT_ARTWORK_LUM = 0.62;
/** Luminance band over which the ink silhouette fades out at its light end. */
const DARK_KNOCKOUT = [0.1, 0.26];

const EXTENSIONS = ['.svg', '.png'];

/**
 * slug -> display name, tier, order, website.
 *
 * Tier is also the ROW the sponsor appears on: tier 1 sits top and largest.
 * Tiers follow docs/02-DESIGN-SYSTEM.md § G, which flags them as a guess; the four
 * sponsors that were not in that seed sit in tier 3 pending confirmation.
 */
const SPONSORS = [
  ['completech', 'CompleTech', 1, 1, 'https://completech.fi/'],
  ['msi', 'MSI', 1, 2, 'https://www.msi.com/'],
  ['turkish-airlines', 'Turkish Airlines', 1, 3, 'https://www.turkishairlines.com/'],
  ['myactuator', 'MyActuator', 2, 1, 'https://www.myactuator.com/'],
  ['satel', 'SATEL', 2, 2, 'https://satel.com/'],
  ['sbg-systems', 'SBG Systems', 2, 3, 'https://www.sbg-systems.com/'],
  ['altium', 'Altium', 2, 4, 'https://www.altium.com/'],
  ['ansys', 'Ansys', 2, 5, 'https://www.ansys.com/'],
  ['solidworks', 'SolidWorks', 2, 6, 'https://www.solidworks.com/'],
  ['mathworks', 'MathWorks', 2, 7, 'https://www.mathworks.com/'],
  ['cytron', 'Cytron', 3, 1, 'https://www.cytron.io/'],
  ['odrive', 'ODrive Robotics', 3, 2, 'https://odriverobotics.com/'],
  ['blisstyle', 'Blisstyle', 3, 3, null],
  ['elgato', 'Elgato', 3, 4, 'https://www.elgato.com/'],
  ['aqualink', 'Aqualink Bangladesh', 3, 5, null],
  ['nyntax', 'Nyntax', 3, 6, 'https://www.nyntax.com/'],
  // Not in the seed manifest — tier and order need confirming with the team.
  ['logitech', 'Logitech', 3, 7, 'https://www.logitech.com/'],
  ['prolink', 'Prolink', 3, 8, null],
  ['k-silver', 'K-Silver', 3, 9, null],
  ['ez-gadgets', 'EZ Gadgets', 3, 10, null],
];

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function ramp(value, from, to) {
  const t = (value - from) / (to - from);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t); // smoothstep, so edges stay antialiased
}

/** The artwork file for a slug, or null if the team has not supplied one. */
function findSource(slug) {
  for (const ext of EXTENSIONS) {
    const path = join(SRC, `${slug}${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

async function rasterise(path) {
  const img = await loadImage(path);
  const scale = Math.min(WORK / img.width, WORK / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** Mean luminance of the artwork's ink — how the light/dark call is made. */
function meanInkLuminance({ data }) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= ALPHA_MIN) continue;
    sum += luminance(data[i], data[i + 1], data[i + 2]);
    count += 1;
  }
  return count ? sum / count : 0;
}

/** Alpha mask for an ink silhouette: keeps the ink, drops the near-black. */
function inkAlpha({ data }) {
  const alpha = new Float32Array(data.length / 4);
  for (let i = 0; i < alpha.length; i += 1) {
    const a = data[i * 4 + 3];
    if (a <= ALPHA_MIN) continue;
    const lum = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    alpha[i] = (a / 255) * ramp(lum, DARK_KNOCKOUT[0], DARK_KNOCKOUT[1]);
  }
  return alpha;
}

function bboxOf(alpha, w, h) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (alpha[y * w + x] < 0.06) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function emitInk(w, alpha, box) {
  const src = createCanvas(box.w, box.h);
  const sctx = src.getContext('2d');
  const out = sctx.createImageData(box.w, box.h);
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      const from = (y + box.y) * w + (x + box.x);
      const to = (y * box.w + x) * 4;
      out.data[to] = INK[0];
      out.data[to + 1] = INK[1];
      out.data[to + 2] = INK[2];
      out.data[to + 3] = Math.round(Math.min(1, alpha[from]) * 255);
    }
  }
  sctx.putImageData(out, 0, 0);

  const scale = Math.min(TARGET_H / box.h, MAX_W / box.w, 1);
  const dw = Math.max(1, Math.round(box.w * scale));
  const dh = Math.max(1, Math.round(box.h * scale));
  const dst = createCanvas(dw, dh);
  const dctx = dst.getContext('2d');
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(src, 0, 0, dw, dh);
  return dst.toBuffer('image/png');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const entries = [];
  const missing = [];

  for (const [slug, name, tier, order, url] of SPONSORS) {
    const source = findSource(slug);

    if (!source) {
      missing.push(slug);
      entries.push({
        slug,
        name,
        tier,
        order,
        variants: ['light', 'dark'],
        missing: true,
        ...(url ? { url } : {}),
      });
      console.log(`${slug.padEnd(17)} — no artwork, left blank`);
      continue;
    }

    const ext = extname(source).slice(1).toLowerCase();
    copyFileSync(source, join(OUT, `${slug}-color.${ext}`));

    // Only light artwork needs an ink silhouette; everything else reads as-is.
    const pixels = await rasterise(source);
    const lum = meanInkLuminance(pixels);
    const lightArtwork = lum > LIGHT_ARTWORK_LUM;

    if (lightArtwork) {
      const alpha = inkAlpha(pixels);
      const box = bboxOf(alpha, pixels.w, pixels.h);
      if (box) writeFileSync(join(OUT, `${slug}-dark.png`), emitInk(pixels.w, alpha, box));
    }

    entries.push({
      slug,
      name,
      tier,
      order,
      variants: ['light', 'dark'],
      ext,
      ...(lightArtwork ? { lightArtwork: true } : {}),
      ...(url ? { url } : {}),
    });

    console.log(
      `${slug.padEnd(17)} ${ext.padEnd(4)} lum ${lum.toFixed(2)}  ` +
        `${lightArtwork ? 'light artwork -> ink silhouette' : 'colour'}`,
    );
  }

  entries.sort((a, b) => a.tier - b.tier || a.order - b.order);
  writeFileSync(
    join(OUT, 'manifest.json'),
    `${JSON.stringify({ version: 1, tiers: { 1: 'Platinum', 2: 'Gold', 3: 'Partner' }, sponsors: entries }, null, 2)}\n`,
  );

  // Anything in img/partners/ that no SPONSORS row claims is silently unused —
  // almost always a typo'd filename, so say so rather than let it go unnoticed.
  const known = new Set(SPONSORS.map(([slug]) => slug));
  const orphans = readdirSync(SRC)
    .filter((f) => EXTENSIONS.includes(extname(f).toLowerCase()))
    .filter((f) => !known.has(f.slice(0, -extname(f).length)));

  console.log(`\n${entries.length} sponsors -> public/brand/sponsors/manifest.json`);
  if (missing.length) console.log(`awaiting artwork (${missing.length}): ${missing.join(', ')}`);
  if (orphans.length) console.log(`unused files in img/partners/: ${orphans.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

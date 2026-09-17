# 03 — Architecture

## Principles

1. **Client-only.** Static build, no API, no uploads. Photos stay in memory as `ImageBitmap`.
2. **One render function.** `renderComposition(ctx, scene, layout)` draws everything. Preview and export call it
   with different canvas sizes; the layout is computed for the *export* size and scaled by a single factor for
   preview, so rounding differences are the only permitted difference.
3. **Pure engine.** `src/engine/**` has no React, no DOM globals beyond `CanvasRenderingContext2D` types.
   Everything with numbers in it is unit-tested.

## Folder layout

```
mongoltori-brandkit/
├─ CLAUDE.md
├─ docs/
├─ public/
│  ├─ brand/                      # logos + sponsors/manifest.json (see Design System §G)
│  └─ fonts/                      # self-hosted woff2
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ styles/
│  │  ├─ tokens.css               # THE tokens. only place with hex values
│  │  └─ globals.css
│  ├─ engine/                     # pure TS, tested
│  │  ├─ presets.ts               # Preset table
│  │  ├─ layout.ts                # computeLayout(preset, scene, assets) -> Layout
│  │  ├─ sponsor-flow.ts          # row packing / shrink / wrap logic
│  │  ├─ tone.ts                  # detectTone(imageData, regions) -> 'dark' | 'light'
│  │  ├─ frame.ts                 # mission frame geometry
│  │  ├─ render.ts                # renderComposition(ctx, scene, layout, assets)
│  │  └─ types.ts
│  ├─ assets/
│  │  ├─ manifest.ts              # load + validate manifest.json (zod)
│  │  ├─ loader.ts                # load SVG/PNG -> ImageBitmap, measure optical bounds, cache
│  │  └─ optical-bounds.ts        # alpha bbox scan on a small offscreen raster
│  ├─ state/
│  │  └─ editor-store.ts          # zustand: preset, image, transform, tone, frame, scrim, selection
│  ├─ components/
│  │  ├─ layout/  AppShell.tsx  Header.tsx  LeftRail.tsx  RightPanel.tsx
│  │  ├─ preview/ PreviewStage.tsx  CornerReadouts.tsx  SafeZoneGuide.tsx
│  │  ├─ controls/ PresetPicker.tsx  Dropzone.tsx  SegmentedToggle.tsx  Slider.tsx  SponsorList.tsx  ExportBar.tsx
│  │  └─ ui/       Pill.tsx  Eyebrow.tsx  Badge.tsx  Toast.tsx
│  ├─ hooks/
│  │  ├─ use-composition.ts       # wires store -> layout -> preview canvas draw (rAF, debounced)
│  │  ├─ use-pan-zoom.ts          # pointer events on preview
│  │  └─ use-export.ts            # offscreen canvas -> blob -> download
│  └─ lib/
│     ├─ download.ts  filename.ts  luminance.ts  persist.ts
└─ tests/
   ├─ layout.test.ts  sponsor-flow.test.ts  tone.test.ts  frame.test.ts
```

## Core types (`engine/types.ts`)

```ts
export type PresetId = 'square' | 'portrait34' | 'portrait45' | 'story' | 'wide' | 'og';
export interface Preset { id: PresetId; name: string; w: number; h: number; defaultFrame: boolean }

export type Tone = 'dark' | 'light';

export interface ImageTransform { scale: number; /* 1..3 */ dx: number; dy: number; /* px offset at export size */ }

export interface Scene {
  preset: Preset;
  image?: { bitmap: ImageBitmap; w: number; h: number };
  transform: ImageTransform;
  tone: Tone;
  toneOverridden: boolean;
  frame: boolean;
  scrim: number;                   // 0..1
  selectedSponsors: string[];      // slugs
  label?: string;                  // Phase 2
}

export interface LogoAsset {
  slug: string;
  variants: Partial<Record<Tone, ImageBitmap>>;
  optical: { x: number; y: number; w: number; h: number }; // fraction of bitmap, from alpha scan
  placeholder: boolean;
}

export interface PlacedLogo { slug: string; x: number; y: number; w: number; h: number; tone: Tone }

export interface Layout {
  W: number; H: number; S: number;
  margin: number;
  image: { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number };
  top: { bracu: PlacedLogo; mongoltori: PlacedLogo };
  strip: { rows: PlacedLogo[][]; bbox: { x: number; y: number; w: number; h: number }; dropped: string[] };
  scrims: { top: { y0: number; y1: number }; bottom: { y0: number; y1: number }; color: string; alpha: number } | null;
  frame: FrameGeometry | null;
}
```

## Render pipeline

```
store change ──► computeLayout(preset, scene, assets)   (pure, memoized on inputs)
                     │
                     ▼
        preview: requestAnimationFrame ─► ctx.scale(k,k) ─► renderComposition(...)
        export:  OffscreenCanvas(W,H)   ─► renderComposition(...) ─► convertToBlob ─► download
```

`renderComposition` draw order:
1. Fill `--mt-ink` (only matters for `og` mat or if image missing).
2. `drawImage(image, sx,sy,sw,sh, dx,dy,dw,dh)` — cover fit with transform applied.
3. Scrims (if frame off) — two `createLinearGradient` fills.
4. Frame (if on): `og` mat → frame stroke with openings → brackets → labels. Labels need fonts awaited.
5. Pill backing behind strip (if frame on).
6. Top logos, drawn by **optical box**: compute the source rect from `optical` and stretch to placed rect.
7. Sponsor strip rows.

Canvas gotchas to respect:
- Set `ctx.imageSmoothingQuality = 'high'` before drawing photos and raster logos.
- SVGs: rasterize once per (slug, tone, targetHeight bucket) via `createImageBitmap(svgBlob, {resizeHeight})`.
  Bucket target heights to multiples of 8px to keep the cache small. Never draw an SVG `<img>` directly at
  export scale without rasterizing at that scale or it will be soft.
- `ctx.letterSpacing` is supported in Chromium/Firefox/Safari 17+; for tracking in labels use it and fall back
  to manual per-glyph drawing only if unsupported (feature-detect once).
- Colors passed to canvas must be **resolved** from CSS variables at draw time:
  `getComputedStyle(document.documentElement).getPropertyValue('--mt-orange')`. Read once into a `Palette`
  object and pass it into the engine — the engine never touches `document`.

## State (`editor-store.ts`)

Zustand store, persisted subset via `persist.ts` (localStorage key `mt-brandkit:v1`):
`presetId, toneOverride, frame, scrim, selectedSponsors`. **Not** persisted: image, transform.

Actions: `setPreset`, `setImage(file)`, `setTransform`, `resetTransform`, `setTone(tone, overridden)`,
`toggleFrame`, `setScrim`, `toggleSponsor`, `setTier(tier, on)`, `resetDefaults`.

`setPreset` keeps the image but recenters transform (scale 1, dx=dy=0) and re-runs auto tone if not overridden.

## Asset loading

On boot: fetch `manifest.json` → validate with zod → for each logo, fetch both variants → `ImageBitmap` at a
small size (256px tall) → compute optical bounds → cache in a `Map<slug, LogoAsset>`. Full-res rasters are
created lazily per target height bucket (see above). Missing files fall back to `placeholder-*.svg` with
`placeholder: true`, which the UI surfaces as a badge; export still works.

Assets are cached by the PWA service worker (`vite-plugin-pwa`, `generateSW`, precache `brand/**`, `fonts/**`).

## Tone detection

`detectTone(imageData: ImageData, regions: Rect[], weights: number[]): Tone` — pure. The hook draws the
cover-fitted image only (no overlays) into a 128px-wide offscreen canvas, gets `ImageData`, and passes scaled
regions. Threshold 0.52 per Design System §E. Debounced 150ms after pan/zoom end.

## Export

- `use-export.ts`: `OffscreenCanvas` if available, else a detached `<canvas>`. Await fonts, await full-res
  logo rasters for the export S, then render. `toBlob('image/png')` or `('image/jpeg', 0.92)`.
- Filename from `lib/filename.ts`: `mongoltori_${presetId}_${yyyymmdd}_${HHmm}.png`.
- Phase 2 batch: iterate images → per-image auto tone → render → `zip.file(...)` → `zip.generateAsync`.
  Show progress `RENDERING 3 / 12` in mono.

## Testing

Vitest, node environment, no DOM needed for engine tests:
- `layout.test.ts`: for every preset, top logos inside margin, no overlap, heights equal ± 1px; strip bottom
  at `H − m`; `og` shrink path triggered.
- `sponsor-flow.test.ts`: 3, 8, 17, 30 sponsors on every preset → row count, min height, dropped list.
- `tone.test.ts`: synthetic ImageData (all dark, all light, dark top / light bottom) → expected tone.
- `frame.test.ts`: openings centered, brackets outside frame rect, label font size scales with S.

Add a `scripts/check-no-white.mjs` run in `npm run lint` that greps `src/` for `#fff`, `#ffffff`, `\bwhite\b`
(excluding comments mentioning the rule) and exits 1 on match.

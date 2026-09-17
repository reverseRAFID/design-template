# 04 — Tasks

Work top to bottom. Tick boxes as you go. Each phase should end in a working, committed, deployable state.
Don't start a phase until the previous one's "Done when" is true.

---

## Phase 0 — Bootstrap & brand extraction

- [x] **0.1 Extract the orange.** `curl -sL https://bracu-mongoltori.com/ > /tmp/home.html`, find the CSS bundle
      URL(s) (Next.js: `/_next/static/css/*.css`), download them, and grep for orange-ish hex values / CSS
      variables (`--*orange*`, `--*primary*`, `--*accent*`). Pick the value used for primary buttons/links.
      Write it to `--mt-orange` in `tokens.css` and record the source URL + hex in `docs/DECISIONS.md`.
      Derive `--mt-orange-hot` and `--mt-orange-deep` from it. If extraction fails, keep `#FF6A1A` and add a
      loud `TODO(brand)` comment.
- [x] 0.2 Also fetch `/logo-dark.svg` from the site into `public/brand/mongoltori-dark.svg` if it's a clean SVG.
      Check whether a `logo-light.svg` exists. Note findings in DECISIONS.md.
- [x] 0.3 `npm create vite@latest . -- --template react-ts`, add Tailwind, Zustand, zod, JSZip, vite-plugin-pwa,
      Vitest. Strict TS. Path alias `@/`.
- [x] 0.4 Create `src/styles/tokens.css` from Design System §B, `globals.css` (dotted grid body bg, font-faces),
      `tailwind.config.ts` mapping tokens. Delete Tailwind default palette usage (`theme.colors` replaced).
- [x] 0.5 Self-host fonts: Michroma, Space Grotesk, JetBrains Mono (woff2, latin subset) in `public/fonts/`.
- [x] 0.6 `scripts/check-no-white.mjs` + wire into `npm run lint`.
- [x] 0.7 Placeholder assets: `placeholder-light.svg` / `placeholder-dark.svg` (pill outline, word "LOGO"),
      `bracu-*.svg` and `mongoltori-*.svg` placeholders if real ones aren't available. `sponsors/manifest.json`
      from Design System §G with every sponsor pointing at placeholders until real files exist.

**Done when:** `npm run dev` shows an empty dark page with the dotted grid and the header
`MONGOL-TORI // BRAND KIT`, `npm run lint` passes, tokens.css has the extracted orange.

---

## Phase 1 — Engine (pure, tested)

- [x] 1.1 `engine/presets.ts` — the six presets.
- [x] 1.2 `engine/types.ts` — types from Architecture.
- [x] 1.3 `assets/optical-bounds.ts` — alpha-bbox scan; test with a synthetic RGBA buffer.
- [x] 1.4 `engine/layout.ts` — cover-fit image rect with transform; top logos incl. `og` shrink path.
- [x] 1.5 `engine/sponsor-flow.ts` — single row → shrink → two rows → drop lowest tier. Tests for 3/8/17/30.
- [x] 1.6 `engine/tone.ts` — luminance sampling with weighted regions. Tests.
- [x] 1.7 `engine/frame.ts` — frame geometry incl. openings and brackets; effective margin shift. Tests.
- [x] 1.8 `engine/render.ts` — `renderComposition` following the draw order. Takes a `Palette` object, never
      reads CSS itself.

**Done when:** `npm run test` green; a quick node script can render `square` with placeholders to a PNG via
`@napi-rs/canvas` (dev-only) and it looks right.

---

## Phase 2 — App UI (single image flow)

- [x] 2.1 `AppShell` three-column layout, responsive stack < 1024px. Header with status tag.
- [x] 2.2 `assets/loader.ts` + `manifest.ts` — boot load, placeholder fallback, status → header.
- [x] 2.3 `editor-store.ts` with persistence.
- [x] 2.4 `PresetPicker` pills with ratio thumbnails.
- [x] 2.5 `Dropzone` (drag/drop, click, paste from clipboard). HEIC: try `heic2any`, else friendly error.
- [x] 2.6 `PreviewStage` + `use-composition` (rAF draw, scale factor to fit stage, `CornerReadouts`).
- [x] 2.7 `use-pan-zoom` — pointer drag, wheel/slider zoom 1–3×, double-click reset, `SafeZoneGuide` while dragging.
- [x] 2.8 Tone `SegmentedToggle` with AUTO tag; auto-detect on upload and after pan/zoom (debounced) unless overridden.
- [x] 2.9 Frame toggle; scrim `Slider` (hidden when frame on, since backing replaces scrims).
- [x] 2.10 `SponsorList` grouped by tier, ALL/NONE, placeholder badges, live re-flow.
- [x] 2.11 `ExportBar` — Download PNG (primary), JPG (secondary); `use-export` with fonts + rasters awaited.
- [x] 2.12 Toasts (strip overflow, HEIC failure, export done).
- [x] 2.13 PWA: precache brand + fonts; verify offline load.
- [x] 2.14 Keyboard: presets ↑/↓, `D`/`L` tone, `F` frame, `Cmd/Ctrl+S` download. Show hints in mono footer.

**Done when:** every acceptance criterion in `01-PRD.md` passes manually; deployed preview URL shared with team.

---

## Phase 3 — Batch & extras

- [x] 3.1 Multi-file upload → thumbnails strip under preview; click to inspect; per-image auto tone.
- [x] 3.2 Batch export to ZIP with progress.
- [x] 3.3 Multi-preset export (checkbox list of presets → ZIP).
- [x] 3.4 Optional telemetry label (frame on): input, max 48 chars, uppercase, prefilled with today's date.
- [x] 3.5 Logo-only mode (transparent PNG of overlay layer).
- [x] 3.6 Shareable settings URL (`#s=<base64 json>`).

---

## Phase 4 — Polish

- [x] 4.1 Motion pass (160ms / 400ms, reduced-motion).
- [x] 4.2 Visual QA on real photos: dark indoor seminar, bright outdoor field test, mixed. Adjust scrim default
      and tone threshold if needed; record in DECISIONS.md.
- [x] 4.3 Lighthouse ≥ 95 on performance/a11y.
- [x] 4.4 README for the team: how to add a sponsor, how to replace a logo, how to deploy.
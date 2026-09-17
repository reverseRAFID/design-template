# Mongol-Tori Brand Kit

Internal web tool for **BRACU Mongol-Tori**. Drop in a photo, pick a ratio, get a correctly branded
PNG. BRACU logo top-left, Mongol-Tori top-right, sponsor strip along the bottom — placed by the same
rules every time, by whoever is posting.

Everything runs in the browser. **Photos never leave your laptop**, and the whole thing works offline
after the first load.

```bash
npm install
npm run dev        # http://localhost:5173
```

---

## For the team

### Making a post

1. Drop a photo on the left panel (or click, or paste from the clipboard). On a phone, tap
   **UPLOAD PHOTO**.
2. Pick a ratio. `Square` for feed, `Story / Reel cover` for stories, `Wide 16:9` for YouTube and
   LinkedIn, `Link preview` for the website.
3. Drag the photo to reframe it, scroll to zoom. Double-click to reset.
4. **Download PNG**.

The tool guesses whether your photo is dark or bright and switches the logos to cream or ink to suit.
If it guesses wrong, flip the Tone toggle — your choice sticks until you upload a new photo.

Keyboard: `↑` `↓` change preset, `D` / `L` set tone, `F` toggles the frame, `Ctrl/Cmd + S` downloads.

### Things worth knowing

- **The safe zone.** While you drag, a dashed orange guide shows where the logos will sit. Keep faces
  out of those boxes.
- **Scrim** is the soft darkening behind the logos so they stay readable on a busy photo. Turn it down
  if it is eating your image; turn it up if a logo is disappearing into a bright sky.
- **Frame** draws the mission-control border. It is on by default for `Link preview` and off
  elsewhere. When the frame is on, the scrim is replaced by a pill behind the sponsor strip.
- **The sponsor banner is part of the image, not on top of it.** The photo fills everything above
  the light band; the export is still exactly the preset size. Sponsors appear in their own brand
  colours there, because the band gives them a predictable background.

---

## For whoever maintains it

### Adding or replacing a sponsor

Sponsors are data, not code. There is no component to edit.

**The filename is the slug.** That is the whole convention:

```
img/partners/<slug>.svg      the logo IN ITS OWN BRAND COLOURS  (or .png)
```

1. Drop the file in, named for the sponsor: `img/partners/turkish-airlines.svg`.
2. Add one line to the `SPONSORS` table at the top of `scripts/import-sponsors.mjs`:

   ```js
   ['new-sponsor', 'New Sponsor', 2, 8, 'https://example.com/'],
   //  slug         display name  tier order  website (or null)
   ```

3. Run it:

   ```bash
   npm run import:sponsors
   ```

**In a hurry?** There is an **UPLOAD A LOGO** panel in the app — pick a sponsor (or add a new one),
choose an SVG or PNG, and it appears immediately. That is per-browser only: it does not reach your
teammates and it does not reach the repo, so still do the steps above when you get a moment.

Sponsors appear in **full brand colour** on the banner, so send the colour original — no mono
version needed. **If you add the table row but no file, the sponsor is simply left blank**: it stays
in the manifest, the importer lists it under "awaiting artwork", and nothing is drawn. Drop the file
in later and re-run. The importer also flags any file in `img/partners/` that no row claims, which
is usually a typo'd filename.

**Tiers are rows.** Tier 1 is the top row, tier 2 the next, tier 3 below. Every logo is drawn the
same visual size regardless of tier — tier picks the row, not the prominence. `order` sets the
left-to-right position, but you can also just **drag sponsors into place in the app** — including
from one tier to another — or use the ↑/↓ buttons on each row.

**Press SAVE POSITIONS when you are happy with the board.** That rewrites
`public/brand/sponsors/manifest.json` — the file in the repo — so the arrangement follows the
project, not your browser:

- Running `npm run dev`: the file is written straight to disk. **Commit it** and everyone gets that
  board, in every browser.
- On the deployed site: `manifest.json` downloads instead. Replace
  `public/brand/sponsors/manifest.json` with it and commit.

Until you save, the panel says `↳ UNSAVED` and REVERT discards the change. Nothing about the board
is stored in your browser, so an unsaved drag is lost on reload — that is deliberate.

Logos are not all drawn at the same height: each is nudged toward equal visual *area*, so a long
wordmark does not swamp a square mark. `docs/DECISIONS.md` D16 and D18 cover the tuning.

### Replacing a brand logo

Same idea, at `public/brand/`: `bracu-light.*`, `bracu-dark.*`, `mongoltori-light.svg`,
`mongoltori-dark.svg`. **`-light` is the artwork for dark backgrounds, `-dark` is for light
backgrounds.** Getting this backwards is the single easiest mistake to make here.

SVG or PNG both work for these two — the app tries `.svg` first, then `.png`. BRACU's light-tone
mark is the official PNG; its dark-tone one is still derived (see `docs/DECISIONS.md` D3).

See `docs/DECISIONS.md` D2 and D3 for where the current files came from — the BRACU pair in
particular is derived from the full-colour institutional mark and should be replaced with official
single-colour artwork when the university provides it.

### Changing the brand colour

`src/styles/tokens.css`, and nowhere else. It is the only file in `src/` permitted to contain a hex
value, and `npm run lint` enforces that. The current orange was lifted from the live site's dark
theme; the provenance is in `docs/DECISIONS.md` D1.

### Deploying

Static build, no backend, no environment variables.

```bash
npm run build      # -> dist/
```

- **GitHub Pages** — already wired. `.github/workflows/deploy.yml` lints, tests and publishes on
  every push to `main`. The only setup is once, in the repo: **Settings → Pages → Source = "GitHub
  Actions"**. No secrets to add.
- **Vercel** — framework preset "Vite". Nothing else to configure.
- **By hand**, if you need a different host: a project site lives under `/<repo>/`, so build with
  `VITE_BASE=/<repo>/ npm run build` and publish `dist/`.

---

## How it is built

- **Vite + React 18 + TypeScript** (strict), **Tailwind** for the app UI, **Canvas 2D** for the image.
- **Zustand** for editor state, **zod** to validate the sponsor manifest, **JSZip** for batch export.
- No backend, no accounts, no uploads. A service worker precaches the brand assets and fonts.

### The one rule that matters

Preview and export are the same code path. `renderComposition()` draws to a canvas; the preview is
that canvas scaled down by a single factor, and the export is it at full preset resolution. There is
no second code path that could drift.

Everything under `src/engine/` is pure TypeScript with no React and no DOM imports, so the geometry
is unit-tested directly:

```bash
npm run test       # layout, sponsor flow, tone detection, frame geometry, optical bounds
npm run lint       # includes the no-pure-white check
npm run build      # type-check + production build
npm run sample     # render every preset headlessly to .sample/ — add --light or --frame
```

`npm run sample` is worth knowing about. It draws all six presets through the *same*
`renderComposition()` the browser uses and writes PNGs you can just look at. It is how the tone
mapping, the knockouts and the strip packing get checked against real artwork, and it catches things
unit tests cannot.

Two files are the contract everything else is written against — treat them as frozen unless you are
deliberately changing the design:

- `src/engine/types.ts` — every signature
- `src/engine/metrics.ts` — every geometry constant from the design system

If you catch yourself typing `0.045` somewhere, import `SPONSOR_H` instead.

### Where things live

```
docs/            the specification. 01-PRD, 02-DESIGN-SYSTEM, 03-ARCHITECTURE, 04-TASKS, DECISIONS
img/partners/    the team's ORIGINAL sponsor artwork — the input to npm run import:sponsors
public/brand/    logos + sponsors/manifest.json (generated for sponsors; edit img/ instead)
public/fonts/    self-hosted woff2 (Michroma, Space Grotesk, JetBrains Mono)
src/engine/      pure geometry + the renderer. no React, no DOM
src/assets/      manifest loading, rasterisation, optical bounds
src/state/       zustand store
src/components/  layout / preview / controls / ui
src/hooks/       composition draw loop, pan-zoom, export
scripts/         import-sponsors (artwork -> variants), render-sample, check-no-white
tests/           vitest, node environment
```

Read `docs/` before changing behaviour — the geometry in particular is specified there down to the
fraction, and `docs/DECISIONS.md` records why anything deviates.

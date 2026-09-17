# 02 — Design System

Two things live here: (A) the **app UI** the team uses, and (B) the **overlay template** that gets baked into
exported images. They share tokens but the overlay is far more restrained — it has to sit on top of any photo
without fighting it.

---

## A. Brand language

### Source: the existing website (bracu-mongoltori.com)

Observed language, to be carried forward:

- **Mission-control / telemetry HUD**: monospace micro-labels with `//` and `›` prefixes
  (`// SYS: NOMINAL`, `› INITIALIZING TELEMETRY LINK … OK`), numbered sections (`01 About`, `04 / Latest`),
  coordinates in the footer (`23.7806° N, 90.4074° E`), status-style tags (`URC · IRC · ERC`).
- **Section eyebrows** in small caps tracking: `IMPACT`, `SYSTEMS`, `DOWNLINK`, `DISPATCH`.
- **Diamond bullets** `◆` for sub-team lists.
- Dark base, orange as the single accent, cream instead of white. Big confident headline type
  ("Engineered for Mars."), lots of negative space.

### Layer on top: Y2K Futurism (restrained)

Y2K futurism = late-90s/early-2000s optimism about technology: chrome, glossy pill shapes, lens glints,
translucent panels, rounded "bubble" geometry, tech typefaces with wide letterforms, orbital rings, dotted
grids. We take the **shapes and type**, not the kitsch. Rules:

- **Yes**: pill-shaped buttons and tags, wide-set uppercase display type, thin orbital ring / arc motifs,
  1px dotted grid backgrounds, translucent frosted panels, a single soft chrome-gradient highlight on primary
  buttons, subtle orange glow on focus/active states.
- **No**: rainbow gradients, bevels, drop shadows everywhere, "matrix" green, more than one chrome gradient on
  screen, animated blobs, lens-flare PNGs on exported images.
- On the **exported overlay**, Y2K shows up only as: the pill-shaped sponsor strip backing (when scrim is on),
  the rounded-square corner brackets of the frame, and the display font in the optional label. Nothing else.

---

## B. Tokens (`src/styles/tokens.css`)

```css
:root {
  /* Brand */
  --mt-orange:        #FF6A1A;   /* FALLBACK — replace with value extracted from live site in Task 0.1 */
  --mt-orange-hot:    #FF8A47;   /* hover / glow — derive: +12% lightness of --mt-orange */
  --mt-orange-deep:   #C24E0F;   /* pressed / borders on light — derive: −20% lightness */
  --mt-cream:         #F4F3EE;   /* THE white. never #fff */
  --mt-ink:           #0B0B0B;   /* THE black for overlays on light photos */

  /* App surfaces (dark UI) */
  --mt-bg:            #0A0A0A;
  --mt-surface:       #131313;
  --mt-surface-2:     #1C1C1C;
  --mt-line:          rgba(244, 243, 238, 0.12);
  --mt-line-strong:   rgba(244, 243, 238, 0.24);
  --mt-text:          var(--mt-cream);
  --mt-text-dim:      rgba(244, 243, 238, 0.60);
  --mt-text-mute:     rgba(244, 243, 238, 0.38);

  /* Status (use sparingly) */
  --mt-ok:            #7CE38B;
  --mt-warn:          #FFD166;

  /* Effects */
  --mt-glow:          0 0 0 1px var(--mt-orange), 0 0 24px rgba(255, 106, 26, 0.35);
  --mt-chrome:        linear-gradient(180deg, rgba(244,243,238,0.22) 0%, rgba(244,243,238,0) 55%);
  --mt-grid:          radial-gradient(rgba(244,243,238,0.10) 1px, transparent 1px);
  --mt-grid-size:     24px;

  /* Radii — Y2K bubbles, but disciplined */
  --r-pill:           999px;
  --r-lg:             20px;
  --r-md:             12px;
  --r-sm:             6px;

  /* Type */
  --font-display:     "Michroma", "Orbitron", "Eurostile", sans-serif;      /* wide, techy. Headlines, preset names */
  --font-body:        "Space Grotesk", system-ui, sans-serif;               /* UI text */
  --font-mono:        "JetBrains Mono", "Space Mono", ui-monospace, monospace; /* telemetry labels */
}
```

**Fonts are self-hosted** in `public/fonts/` (woff2), declared with `@font-face`, and must be awaited with
`document.fonts.load()` before any canvas draw that uses them. Offline is a requirement.

Tailwind: map tokens in `tailwind.config.ts` as `colors.mt.orange = 'var(--mt-orange)'` etc. Never use
Tailwind's default `white`, `black`, `orange-*`, `gray-*`. Add an ESLint/Stylelint rule or a simple grep in
`npm run lint` that fails on `#fff`, `#ffffff`, `\bwhite\b` in `src/`.

---

## C. Typography scale (app UI)

| Role            | Font    | Size / line  | Weight | Transform / tracking          |
|-----------------|---------|--------------|--------|-------------------------------|
| Display         | display | 28 / 32      | 400    | uppercase, tracking 0.08em    |
| H1              | display | 20 / 24      | 400    | uppercase, tracking 0.06em    |
| Section eyebrow | mono    | 11 / 16      | 500    | uppercase, tracking 0.18em, `--mt-text-mute`, prefixed `// ` |
| Body            | body    | 14 / 20      | 400    | —                             |
| Label           | body    | 12 / 16      | 500    | —                             |
| Telemetry       | mono    | 11 / 16      | 400    | uppercase, tracking 0.10em    |

---

## D. App UI components

Layout: **three columns on desktop** — left rail (preset + upload), center (preview canvas on dotted grid),
right panel (tone, frame, scrim, sponsors, export). Stacks vertically on < 1024px with preview pinned to top.

- **Header**: `MONGOL-TORI // BRAND KIT` in display type, right side a mono status tag `● SYS: NOMINAL` in
  `--mt-ok`; turns `● ASSETS: PLACEHOLDER` in `--mt-warn` while any logo is a placeholder.
- **Preset picker**: vertical list of pill buttons. Each shows a tiny ratio thumbnail (outline rectangle),
  name in display type, pixel size in mono. Active = orange outline + glow, not filled.
- **Dropzone**: full-panel dashed `--mt-line-strong` border, radius `--r-lg`, orbital-ring SVG motif in center
  at 20% opacity, text `› DROP IMAGE OR CLICK`. On drag-over: border becomes orange, ring spins slowly (CSS only).
- **Toggles** (Tone, Frame): segmented pill controls with two options, not iOS switches.
  Tone: `DARK ◐ LIGHT` with auto-detected side marked by a tiny `AUTO` mono tag.
- **Slider** (Scrim, Zoom): 2px track `--mt-line`, orange fill, round cream thumb with orange ring.
- **Sponsor list**: grouped by tier with mono eyebrow (`// TIER 01 — PLATINUM`), checkbox rows showing logo
  thumbnail (on `--mt-surface-2`), name, and a `◆` when included. Header has `ALL / NONE`.
- **Primary button** (Download PNG): pill, orange fill, ink text, `--mt-chrome` overlay for the single chrome
  highlight, hover → `--mt-orange-hot` + glow. Secondary buttons: cream outline pills.
- **Preview stage**: canvas centered on `--mt-grid` dotted background, with mono corner readouts:
  top-left `PRESET: SQUARE 1080×1080`, top-right `TONE: DARK`, bottom-left `ZOOM: 1.00×`, bottom-right
  `FRAME: ON`. These are UI only — never exported.
- **Placeholder badge**: any logo loaded from `placeholder-*.svg` shows a striped orange/ink diagonal tag
  reading `PLACEHOLDER` in the sponsor list and in the header status.

Motion: 160ms ease-out for state changes; 400ms for preset switch (the canvas resizes, overlays glide).
`prefers-reduced-motion` → no transitions.

---

## E. Overlay geometry (what gets exported)

All values are fractions of **S = min(canvasWidth, canvasHeight)** unless stated. This keeps logos the same
visual weight across every preset.

```
margin          m  = 0.040 · S        (safe margin from every edge)
topLogoH        h1 = 0.070 · S        (height of BRACU and Mongol-Tori logos; width follows aspect)
topLogoH_max        = 120 px           (cap so 1920-wide never gets comically large)
topGap              = h1 · 0.35        (min horizontal space between the two top logos if they'd collide)
sponsorH        h2 = 0.045 · S        (target sponsor logo height, single row)
sponsorH_min        = 0.030 · S        (shrink floor before wrapping to two rows)
sponsorGap      g  = 0.018 · S        (horizontal gap between sponsor logos)
sponsorRowGap       = 0.012 · S
stripPadX           = 0.030 · S        (padding inside pill backing, if scrim/backing on)
stripPadY           = 0.014 · S
```

### Top logos
- BRACU: left edge at `m`, top edge at `m`, height `h1`.
- Mongol-Tori: right edge at `W − m`, top edge at `m`, height `h1`.
- Both are **optically aligned**: measure each logo's opaque bounding box (not the file box) once at load and
  align on that. Cache the measurement.
- If `bracuW + mtW + topGap > W − 2m` (can happen on `og`), scale both down uniformly until it fits.

### Sponsor strip
1. Filter manifest by selection, sort by `tier` asc then `order` asc.
2. Compute each logo's width at height `h2` from its aspect.
3. If `Σwidths + g·(n−1) ≤ W − 2m` → single row at `h2`.
4. Else shrink `h2` linearly down to `sponsorH_min`. If it fits → single row.
5. Else → **two rows** at `h2`, split so row widths are as balanced as possible (greedy by tier: higher tiers
   on row 1). Row 1 above row 2, both centered.
6. Never three rows. If two rows at `sponsorH_min` still don't fit, drop the lowest tier and show a warning
   toast: `STRIP OVERFLOW — dropped N tier-3 logos`.
- Strip bottom edge sits at `H − m`. Horizontally centered.
- Logos are vertically centered within each row on their optical boxes.

### Scrims
- Top scrim: linear gradient from `scrimColor@α` at `y=0` to transparent at `y = m + h1 + 0.06·S`.
- Bottom scrim: from transparent at `y = stripTop − 0.08·S` to `scrimColor@α` at `y = H`.
- `scrimColor` = ink for Dark tone, cream for Light tone. `α = 0.55 · strength` where strength ∈ [0,1],
  default 0.7.
- When **frame is on**, scrims are replaced by the **pill backing**: a `--r-pill` rounded rect behind the
  sponsor strip only, `scrimColor@0.72`, padded by `stripPadX/Y`. Top logos get no backing (the frame's bracket
  area gives them contrast).

### Tone → asset variant
| Tone  | Logo variant used | Scrim / backing color | Frame color |
|-------|-------------------|-----------------------|-------------|
| Dark  | `*-light.svg` (cream artwork) | ink `#0B0B0B`  | orange      |
| Light | `*-dark.svg` (ink artwork)    | cream `#F4F3EE`| orange      |

Orange never changes. If a sponsor only ships one variant, use it for both tones and flag it in the manifest
with `"variants": ["light"]` so the UI can warn.

### Auto tone detection
Sample three regions from the framed (cover-fitted, panned, zoomed) image: top-left box `[m, m, 0.30·W, m+h1]`,
top-right box mirror, bottom band `[m, stripTop, W−m, H−m]`. Compute mean relative luminance
(`0.2126R + 0.7152G + 0.0722B`, sRGB linearized) weighted 0.3 / 0.3 / 0.4. If ≥ 0.52 → Light, else Dark.
Recompute on pan/zoom end (debounced 150ms), only while the user hasn't manually overridden.

---

## F. The Mission Frame (Frame toggle = on)

A single inset frame that reads as "HUD viewport" — and the only place the Y2K rounded-corner language appears
on exports.

```
frameInset      f  = 0.028 · S
frameStroke        = max(2px, 0.0022 · S)      orange
frameRadius        = 0.012 · S                  (rounded-square, not a circle)
bracketLen         = 0.060 · S                  corner bracket arm length
bracketStroke      = frameStroke · 1.5          orange
bracketGap         = 0.006 · S                  gap between frame line and bracket
```

- Frame rect: `[f, f, W−f, H−f]`, stroke only, radius `frameRadius`. Stroke is broken (gap) for 0.12·W on the
  **top edge centered** and 0.12·W on the **bottom edge centered** — HUD-style openings.
- **Corner brackets**: L-shapes outside the frame at each corner, `bracketGap` away, arms `bracketLen`.
  Round line caps.
- **Telemetry labels** (mono, uppercase, tracking 0.12em, size `0.014·S`, color orange):
  - Top opening: `MONGOL-TORI // BRAC UNIVERSITY`
  - Bottom opening: user label if provided (Phase 2), else `URC · IRC · ERC`
  - Bottom-left, just above the frame inside: tiny `◆` + `01` style index is **not** included (too much). Keep only
    the two labels.
- When frame is on, top logos and sponsor strip shift inward so they sit inside the frame with margin `m`
  measured from the frame line, not the canvas edge: effective `m' = f + m·0.6`.
- Photo still fills the full canvas behind the frame (frame is a stroke, not a mat) **unless** preset is `og`,
  where a `--mt-ink` mat of width `f` is drawn so link previews get a crisp edge.

---

## G. Asset requirements (for the team / for placeholders)

`public/brand/`
```
bracu-light.svg        bracu-dark.svg
mongoltori-light.svg   mongoltori-dark.svg
sponsors/
  manifest.json
  <slug>-light.svg     <slug>-dark.svg     (PNG @ ≥ 1200px wide acceptable if no SVG)
placeholder-light.svg  placeholder-dark.svg   (a pill outline with the word LOGO — used until real files exist)
```

- SVGs must have a `viewBox`, no external fonts, no `<style>` with classes that collide (inline or scoped).
- Trim transparent padding — the engine measures optical bounds but tight files render sharper.
- Sponsor `manifest.json` seed (tiers are guesses; confirm with team):

```json
{
  "version": 1,
  "tiers": { "1": "Platinum", "2": "Gold", "3": "Partner" },
  "sponsors": [
    { "slug": "completech",      "name": "Completech",         "tier": 1, "order": 1,  "variants": ["light","dark"] },
    { "slug": "msi",             "name": "MSI",                "tier": 1, "order": 2,  "variants": ["light","dark"] },
    { "slug": "turkish-airlines","name": "Turkish Airlines",   "tier": 1, "order": 3,  "variants": ["light","dark"] },
    { "slug": "myactuator",      "name": "MyActuator",         "tier": 2, "order": 1,  "variants": ["light","dark"] },
    { "slug": "satel",           "name": "SATEL",              "tier": 2, "order": 2,  "variants": ["light","dark"] },
    { "slug": "sbg-systems",     "name": "SBG Systems",        "tier": 2, "order": 3,  "variants": ["light","dark"] },
    { "slug": "altium",          "name": "Altium",             "tier": 2, "order": 4,  "variants": ["light","dark"] },
    { "slug": "ansys",           "name": "Ansys",              "tier": 2, "order": 5,  "variants": ["light","dark"] },
    { "slug": "solidworks",      "name": "SolidWorks",         "tier": 2, "order": 6,  "variants": ["light","dark"] },
    { "slug": "mathworks",       "name": "MathWorks",          "tier": 2, "order": 7,  "variants": ["light","dark"] },
    { "slug": "cytron",          "name": "Cytron",             "tier": 3, "order": 1,  "variants": ["light","dark"] },
    { "slug": "odrive",          "name": "ODrive Robotics",    "tier": 3, "order": 2,  "variants": ["light","dark"] },
    { "slug": "blisstronics",    "name": "Blisstronics",       "tier": 3, "order": 3,  "variants": ["light","dark"] },
    { "slug": "elgato",          "name": "Elgato",             "tier": 3, "order": 4,  "variants": ["light","dark"] },
    { "slug": "aqualink",        "name": "Aqualink Bangladesh","tier": 3, "order": 5,  "variants": ["light","dark"] },
    { "slug": "nyntax",          "name": "Nyntax",             "tier": 3, "order": 6,  "variants": ["light","dark"] }
  ]
}
```

BRAC University is the institution, not a sponsor — it lives top-left, never in the strip.

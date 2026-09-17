# Mongol-Tori Brand Kit — CLAUDE.md

Internal web tool for **BRACU Mongol-Tori** (BRAC University's Mars rover team).
The team uploads photos from seminars / outreach / competitions, picks an output ratio, and the tool
automatically overlays the BRACU logo (top-left), the Mongol-Tori logo (top-right) and the sponsor strip
(bottom), with dark/light variants and an optional branded frame. Output is a downloadable PNG ready for
Facebook, Instagram, LinkedIn and YouTube.

The goal is consistency: one design language, one set of rules, zero manual logo placement.

Read these before writing any code, in order:

1. `docs/01-PRD.md` — what we are building and why (features, flows, acceptance criteria)
2. `docs/02-DESIGN-SYSTEM.md` — brand tokens, Y2K-Futurism + Mission-Control language, overlay geometry
3. `docs/03-ARCHITECTURE.md` — stack, folder layout, render pipeline, data models
4. `docs/04-TASKS.md` — phased build plan with checkboxes; tick items off as you finish them

---

## Stack (decided — do not swap without asking)

- **Vite + React 18 + TypeScript** (strict). Single-page app; the only server-side code is
  `api/manifest.ts`, which commits the sponsor board to the repo (see `docs/DECISIONS.md` D33).
- **Tailwind CSS** for app UI. All brand colors come from CSS variables defined in `src/styles/tokens.css`.
- **Canvas 2D API** for compositing and export. No html2canvas / dom-to-image.
- **Zustand** for editor state. **JSZip** for batch export (Phase 3). **Vitest** for the layout engine.
- Deploy target: **Vercel** (`vercel.json`). Photos never leave the browser — the one endpoint
  handles the sponsor board and nothing else.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run test       # vitest (layout engine + tone detection)
npm run lint
```

## Non-negotiable rules

1. **Never use pure white.** The "white" is always `#F4F3EE` (`--mt-cream`). Grep for `#fff`, `#ffffff`, `white` before every commit.
2. **The primary orange is a single token** `--mt-orange`. Its value must be extracted from the live site's CSS
   (`https://bracu-mongoltori.com`) in Task 0.1. Until confirmed, use the fallback `#FF6A1A`. Never hard-code
   orange anywhere except `tokens.css`.
3. **One layout engine, one truth.** Preview and export must both be produced by `renderComposition()` drawing to a
   canvas. The preview is just the export canvas scaled down. If they can ever diverge, the design is wrong.
4. **All overlay geometry is relative** (percent of the canvas's shorter side), never absolute pixels. A preset
   change must never require per-preset tweaks to logo sizes.
5. **Logos are data, not code.** Sponsors live in `public/brand/sponsors/manifest.json`. Adding a sponsor = adding a
   PNG/SVG pair + one JSON entry. No component edits.
6. **Export at full preset resolution** with `devicePixelRatio` ignored (we control the pixel size). PNG default.
7. **Accessibility of the app UI**: keyboard-operable controls, visible focus rings (orange), labels on every input.
8. Commit messages: `feat|fix|chore|docs(scope): message`. Small, frequent commits.

## Conventions

- Files: `kebab-case.ts`, components `PascalCase.tsx`, one component per file.
- Layout engine (`src/engine/`) is **pure TypeScript with zero DOM/React imports** so it can be unit-tested.
- Prefer named exports. No default exports except route/page-level components.
- Comments explain *why*, not *what*. Keep them short.
- When a design decision isn't covered by the docs, choose the option that is more restrained, then note it in
  `docs/DECISIONS.md` (create it on first use).

## Pending inputs from the team (ask before Phase 2 if still missing)

These are not blockers for Phase 0–1 — use placeholders — but flag them clearly in the UI with a
"placeholder asset" badge until real files arrive:

- [ ] Exact orange hex confirmed from live site (Task 0.1 should resolve this automatically)
- [ ] BRACU logo: light-on-dark and dark-on-light versions (SVG preferred, PNG ≥ 1200px fallback)
- [ ] Mongol-Tori logo: light and dark versions (the site serves `/logo-dark.svg` — check for a light one)
- [ ] Sponsor logos (light + dark variants) and their **tiers / ordering**. Seed list is in the manifest, tiers are guesses.
- [ ] Whether the sponsor strip should include *all* sponsors by default or a curated "outreach set"
- [ ] Any mandatory text on posts (e.g. "A team of BRAC University", social handles, website URL)
- [ ] Which platforms matter most — this decides the default preset order in the UI

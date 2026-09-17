# 01 — Product Requirements

## Problem

Every seminar, outreach event and competition update needs the same edit: BRACU logo top-left,
Mongol-Tori logo top-right, sponsor logos along the bottom. Done by hand in Canva/Photoshop it takes
10–20 minutes per image and every person does it slightly differently. Over time this produced posts with
mismatched colors, sizes and themes that don't match the website.

## Goal

A browser tool where anyone on the team can:

1. drop in a photo,
2. pick an output ratio,
3. get a correctly branded, export-ready image in under 30 seconds,

with the design language locked so that the output is identical regardless of who made it.

## Users

- Team media/PR members (primary). Non-designers. Often on laptops at events with poor Wi-Fi.
- Sub-team leads posting quick updates.
- Future: sponsors relations, for sponsor-specific versions.

## Non-goals (v1)

- No text/caption editor beyond the small optional telemetry label (see Design System). This is not Canva.
- No accounts, no cloud storage, no server. If someone needs history, they keep the PNGs.
- No video.

---

## Core features (v1 — must ship)

### F1. Preset selection
Fixed list of output canvases. Selecting one re-lays-out everything instantly.

| id          | Name                | Pixels        | Ratio | Primary use                 |
|-------------|---------------------|---------------|-------|-----------------------------|
| `square`    | Square              | 1080 × 1080   | 1:1   | Instagram / Facebook feed   |
| `portrait34`| Portrait 3:4        | 1080 × 1440   | 3:4   | Instagram / Facebook feed   |
| `portrait45`| Portrait 4:5        | 1080 × 1350   | 4:5   | Instagram feed (max height) |
| `story`     | Story / Reel cover  | 1080 × 1920   | 9:16  | IG/FB stories               |
| `wide`      | Wide 16:9           | 1920 × 1080   | 16:9  | YouTube thumb, LinkedIn, slides |
| `og`        | Link preview        | 1200 × 630    | ~1.9:1| Website OG / LinkedIn link  |

Default preset: `square`. Preset order in the UI is the table order until the team says otherwise.

### F2. Image upload & framing
- Drag-and-drop or file picker. Accept JPG, PNG, WEBP, HEIC (convert HEIC via `heic2any` if cheap; otherwise show a
  clear "convert to JPG first" message).
- Image is placed **cover-fit** into the preset. User can drag to pan and use a slider (or wheel) to zoom
  1.0×–3.0×. Double-click resets.
- Show a subtle safe-zone guide (dashed, orange at 30% opacity) while dragging so people don't put faces under logos.

### F3. Automatic brand overlays
Always on, never manually positioned:

- **BRACU logo** — top-left, inside the safe margin.
- **Mongol-Tori logo** — top-right, inside the safe margin, same visual height as BRACU.
- **Sponsor strip** — bottom, horizontally centered, single row (wraps to two rows above a count threshold),
  ordered by tier then by manifest order.
- **Edge scrims** — soft gradients behind top and bottom edges so logos stay legible on busy photos. Strength is
  tied to tone (F4) and is user-adjustable 0–100%.

Exact geometry in `02-DESIGN-SYSTEM.md → Overlay geometry`.

### F4. Tone toggle (Dark / Light)
- **Dark tone** = photo is dark → overlays render in cream `#F4F3EE` (light logo variants), scrims are black.
- **Light tone** = photo is bright → overlays render in ink `#0B0B0B` (dark logo variants), scrims are cream.
- On upload, **auto-detect** by sampling luminance in the regions the logos will occupy (top-left, top-right,
  bottom band). Show the detected value as the toggle's default. The user can always override.
- Accent (orange) stays orange in both tones.

### F5. Frame toggle (Border on/off)
- Off: photo runs edge to edge.
- On: the "Mission Frame" — a thin orange inset frame with HUD corner brackets and small monospace telemetry
  labels. Spec in Design System. Default: **off** for photos, **on** for the `og` preset.

### F6. Sponsor selection
- Panel listing all sponsors from the manifest with checkboxes, grouped by tier. All checked by default
  (or the "outreach set" if the team defines one).
- "Select all / none" per tier.
- Strip re-flows live.

### F7. Export
- **Download PNG** at exact preset pixel size. Filename: `mongoltori_{preset}_{YYYYMMDD}_{HHmm}.png`.
- Secondary: JPG at quality 0.92 for size-sensitive uploads.
- Export must be pixel-identical to preview (same render function, see Architecture).

### F8. Settings persistence
- Last used preset, tone override, frame state, scrim strength, sponsor selection → `localStorage`.
- "Reset to defaults" button.

---

## Phase 2 (should ship soon after)

- **Batch mode**: upload N photos → same settings applied → ZIP download. Per-image tone auto-detect.
- **Multi-preset export**: one photo → all checked presets in one ZIP.
- **Optional telemetry label** (frame only): one short line, e.g. `// OUTREACH · DHAKA · 16.09.2026`.
  Max 48 chars, monospace, uppercase. Prefilled with today's date.
- **Logo-only mode**: transparent background, just the overlay layer — for dropping onto video in Premiere/CapCut.

## Phase 3 (nice to have)

- Sponsor-specific mode (single sponsor featured larger at the bottom).
- Preset for FB cover (820 × 312) and LinkedIn banner (1584 × 396) — logos only, no sponsor strip.
- Shareable settings URL (state encoded in hash) so a lead can send "use these exact settings".

---

## Acceptance criteria (v1)

- [ ] Any of the six presets, any photo → export in ≤ 3 clicks after upload.
- [ ] Logos are the same *visual* height across presets relative to the shorter side (±1px after rounding).
- [ ] Switching Dark ↔ Light swaps every logo variant and scrim color in one frame, no flicker.
- [ ] Sponsor strip never touches the safe margin; never overlaps the top logos even on `og` (1200 × 630).
- [ ] With 17 sponsors on `square`, the strip wraps to two rows and every logo stays ≥ 18px tall at 1080px.
- [ ] Exported PNG dimensions equal the preset exactly; `#ffffff` does not appear anywhere in the UI.
- [ ] Works offline after first load (Vite PWA plugin, cache brand assets).
- [ ] No image data leaves the browser (verify: zero network requests after asset load).

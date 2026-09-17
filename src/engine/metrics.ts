/**
 * Overlay geometry constants (docs/02-DESIGN-SYSTEM.md § E and § F).
 *
 * Every value is a fraction of S = min(canvasW, canvasH), which is what keeps a
 * logo the same visual weight on a 1080×1080 square and a 1920×1080 wide frame.
 * Nothing in the engine may hard-code a pixel size except the caps below.
 */

/** Safe margin from every edge. */
export const MARGIN = 0.04;

/** Height of the two top logos. */
export const TOP_LOGO_H = 0.07;

/** Absolute cap so a 1920px canvas does not get comically large top logos. */
export const TOP_LOGO_H_MAX_PX = 120;

/** Minimum horizontal breathing room between the two top logos, as a factor of h1. */
export const TOP_GAP_FACTOR = 0.35;

/** Target sponsor logo height, single row. */
export const SPONSOR_H = 0.045;

/** Shrink floor before wrapping to a second row. */
export const SPONSOR_H_MIN = 0.03;

/**
 * Floor once the strip has ALREADY wrapped to two rows — 18.4px at 1080.
 *
 * Reconciles a genuine conflict between the docs. Design System § E sets one floor
 * of 0.030·S (32.4px at 1080) and drops the lowest tier below it; the PRD's
 * acceptance criteria instead require 17 sponsors on `square` to wrap to two rows
 * with "every logo ≥ 18px tall at 1080px". With the team's real artwork — 20 logos
 * averaging 3.7:1 — the strict floor drops seven of them, so the two cannot both
 * hold. See docs/DECISIONS.md D14.
 */
export const SPONSOR_H_MIN_ROWS = 0.017;

/**
 * Rows are one per TIER, top tier first — overriding Design System § E's balanced
 * two-row split and its "never three rows" rule, at the team's request.
 * See docs/DECISIONS.md D16.
 */
export const MAX_SPONSOR_ROWS = 3;

/**
 * Relative logo size per tier, indexed by tier − 1. Tiers past the end of this
 * list take the last value.
 *
 * Deliberately all 1: the team asked that no sponsor look bigger than another
 * regardless of tier, so tier decides only WHICH ROW a logo sits on, never its
 * size. This is the one lever to change if that is ever revisited.
 */
export const TIER_SCALE: readonly number[] = [1, 1, 1];

/**
 * How far to push logos toward equal optical AREA rather than equal height.
 *
 * 0 = every logo the same height, which is what § E specifies and what made a
 * 5.4:1 wordmark (K-Silver) read far heavier than a 1.98:1 mark (Ansys, whose box
 * is tall because of its "part of Synopsys" line). 0.5 = equal area, which sends
 * square marks towering over wordmarks. 0.3 is the usual compromise.
 */
export const WEIGHT_EXPONENT = 0.34;

/**
 * The aspect ratio weighting is measured against. Deliberately a CONSTANT and not
 * the mean of whatever is currently selected — otherwise unticking one sponsor
 * would quietly resize all the others.
 */
export const WEIGHT_REFERENCE_ASPECT = 3;

/** Bounds on the weighting, so one extreme logo can neither tower nor vanish. */
export const WEIGHT_MIN = 0.76;
export const WEIGHT_MAX = 1.62;

/** Horizontal gap between sponsor logos. */
export const SPONSOR_GAP = 0.018;

/** Vertical gap between sponsor rows. */
export const SPONSOR_ROW_GAP = 0.009;

/** Padding inside the sponsor banner, around the logo rows. */
export const STRIP_PAD_X = 0.03;
export const STRIP_PAD_Y = 0.013;



/** How far past the top logos the top scrim fades out. */
export const SCRIM_TOP_FALLOFF = 0.06;

/** How far above the strip the bottom scrim starts. */
export const SCRIM_BOTTOM_FALLOFF = 0.08;

/** Peak scrim alpha at full strength. Scene.scrim scales this. */
export const SCRIM_MAX_ALPHA = 0.55;

/**
 * The sponsor banner is fully opaque. It is a block of the composition — an
 * extension below the photo — not a scrim laid over it.
 */
export const BANNER_ALPHA = 1;

// --- Banner styling (docs/02-DESIGN-SYSTEM.md § A) --------------------------
//
// The band is cream, and carries three of the brand's motifs and no more: the
// single orange accent as a hairline seam, the 1px dotted grid as texture, and one
// mono micro-label. § A's restraint list rules out everything else — no gradients,
// no second chrome highlight, no glow on an exported image.

/** Orange hairline along the band's top edge, where photo meets banner. */
export const BANNER_RULE_H = 0.0028;

/** The dotted-grid motif, in ink, at the density the app UI uses. */
export const BANNER_GRID_SPACING = 0.019;
export const BANNER_GRID_DOT = 0.0011;
export const BANNER_GRID_ALPHA = 0.07;

/**
 * The user's telemetry note, mono, bottom-right of the banner.
 *
 * There is no standing eyebrow any more: a "PARTNERS" heading cost a whole line of
 * band height to say what the logos already say.
 */
export const BANNER_NOTE_SIZE = 0.0105;
export const BANNER_NOTE_TRACKING_EM = 0.12;
export const BANNER_NOTE_ALPHA = 0.38;
export const BANNER_NOTE_MAX_CHARS = 48;

/**
 * A short heavier orange run at the left of the seam — the mission-control "tab"
 * that stops the hairline reading as a plain divider.
 */
export const BANNER_SEAM_TAB_W = 0.09;
export const BANNER_SEAM_TAB_H = 2.6;

// --- Telemetry HUD (docs/02-DESIGN-SYSTEM.md § A) ---------------------------
//
// The mono micro-labels, the status tags and the footer coordinates are the
// brand's most recognisable signatures, and the photo has the negative space § A
// asks for — so the HUD lives there and costs the banner no height at all.

export const HUD_SIZE = 0.0125;
export const HUD_TRACKING_EM = 0.12;
export const HUD_ALPHA = 0.62;

/** Distance from the bottom of the photo region. */
export const HUD_OFFSET = 0.028;

/**
 * The `//` prefix § A puts on its mono micro-labels. The labels themselves are the
 * user's note and the export date — there is no standing text.
 */
export const HUD_PREFIX = '// ';

// --- The card (Frame toggle on) --------------------------------------------

/**
 * How far the card sits in from the canvas edge. Tight on purpose — the ground is
 * a frame, not a mat, and a wide one just eats the photo.
 */
export const CARD_INSET = 0.017;

/**
 * Size of the 45° corner cut. Chamfered panels — not rounded ones — are what the
 * reference boards are built from, and it is the single move that most defines
 * the language (docs/DECISIONS.md D25).
 */
export const CARD_CHAMFER = 0.030;

/** How far the orange corner accent runs along each edge beside the chamfer. */
export const CARD_ACCENT_LEN = 0.045;

/**
 * Corner brackets instead of a continuous border (§ F's HUD language, the one
 * Y2K motif the Design System sanctions on an export). The card's own edge is
 * already visible against the ground, so a full rule around it was redundant AND
 * ate margin.
 */
export const CARD_STROKE = 0.0026;
export const CARD_STROKE_MIN_PX = 2;
export const CARD_BRACKET_LEN = 0.052;
export const CARD_BRACKET_GAP = 0.009;

/** Overlays sit inside the card: m' = inset + m · this. */
export const FRAME_MARGIN_FACTOR = 0.6;

// --- Tone detection --------------------------------------------------------

/** Width of each top sampling box, as a fraction of W. */
export const TONE_TOP_BOX_W = 0.3;

/**
 * Region weights: top-left and top-right only.
 *
 * § E also samples a bottom band at weight 0.4, but the sponsor banner is now
 * opaque and covers it — tone only decides the two TOP logos, so only the boxes
 * they occupy should get a vote.
 */
export const TONE_WEIGHTS: readonly [number, number] = [0.5, 0.5];

// --- Scene defaults --------------------------------------------------------

export const DEFAULT_SCRIM = 0.7;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

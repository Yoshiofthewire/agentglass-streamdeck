/**
 * The palette the keys are painted in — agentglass's own "Midnight Purple",
 * lifted from web/src/lib/themes.ts so the deck and the cockpit read as one
 * instrument rather than two apps that happen to be connected.
 *
 * Only the values the key art actually uses are copied. The cockpit has 22
 * themes and the deck follows none of them at runtime: a Stream Deck sits in
 * peripheral vision, and a surface that restyles itself whenever you cycle the
 * app's theme is a distraction, not a feature. The default palette is the one
 * the app ships with, and the one these keys are tuned against.
 */

export const BG = "#0f0a1a";
export const BG2 = "#1a1333";
export const BG3 = "#2d1b4e";
export const TEXT = "#f3e8ff";
export const TEXT_DIM = "#c084fc";
export const BORDER = "#6d28d9";
export const PRIMARY = "#a78bfa";

/**
 * Per-group accents. A glance at a full deck should sort itself into
 * navigation / panels / decisions / instruments without reading a word, so the
 * hue carries the group and the label carries the specifics.
 */
export const ACCENTS = {
  /** Workspace views — the app's own primary violet. */
  view: PRIMARY,
  /** Panels and overlays: cooler, one step back from the views. */
  panel: "#818cf8",
  /** Frame-level navigation (workspace, home). Neutral, but kept bright: the
   *  dimmed treatment below is what "this key can't do anything right now"
   *  looks like, and a chrome-coloured key must not be mistaken for one. */
  nav: "#cbd5e1",
  /** Appearance — theme, zoom. */
  look: "#22d3ee",
  /** Chat. */
  chat: "#2dd4bf",
  /** Yes. */
  go: "#34d399",
  /** No. */
  stop: "#f472b6",
  /** Something is waiting on you. */
  alert: "#fbbf24",
  /** Instruments — meters and graphs. */
  meter: "#a78bfa",
  /** Nothing is reaching the server. */
  dead: "#64748b",
} as const;

export type AccentId = keyof typeof ACCENTS;

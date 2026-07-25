/**
 * The key glyphs, as line art on a 24×24 grid.
 *
 * Each is a function of its colour rather than a static string that inherits
 * one: the images are rasterised by whatever SVG renderer the host uses
 * (OpenDeck's, Elgato's), and `currentColor` / `inherit` are exactly the parts
 * of the spec a minimal rasteriser is most likely to skip. Passing the colour
 * in costs a few characters per glyph and removes the whole class of "renders
 * black on this one machine" bugs.
 *
 * All stroke, no fill, 1.8px at 24px — the hairline look the cockpit's own
 * icons use, and thin enough that it survives being scaled to a 72px key.
 */

export type Glyph = (c: string) => string;

/**
 * Shared attributes for stroked geometry.
 *
 * The weight is a parameter rather than something callers append, because an
 * appended `stroke-width` is a *duplicate* attribute — invalid XML, which a
 * rasteriser rejects outright and the deck shows as a blank key with no error
 * anywhere. One place to set it means it can only be set once.
 */
const S = (c: string, width = 1.8, extra = ""): string =>
  `fill="none" stroke="${c}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra ? " " + extra : ""}`;

const dot = (c: string, x: number, y: number, r = 2): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;

export const GLYPHS = {
  // --- workspace views ---------------------------------------------------
  /** A branch: trunk, offshoot, two nodes and a merge point. */
  git: (c) =>
    `<path ${S(c)} d="M7 4v16M7 9h6a4 4 0 0 1 4 4v3"/>${dot(c, 7, 4, 2.2)}${dot(c, 7, 20, 2.2)}${dot(c, 17, 19, 2.2)}`,
  /** Two panes with a change marker in each. */
  diff: (c) =>
    `<path ${S(c)} d="M3 4h7v16H3zM14 4h7v16h-7M5.5 9h2M5.5 12h2M17.5 11v4M15.5 13h4"/>`,
  /** A pull request: a source line arcing into a target line. */
  pr: (c) =>
    `<path ${S(c)} d="M6 7v10M18 12v5M18 8.5V7a3 3 0 0 0-3-3h-3l2-2m-2 2 2 2"/>${dot(c, 6, 5, 2)}${dot(c, 6, 19, 2)}${dot(c, 18, 19, 2)}`,
  /** Stacked containers over a waterline. The gap between the two matters —
   *  drawn any closer they merge into one shape at key size. */
  docker: (c) =>
    `<path ${S(c)} d="M4.5 11h4.2v4.2H4.5zM9.9 11h4.2v4.2H9.9zM15.3 11h4.2v4.2h-4.2zM9.9 5.6h4.2v4.2H9.9z"/>` +
    `<path ${S(c)} d="M2.5 19.4c2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0"/>`,
  /** A prompt. */
  term: (c) =>
    `<path ${S(c)} d="M3 5h18v14H3zM7 10l2.5 2L7 14M12.5 15H17"/>`,
  /** A conversation. */
  chat: (c) =>
    `<path ${S(c)} d="M4 5h16v11H9l-5 4z"/>${dot(c, 9, 10.5, 1.3)}${dot(c, 12.5, 10.5, 1.3)}${dot(c, 16, 10.5, 1.3)}`,

  // --- panels ------------------------------------------------------------
  /** Bars, ascending. */
  stats: (c) => `<path ${S(c)} d="M3 20h18M6.5 20v-5M11 20v-9M15.5 20v-6M20 20v-11"/>`,
  /** A four-point spark. */
  skills: (c) =>
    `<path ${S(c)} d="M12 3l2 6.5L20.5 12 14 14l-2 6.5L10 14 3.5 12 10 9.5z"/>`,
  /** A magnifier. */
  search: (c) => `<path ${S(c)} d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M16.2 16.2 21 21"/>`,
  /** A question mark, drawn rather than typeset — one less font dependency. */
  help: (c) =>
    `<path ${S(c)} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.3 9.3a2.8 2.8 0 1 1 3.6 2.8c-.6.2-.9.8-.9 1.5v.6"/>${dot(c, 12, 17.2, 1.2)}`,
  /** The command palette: a grid with one cell lit. */
  palette: (c) =>
    `<path ${S(c)} d="M3 4h18v16H3zM3 9h18M8.5 9v11"/><rect x="11" y="11" width="7" height="2.4" rx="1.2" fill="${c}"/><rect x="11" y="15" width="4.5" height="2.4" rx="1.2" fill="${c}" opacity="0.55"/>`,

  // --- frame navigation ---------------------------------------------------
  /** The workspace overlay: a window rising over the dashboard behind it. */
  workspace: (c) =>
    `<path ${S(c, 1.8, 'opacity="0.45"')} d="M6 3h15v13"/><path ${S(c)} d="M3 7h15v14H3zM3 11h15"/>`,
  /** Home / peel everything back. */
  home: (c) => `<path ${S(c)} d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>`,

  // --- appearance ----------------------------------------------------------
  /** A disc split light/dark — the theme cycle. */
  theme: (c) =>
    `<path ${S(c)} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="${c}"/>`,
  // Forward and back are one key apart on a deck, and two keys that differ only
  // in their caption are two keys you will press wrong. The chevron is the part
  // you read at a glance; the caption only confirms it.
  themeNext: (c) =>
    `<path ${S(c)} d="M10 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15"/><path d="M10 4.5a7.5 7.5 0 0 1 0 15z" fill="${c}"/>` +
    `<path ${S(c, 2.2)} d="M18.5 8.5 22 12l-3.5 3.5"/>`,
  themePrev: (c) =>
    `<path ${S(c)} d="M14 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15"/><path d="M14 4.5a7.5 7.5 0 0 1 0 15z" fill="${c}"/>` +
    `<path ${S(c, 2.2)} d="M5.5 8.5 2 12l3.5 3.5"/>`,
  zoomIn: (c) => `<path ${S(c)} d="M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15.7 15.7 21 21M7.7 10.5h5.6M10.5 7.7v5.6"/>`,
  zoomOut: (c) => `<path ${S(c)} d="M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15.7 15.7 21 21M7.7 10.5h5.6"/>`,
  zoomReset: (c) =>
    `<path ${S(c)} d="M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15.7 15.7 21 21"/>${dot(c, 10.5, 10.5, 2.1)}`,

  // --- decisions -----------------------------------------------------------
  approve: (c) => `<path ${S(c, 2.4)} d="M4 12.5 9.5 18 20 6"/>`,
  deny: (c) => `<path ${S(c, 2.4)} d="M6 6l12 12M18 6 6 18"/>`,
  next: (c) => `<path ${S(c, 2.2)} d="M9 4l8 8-8 8"/>`,
  prev: (c) => `<path ${S(c, 2.2)} d="M15 4l-8 8 8 8"/>`,

  // --- chat control ---------------------------------------------------------
  /** A fresh conversation. */
  chatNew: (c) =>
    `<path ${S(c)} d="M4 5h16v11H9l-5 4z"/><path ${S(c, 2.2)} d="M12 7.4v6M9 10.4h6"/>`,
  /** Compaction: a transcript squeezed from both ends toward one line. */
  compact: (c) =>
    `<path ${S(c)} d="M3.5 3h17M3.5 21h17"/>` +
    `<path ${S(c)} d="M12 5.5v3.5M8.8 6.8 12 10l3.2-3.2M12 18.5V15M8.8 17.2 12 14l3.2 3.2"/>` +
    `<path ${S(c, 2.2)} d="M4.5 12h15"/>`,

  // --- instruments ----------------------------------------------------------
  /** Signal strength — the link to agentglass. */
  link: (c) =>
    `<path ${S(c)} d="M3.5 10a12 12 0 0 1 17 0M6.8 13.2a7.4 7.4 0 0 1 10.4 0"/>${dot(c, 12, 17.5, 2.2)}`,
} satisfies Record<string, Glyph>;

export type GlyphId = keyof typeof GLYPHS;

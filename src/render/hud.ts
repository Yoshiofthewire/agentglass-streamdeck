/**
 * Key art: agentglass's cockpit look, rendered as SVG and handed to the deck as
 * a data URI.
 *
 * Why draw at runtime rather than ship PNGs. The deck's own title overlay is a
 * plain system font dropped on top of whatever image is underneath — it can't
 * be styled, it doesn't know the accent colour, and it can't sit below a rule
 * or beside a badge. Every label here is part of the image instead, so a key
 * reads as one designed object, and the same code path draws the live ones
 * (a queue count, a usage graph) that no static asset could.
 *
 * Everything is pure: `(state) => data URI`. That keeps the whole visual layer
 * unit-testable without a device, which matters because a broken SVG shows up
 * on hardware as a blank key with no error anywhere.
 *
 * Kept deliberately plain for the rasteriser's sake — solid fills, gradients,
 * `opacity`, and `<text font-family="sans-serif">`. No CSS, no `currentColor`,
 * no external fonts: the host renderers vary, and the sci-fi look is carried by
 * geometry and palette, neither of which needs anything exotic.
 */

import { GLYPHS, type GlyphId } from "./glyphs.ts";
import { ACCENTS, BG, BG2, BG3, TEXT, TEXT_DIM, type AccentId } from "./theme.ts";

/** Stream Deck keys are 72px; everything is drawn at 2× for a crisp raster. */
const SIZE = 144;

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const dataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${inner}</svg>`;

/**
 * Average advance per character, in ems, for upper-case bold sans.
 *
 * Not a guess: rasterise "WORKSPACE" at 15px with 1.4px tracking and it
 * measures 102px, which is what this constant reproduces. It is a single
 * binding because the two places that need it — deciding a label is too wide,
 * and deciding how far to shrink it — must agree. When they didn't, a caption
 * that failed the width check was "corrected" to a size *larger* than the one
 * it started at.
 */
const EM_ADVANCE = 0.68;

/**
 * Widest font size that keeps `text` inside `max` px.
 *
 * A measured width would need font metrics we deliberately don't ship, so this
 * approximates. It only ever shrinks, so the failure mode is a label a point
 * smaller than it had to be — not one that runs off the key.
 */
export function fitFontSize(text: string, max: number, ideal: number, min: number, tracking = 1.4): number {
  const n = text.length;
  if (n === 0) return ideal;
  const gaps = Math.max(0, n - 1) * tracking;
  if (n * ideal * EM_ADVANCE + gaps <= max) return ideal;
  return Math.max(min, Math.floor((max - gaps) / (n * EM_ADVANCE)));
}

/** The dark ground every key sits on: gradient, grid, and a faint scanline. */
function plate(accent: string, dim: boolean): string {
  const grid: string[] = [];
  for (let i = 18; i < SIZE; i += 18) {
    grid.push(`<path d="M${i} 0v${SIZE}M0 ${i}h${SIZE}"/>`);
  }
  return (
    `<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${BG2}"/><stop offset="1" stop-color="${BG}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${SIZE}" height="${SIZE}" rx="16" fill="url(#p)"/>` +
    `<g stroke="${BG3}" stroke-width="1" opacity="${dim ? 0.25 : 0.45}">${grid.join("")}</g>` +
    // A soft wash of the accent from the top edge, so each group reads as lit
    // from its own colour rather than merely outlined in it.
    `<rect width="${SIZE}" height="56" rx="16" fill="${accent}" opacity="${dim ? 0.04 : 0.09}"/>` +
    `<rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" rx="15" fill="none" stroke="${accent}" stroke-width="1.5" opacity="${dim ? 0.2 : 0.4}"/>`
  );
}

/** HUD corner brackets — the detail that makes a key look like an instrument. */
function brackets(accent: string, dim: boolean): string {
  const i = 9;
  const a = 15;
  const o = SIZE - i;
  return (
    `<g fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="${dim ? 0.3 : 0.75}">` +
    `<path d="M${i} ${i + a}V${i}h${a}"/>` +
    `<path d="M${o - a} ${i}h${a}v${a}"/>` +
    `<path d="M${o} ${o - a}V${o}h-${a}"/>` +
    `<path d="M${i + a} ${o}H${i}v-${a}"/>` +
    `</g>`
  );
}

/** The bottom caption, over its own hairline rule. */
function caption(text: string, accent: string, dim: boolean): string {
  const label = text.toUpperCase();
  // Held to the width of the rule beneath it rather than the width of the key,
  // so a long caption sits inside the frame instead of butting against it.
  const size = fitFontSize(label, 100, 15, 9);
  return (
    `<path d="M22 108h100" stroke="${accent}" stroke-width="1" opacity="${dim ? 0.25 : 0.5}"/>` +
    `<text x="72" y="129" text-anchor="middle" font-family="sans-serif" font-size="${size}"` +
    ` font-weight="bold" letter-spacing="1.4" fill="${dim ? TEXT_DIM : TEXT}"` +
    `${dim ? ' opacity="0.6"' : ""}>${esc(label)}</text>`
  );
}

/** A count in the top-right corner — the pending queue, unread chats. */
function badge(count: number, accent: string): string {
  const text = count > 99 ? "99+" : String(count);
  const w = Math.max(26, 13 + text.length * 11);
  return (
    `<rect x="${SIZE - 10 - w}" y="8" width="${w}" height="26" rx="13" fill="${accent}"/>` +
    `<text x="${SIZE - 10 - w / 2}" y="27" text-anchor="middle" font-family="sans-serif"` +
    ` font-size="17" font-weight="bold" fill="${BG}">${esc(text)}</text>`
  );
}

export type KeyArt = {
  label: string;
  glyph: GlyphId;
  accent: AccentId;
  /** Nothing is reaching agentglass — drawn cold and greyed. */
  offline?: boolean;
  /** Shown top-right when > 0. */
  count?: number;
  /** Overrides the accent, e.g. an idle approve key going amber when work lands. */
  accentOverride?: string;
};

/** The standard command key: glyph over a caption, on the HUD plate. */
export function keySvg(art: KeyArt): string {
  const dim = art.offline === true;
  const accent = dim ? ACCENTS.dead : (art.accentOverride ?? ACCENTS[art.accent]);
  const glyph = GLYPHS[art.glyph](accent);
  // 24-grid glyph, scaled to 50px and centred in the upper field.
  const k = 2.1;
  const off = (24 * k) / 2;
  return svgDoc(
    plate(accent, dim) +
      brackets(accent, dim) +
      `<g transform="translate(${72 - off} ${58 - off}) scale(${k})"${dim ? ' opacity="0.55"' : ""}>${glyph}</g>` +
      caption(art.label, accent, dim) +
      (art.count && art.count > 0 ? badge(art.count, accent) : ""),
  );
}

// --- instruments -----------------------------------------------------------

export type MeterArt = {
  label: string;
  /** 0..100, or null when the reading is unavailable. */
  percent: number | null;
  /** Oldest → newest samples, 0..100. Drawn as the area graph. */
  history: number[];
  /** Small top-right note — usually the time until the window resets. */
  note?: string;
  offline?: boolean;
};

/** Utilisation colour: violet until it matters, then amber, then rose. */
export function meterColor(percent: number): string {
  if (percent >= 90) return ACCENTS.stop;
  if (percent >= 70) return ACCENTS.alert;
  return ACCENTS.meter;
}

/**
 * The area graph across the middle of a meter key.
 *
 * Fixed 0..100 y-axis rather than auto-scaled to the data: these are percentages
 * of a hard limit, and a graph that rescales itself would draw a quiet week and
 * a week against the ceiling identically. Flat-and-low is the information.
 */
function spark(history: number[], x: number, y: number, w: number, h: number, color: string): string {
  if (history.length < 2) {
    return (
      `<path d="M${x} ${y + h}h${w}" stroke="${color}" stroke-width="1.5" opacity="0.35" fill="none"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-family="sans-serif"` +
      ` font-size="11" fill="${TEXT_DIM}" opacity="0.65">charting…</text>`
    );
  }
  const step = w / (history.length - 1);
  const py = (v: number) => y + h - (Math.max(0, Math.min(100, v)) / 100) * h;
  const pts = history.map((v, i) => `${(x + i * step).toFixed(1)} ${py(v).toFixed(1)}`);
  const line = `M${pts.join("L")}`;
  return (
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0.55"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0.05"/>` +
    `</linearGradient></defs>` +
    `<path d="${line}L${(x + w).toFixed(1)} ${y + h}L${x} ${y + h}Z" fill="url(#s)"/>` +
    `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${(x + w).toFixed(1)}" cy="${py(history[history.length - 1]!).toFixed(1)}" r="2.6" fill="${color}"/>`
  );
}

/** A segmented bar — the same reading as the graph, at a glance. */
function segments(percent: number, x: number, y: number, w: number, color: string): string {
  const n = 14;
  const gap = 2.5;
  const sw = (w - gap * (n - 1)) / n;
  const lit = Math.round((percent / 100) * n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      `<rect x="${(x + i * (sw + gap)).toFixed(1)}" y="${y}" width="${sw.toFixed(1)}" height="7" rx="1.5"` +
        ` fill="${i < lit ? color : BG3}" opacity="${i < lit ? 1 : 0.8}"/>`,
    );
  }
  return out.join("");
}

/**
 * A usage window as an instrument: the reading, its trend, and how full it is.
 *
 * Built for the deck's real viewing distance — the number is legible across a
 * room, the graph and the bar only need to be legible when you look straight at
 * it, which is when you care about the trend rather than the level.
 */
export function meterSvg(art: MeterArt): string {
  const dim = art.offline === true || art.percent === null;
  const pct = art.percent ?? 0;
  const color = dim ? ACCENTS.dead : meterColor(pct);
  const reading = art.percent === null ? "—" : `${Math.round(pct)}%`;
  return svgDoc(
    plate(color, dim) +
      brackets(color, dim) +
      // Both readouts are inset clear of the corner brackets: the number is
      // the one thing on this key that has to be legible at a glance, and a
      // digit clipped by the frame is the fastest way to lose that.
      (art.note
        ? `<text x="130" y="21" text-anchor="end" font-family="sans-serif" font-size="11"` +
          ` fill="${TEXT_DIM}" opacity="0.8">${esc(art.note)}</text>`
        : "") +
      // Sized so "100%" still clears the reset note to its right.
      `<text x="26" y="34" font-family="sans-serif" font-size="${reading.length >= 4 ? 23 : 26}"` +
      ` font-weight="bold" fill="${dim ? TEXT_DIM : TEXT}">${esc(reading)}</text>` +
      spark(dim ? [] : art.history, 14, 44, SIZE - 28, 46, color) +
      segments(dim ? 0 : pct, 14, 96, SIZE - 28, color) +
      caption(art.label, color, dim),
  );
}

/**
 * The link key: is the cockpit reachable, and is anything waiting.
 *
 * Deliberately not a button that does something — a deck full of controls with
 * no feedback leaves you pressing keys to find out whether the server is up.
 */
export function linkSvg(connected: boolean, pending: number): string {
  const accent = !connected ? ACCENTS.dead : pending > 0 ? ACCENTS.alert : ACCENTS.go;
  return svgDoc(
    plate(accent, !connected) +
      brackets(accent, !connected) +
      `<g transform="translate(47 33) scale(2.1)"${!connected ? ' opacity="0.55"' : ""}>${GLYPHS.link(accent)}</g>` +
      caption(connected ? (pending > 0 ? "waiting" : "linked") : "offline", accent, !connected) +
      (pending > 0 && connected ? badge(pending, accent) : ""),
  );
}

// --- what the action layer actually sends ------------------------------------
//
// `setImage` accepts a bare SVG string per the SDK docs, but a base64 data URI
// is the form every host is known to take — it is what the other plugins on a
// working OpenDeck install send, and it sidesteps any question of how a raw
// `<svg>` payload survives the JSON hop. The `*Svg` builders above stay
// exported so tests and the preview script can read the markup directly.

export const keyImage = (art: KeyArt): string => dataUri(keySvg(art));
export const meterImage = (art: MeterArt): string => dataUri(meterSvg(art));
export const linkImage = (connected: boolean, pending: number): string => dataUri(linkSvg(connected, pending));

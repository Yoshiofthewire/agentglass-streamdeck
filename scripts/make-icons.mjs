// Generate the icons OpenDeck shows beside each action in its action list,
// from the same catalog and the same glyphs the keys themselves are drawn with.
// Run:
//   node scripts/make-icons.mjs
//
// Two formats per action, because the two hosts resolve `"Icon": "imgs/.../icon"`
// differently: OpenDeck tries the extensions and prefers `.svg`, Elgato's
// software wants `icon.png` + `icon@2x.png`. The SVG is the real artwork —
// identical glyph, identical palette, so the list matches the deck. The PNG is
// a fallback drawn without a rasteriser: the accent plate and its HUD brackets,
// which is enough to tell the groups apart at list size.

import { deflateSync } from "node:zlib";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DIALS, KEYS } from "../src/core/catalog.ts";
import { GLYPHS } from "../src/render/glyphs.ts";
import { ACCENTS, BG, BG2, BG3 } from "../src/render/theme.ts";

const OUT = "com.agentglass.controller.sdPlugin/imgs";

// --- svg (the real icon) ----------------------------------------------------

/** The key plate at icon scale: gradient ground, grid, brackets, glyph. */
function svgIcon(glyph, accent, size = 144) {
  const grid = [];
  for (let i = 18; i < size; i += 18) grid.push(`<path d="M${i} 0v${size}M0 ${i}h${size}"/>`);
  const i = 9;
  const a = 15;
  const o = size - i;
  const k = 3.4;
  const off = (24 * k) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${BG2}"/><stop offset="1" stop-color="${BG}"/></linearGradient></defs>` +
    `<rect width="${size}" height="${size}" rx="16" fill="url(#p)"/>` +
    `<g stroke="${BG3}" stroke-width="1" opacity="0.45">${grid.join("")}</g>` +
    `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="15" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.4"/>` +
    `<g fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.75">` +
    `<path d="M${i} ${i + a}V${i}h${a}"/><path d="M${o - a} ${i}h${a}v${a}"/>` +
    `<path d="M${o} ${o - a}V${o}h-${a}"/><path d="M${i + a} ${o}H${i}v-${a}"/></g>` +
    `<g transform="translate(${size / 2 - off} ${size / 2 - off}) scale(${k})">${glyph(accent)}</g>` +
    `</svg>`
  );
}

// --- png (the Elgato fallback) ----------------------------------------------

// CRC32 (PNG chunk checksums).
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(td), 0);
  return Buffer.concat([len, td, crc]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The plate and its corner brackets, rasterised directly — no paths, so no
 *  rasteriser: everything here is a rectangle or a rounded-corner test. */
function png(size, accentHex) {
  const [ar, ag, ab] = hex(accentHex);
  const [br, bg, bb] = hex(BG);
  const [b2r, b2g, b2b] = hex(BG2);
  const radius = Math.floor(size * 0.11);
  const inset = Math.round(size * 0.0625); // matches the SVG's 9/144
  const arm = Math.round(size * 0.104); // matches 15/144
  const thick = Math.max(1, Math.round(size / 72));

  const inside = (x, y) => {
    const cx = Math.min(x, size - 1 - x);
    const cy = Math.min(y, size - 1 - y);
    if (cx >= radius || cy >= radius) return true;
    const dx = radius - cx;
    const dy = radius - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  // Is (x,y) on one of the four L-shaped brackets?
  const onBracket = (x, y) => {
    const near = (v, edge) => Math.abs(v - edge) < thick;
    const lo = inset;
    const hi = size - 1 - inset;
    const inX = (x >= lo && x <= lo + arm) || (x >= hi - arm && x <= hi);
    const inY = (y >= lo && y <= lo + arm) || (y >= hi - arm && y <= hi);
    const onH = (near(y, lo) || near(y, hi)) && inX && inY;
    const onV = (near(x, lo) || near(x, hi)) && inY && inX;
    return onH || onV;
  };

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    const t = y / (size - 1); // the same top-to-bottom gradient as the SVG
    const gr = Math.round(b2r + (br - b2r) * t);
    const gg = Math.round(b2g + (bg - b2g) * t);
    const gb = Math.round(b2b + (bb - b2b) * t);
    for (let x = 0; x < size; x++) {
      const on = onBracket(x, y);
      raw[p++] = on ? ar : gr;
      raw[p++] = on ? ag : gg;
      raw[p++] = on ? ab : gb;
      raw[p++] = inside(x, y) ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- write ------------------------------------------------------------------

function write(path, glyph, accent) {
  const file = (suffix) => join(OUT, `${path}${suffix}`);
  mkdirSync(dirname(file("")), { recursive: true });
  writeFileSync(file(".svg"), svgIcon(glyph, accent));
  writeFileSync(file(".png"), png(72, accent));
  writeFileSync(file("@2x.png"), png(144, accent));
}

// Stale action folders outlive renames, and OpenDeck happily keeps showing
// them. The catalog is the list; anything else under actions/ is a leftover.
rmSync(join(OUT, "actions"), { recursive: true, force: true });

for (const def of [...KEYS, ...DIALS]) write(`actions/${def.id}/icon`, GLYPHS[def.glyph], ACCENTS[def.accent]);
write("plugin/icon", GLYPHS.link, ACCENTS.view);
write("plugin/category", GLYPHS.link, ACCENTS.view);

console.log(`icons written to ${OUT} — ${KEYS.length + DIALS.length} actions, svg + png`);

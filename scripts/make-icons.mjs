// Generate the plugin's placeholder icons — solid rounded squares in the
// agentglass palette — as valid PNGs, with no image dependency. Run:
//   node scripts/make-icons.mjs
// Regenerate whenever the action list below changes. Swap in real art later;
// the manifest paths stay the same.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = "com.agentglass.controller.sdPlugin/imgs";

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

// A solid RGBA square with a soft rounded-corner mask, `size`px, colour `rgb`.
function png(size, [r, g, b]) {
  const radius = Math.floor(size * 0.18);
  const inside = (x, y) => {
    const cx = Math.min(x, size - 1 - x);
    const cy = Math.min(y, size - 1 - y);
    if (cx >= radius || cy >= radius) return true;
    const dx = radius - cx;
    const dy = radius - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const a = inside(x, y) ? 255 : 0;
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
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

function write(path, rgb) {
  for (const [suffix, size] of [["", 72], ["@2x", 144]]) {
    const file = join(OUT, `${path}${suffix}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png(size, rgb));
  }
}

const PURPLE = [167, 139, 250];
const SLATE = [100, 116, 139];
const RED = [244, 63, 94];
const GREY = [63, 63, 70];
const ROSE = [251, 113, 133];
const VIOLET = [139, 92, 246];
const BLUE = [96, 165, 250];

write("plugin/icon", PURPLE);
write("plugin/category", PURPLE);
write("actions/view/icon", PURPLE);
write("actions/command/icon", SLATE);
write("actions/approve/idle", GREY);
write("actions/approve/pending", RED);
write("actions/deny/icon", ROSE);
write("actions/gate/icon", RED);
write("actions/theme/icon", VIOLET);
write("actions/zoom/icon", BLUE);

console.log("icons written to", OUT);

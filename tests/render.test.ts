import { test } from "node:test";
import assert from "node:assert/strict";

import { DIALS, KEYS } from "../src/core/catalog.ts";
import { GLYPHS } from "../src/render/glyphs.ts";
import { ACCENTS } from "../src/render/theme.ts";
import { fitFontSize, keyImage, keySvg, linkSvg, meterColor, meterSvg } from "../src/render/hud.ts";

/**
 * A deliberately strict, deliberately small XML check.
 *
 * There is no XML parser here and no reason to add one: the two ways this
 * generator can produce invalid markup are an unbalanced tag and a repeated
 * attribute, and both are cheap to detect. The second is not hypothetical —
 * building a glyph by appending `stroke-width` to a helper that already set it
 * produced a duplicate attribute, which rasterisers reject outright and the
 * deck shows as a blank key with no error logged anywhere. That is exactly the
 * kind of failure a test has to catch, because the device won't report it.
 */
function assertWellFormed(svg: string, what: string): void {
  assert.ok(svg.startsWith("<svg "), `${what}: does not start with <svg`);
  assert.ok(svg.endsWith("</svg>"), `${what}: does not end with </svg>`);

  const stack: string[] = [];
  // Lazy on the attribute run, so the trailing "/" of a self-closing tag is
  // matched by the group that means it rather than swallowed as an attribute.
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = tag.exec(svg)) !== null) {
    seen++;
    const [, closing, name, attrs, selfClosing] = m;
    if (closing) {
      assert.equal(stack.pop(), name, `${what}: </${name}> does not close the open element`);
      continue;
    }
    const names = [...attrs!.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*"/g)].map((a) => a[1]!);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dupes, [], `${what}: attribute repeated on <${name}>: ${dupes.join(", ")}`);
    // Every attribute must be quoted — an unquoted one means a value with a
    // stray quote in it has torn the tag apart.
    assert.equal(
      (attrs!.match(/"/g) ?? []).length % 2,
      0,
      `${what}: unbalanced quotes on <${name}>`,
    );
    if (!selfClosing) stack.push(name!);
  }
  assert.ok(seen > 0, `${what}: no elements found`);
  assert.deepEqual(stack, [], `${what}: unclosed elements ${stack.join(", ")}`);
}

test("every glyph in the set renders well-formed markup", () => {
  for (const [id, glyph] of Object.entries(GLYPHS)) {
    assertWellFormed(`<svg xmlns="http://www.w3.org/2000/svg">${glyph("#a78bfa")}</svg>`, `glyph ${id}`);
  }
});

test("every catalog key renders a well-formed image, live and offline", () => {
  for (const def of KEYS) {
    for (const offline of [false, true]) {
      const art = { label: def.label, glyph: def.glyph, accent: def.accent, offline };
      assertWellFormed(keySvg(art), `${def.id} (offline=${offline})`);
    }
    assertWellFormed(keySvg({ label: def.label, glyph: def.glyph, accent: def.accent, count: 7 }), `${def.id} badged`);
  }
});

test("the meters render well-formed at every interesting reading", () => {
  const history = Array.from({ length: 30 }, (_, i) => i * 3);
  for (const percent of [null, 0, 34, 71, 100]) {
    assertWellFormed(meterSvg({ label: "5h Window", percent, history, note: "2h" }), `meter ${percent}`);
  }
  // The states with no data at all: nothing sampled yet, and offline.
  assertWellFormed(meterSvg({ label: "Weekly", percent: 5, history: [] }), "meter empty history");
  assertWellFormed(meterSvg({ label: "Weekly", percent: 5, history: [9], offline: true }), "meter offline");
});

test("the machine meters render well-formed, including with no sensor", () => {
  assertWellFormed(meterSvg({ label: "CPU", percent: 97, history: [4, 99], note: "16c" }), "cpu");
  assertWellFormed(meterSvg({ label: "Memory", percent: 61, history: [60, 61], note: "23G" }), "memory");
  assertWellFormed(meterSvg({ label: "Battery", percent: 8, history: [11, 8], note: "bat", tone: "charge" }), "battery");
  // A desktop's battery, a headless box's GPU: no reading at all, ever.
  assertWellFormed(meterSvg({ label: "Battery", percent: null, history: [], tone: "charge" }), "no battery");
});

test("the charge tone runs the other way — a full battery is not a warning", () => {
  assert.equal(meterColor(95), ACCENTS.stop, "95% of a rate limit is nearly spent");
  assert.equal(meterColor(95, "charge"), ACCENTS.meter, "95% of a battery is nearly full");
  assert.equal(meterColor(8, "charge"), ACCENTS.stop);
  assert.equal(meterColor(20, "charge"), ACCENTS.alert);
  assert.equal(meterColor(8), ACCENTS.meter, "8% of a rate limit is nothing to report");
});

test("the link key renders well-formed in all three states", () => {
  assertWellFormed(linkSvg(true, 0), "link idle");
  assertWellFormed(linkSvg(true, 4), "link waiting");
  assertWellFormed(linkSvg(false, 0), "link offline");
});

test("labels are drawn into the image, upper-cased", () => {
  const svg = keySvg({ label: "Zoom 1:1", glyph: "zoomReset", accent: "look" });
  assert.match(svg, />ZOOM 1:1</);
});

test("labels are XML-escaped, so an ampersand can never break a key", () => {
  const svg = keySvg({ label: "a & b", glyph: "git", accent: "view" });
  assert.match(svg, />A &amp; B</);
  assertWellFormed(svg, "escaped label");
});

test("an offline key is drawn in the dead colour, not its own accent", () => {
  const live = keySvg({ label: "Git", glyph: "git", accent: "view" });
  const dead = keySvg({ label: "Git", glyph: "git", accent: "view", offline: true });
  assert.ok(live.includes(ACCENTS.view), "a live key uses its accent");
  assert.ok(!dead.includes(ACCENTS.view), "an offline key must not still be lit in its accent");
  assert.ok(dead.includes(ACCENTS.dead));
});

test("the badge only appears when there is a count", () => {
  assert.ok(!keySvg({ label: "Approve", glyph: "approve", accent: "go" }).includes("99+"));
  assert.match(keySvg({ label: "Approve", glyph: "approve", accent: "go", count: 250 }), />99\+</);
});

test("what the action layer sends is a base64 SVG data URI", () => {
  const uri = keyImage({ label: "Git", glyph: "git", accent: "view" });
  assert.ok(uri.startsWith("data:image/svg+xml;base64,"), "hosts are known to take this form");
  const decoded = Buffer.from(uri.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8");
  assertWellFormed(decoded, "decoded data uri");
});

test("captions shrink to fit and never exceed the rule they sit on", () => {
  // 0.68em/char + 1.4 tracking is the measured advance for bold upper-case
  // sans; the longest label in the catalog has to land inside 100px.
  const widest = [...KEYS].sort((a, b) => b.label.length - a.label.length)[0]!;
  const size = fitFontSize(widest.label.toUpperCase(), 100, 15, 9);
  const width = widest.label.length * size * 0.68 + (widest.label.length - 1) * 1.4;
  assert.ok(width <= 100, `"${widest.label}" measures ${width.toFixed(1)}px at ${size}px`);
  assert.ok(size >= 9, "and is never shrunk below the legibility floor");
});

test("a short label keeps the full size", () => {
  assert.equal(fitFontSize("GIT", 100, 15, 9), 15);
});

test("every catalog entry names a glyph that exists", () => {
  for (const def of [...KEYS, ...DIALS]) {
    assert.ok(def.glyph in GLYPHS, `${def.id} refers to a missing glyph "${def.glyph}"`);
    assert.ok(def.accent in ACCENTS, `${def.id} refers to a missing accent "${def.accent}"`);
  }
});

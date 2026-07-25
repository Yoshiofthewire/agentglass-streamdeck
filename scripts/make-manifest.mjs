// Build the .sdPlugin manifest's `Actions` array from src/core/catalog.ts.
//
// The SDK refuses to register an action whose UUID isn't in the manifest, and
// with two dozen buttons a hand-maintained list is a list that drifts. Only
// `Actions` is generated; everything above it is the manifest's own header,
// kept here so the file stays readable as one document. Run:
//   node scripts/make-manifest.mjs
//
// Imports the catalog as TypeScript directly — Node ≥ 22.18 strips types on
// import, which is the same thing that lets `node --test` run the test suite
// without a build step.

import { writeFileSync } from "node:fs";

import { DIALS, KEYS, uuidOf } from "../src/core/catalog.ts";

const OUT = "com.agentglass.controller.sdPlugin/manifest.json";

const header = {
  $schema: "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
  Name: "agentglass",
  UUID: "com.agentglass.controller",
  Version: "0.3.0",
  Author: "Yoshiofthewire",
  Description:
    "Drive the agentglass cockpit from a Stream Deck — every view, panel and control on its own labelled key, with live approval and usage monitors.",
  Category: "agentglass",
  CategoryIcon: "imgs/plugin/category",
  Icon: "imgs/plugin/icon",
  URL: "https://github.com/Yoshiofthewire/agentglass-streamdeck",
  SDKVersion: 2,
  CodePath: "bin/plugin.js",
  Nodejs: { Version: "20" },
  Software: { MinimumVersion: "6.5" },
  OS: [
    { Platform: "mac", MinimumVersion: "12" },
    { Platform: "windows", MinimumVersion: "10" },
  ],
};

const keyAction = (def) => ({
  Name: def.name,
  UUID: uuidOf(def.id),
  Icon: `imgs/actions/${def.id}/icon`,
  Tooltip: def.tooltip,
  Controllers: ["Keypad"],
  PropertyInspectorPath: "ui/settings.html",
  // The label is drawn into the key image, so the deck's own title overlay
  // starts empty rather than repeating it in an unstyled font.
  States: [{ Image: `imgs/actions/${def.id}/icon`, TitleAlignment: "middle", Title: "" }],
});

const dialAction = (def) => ({
  Name: def.name,
  UUID: uuidOf(def.id),
  Icon: `imgs/actions/${def.id}/icon`,
  Tooltip: def.tooltip,
  Controllers: ["Encoder"],
  PropertyInspectorPath: "ui/settings.html",
  Encoder: { layout: "$B1", TriggerDescription: def.triggers },
  States: [{ Image: `imgs/actions/${def.id}/icon` }],
});

const manifest = { ...header, Actions: [...KEYS.map(keyAction), ...DIALS.map(dialAction)] };

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest written to ${OUT} — ${KEYS.length} keys, ${DIALS.length} dials`);

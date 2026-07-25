# agentglass-streamdeck

An **[OpenDeck](https://github.com/nekename/OpenDeck)** (and Elgato Stream Deck)
plugin that drives the [agentglass](https://github.com/SirAllap/agentglass)
cockpit from a Stream Deck — switch workspace views, approve or deny held tool
calls, drive the chat, and watch your plan usage, all on labelled keys.

Every control is its own action. You drag **View · Git** onto a key and it *is*
the git key — no inspector, no dropdown, no configuration. The only setting in
the whole plugin is where agentglass lives.

Keys are drawn at runtime in agentglass's own **Midnight Purple** palette, so
the deck and the cockpit read as one instrument: HUD brackets, a hairline grid,
a glyph and a caption on every key, and live graphs on the monitors.

> Needs agentglass with the control bridge (`POST /control`) for navigation, and
> its `chat` control command for **Chat · New session** / **Chat · Compact**.
> Approve/deny, the link monitor and the usage meters work against any version.

## Actions

### Views — open a workspace pane

| Key | What it does |
| --- | --- |
| **View · Git** | Status, branches, commits. |
| **View · Diff** | The working-tree diff. |
| **View · PRs** | Pull requests. |
| **View · Docker** | The docker panel. |
| **Launch · Terminal** | The cockpit terminal — a real shell in the workspace. |
| **View · Chat** | The chat panel. |

### Panels

**Panel · Stats**, **· Skills**, **· Search**, **· Help**, **· Palette** — each
opens its overlay.

### Navigation & chat

| Key | What it does |
| --- | --- |
| **Nav · Workspace** | Toggle the workspace overlay. |
| **Nav · Home** | Close whatever is open — the same peel as Escape. |
| **Chat · New session** | Start a new chat in the cockpit. |
| **Chat · Compact** | Send `/compact` to the open session. |

### Appearance

**Look · Theme next / prev**, **Look · Zoom in / out / reset**. The two theme
keys carry a direction chevron, because two keys that differ only in their
caption are two keys you press wrong.

### Approvals

| Key | What it does |
| --- | --- |
| **Gate · Approve** | Approves the selected held call. Goes amber and carries the pending count. |
| **Gate · Deny** | Denies it. Greys out when there is nothing to decide. |
| **Gate · Next / Previous** | Scrub the queue — the dial's job, without a dial. |

### Monitors

| Key | What it shows |
| --- | --- |
| **Monitor · 5-hour usage** | The Anthropic 5-hour window: level, an hour of trend, a segmented bar, and time to reset. |
| **Monitor · Weekly usage** | The same for the 7-day window. |
| **Monitor · Link** | Whether agentglass is reachable and whether anything is waiting. |

The meters sample `GET /usage` once a minute and keep the history in memory, so
the graph is a rolling hour. Pressing a meter forces a re-read. A failed sample
is skipped rather than charted as zero — a gap is not a drop in usage.

### Dials (Stream Deck +)

**Dial · Approvals** (turn to scrub, press to approve), **Dial · Theme**,
**Dial · Zoom** (press to reset).

**Every dial is a convenience, not a capability.** Each one's job is also on a
key, and a test enforces that — so a Stream Deck Mini, MK.2, XL or any OpenDeck
device without encoders loses nothing but the scrubbing feel.

## Build & install

Needs Node ≥ 22 (the build imports the TypeScript catalog directly) and OpenDeck.

```bash
npm install
npm run build     # manifest + icons + bundle
```

Then install `com.agentglass.controller.sdPlugin/` into OpenDeck — either via
**Install plugin from folder/file**, or by linking it in (Linux: typically
`~/.config/opendeck/plugins/`):

```bash
ln -s "$PWD/com.agentglass.controller.sdPlugin" ~/.config/opendeck/plugins/
```

Restart OpenDeck; the **agentglass** category appears in the action list.

> **OpenDeck launch note.** The bundle is a Node ESM file with a
> `#!/usr/bin/env node` shebang and the executable bit, launched via the
> manifest's `CodePath`. That runs as-is on OpenDeck on Linux (see Status). If
> your build doesn't run it directly, point `CodePath` at a `node` invocation
> per OpenDeck's plugin docs.

## Configure

Open any key's inspector and set **URL** (default `http://127.0.0.1:4000`) and,
only if the server runs with `AGENTGLASS_TOKEN`, a **token**. Both are global —
set them once and every key uses them.

## Develop

```bash
npm test         # node --test — pure logic and the whole render layer
npm run typecheck
npm run manifest # regenerate the manifest from the catalog
npm run build    # manifest + icons + rollup bundle
```

### How it fits together

```text
key ─▶ CatalogKeyAction ─▶ Action ─▶ service ─▶ dispatch ─▶ client ─▶ agentglass
         │                              ▲                                 │
         └── hud.ts (SVG) ◀── state ────┴──── /gate/pending + /usage ◀─────┘
```

- **`src/core/catalog.ts`** is the single source of truth. It lists every
  button; `scripts/make-manifest.mjs` builds the manifest from it,
  `scripts/make-icons.mjs` builds the action-list icons from it, and
  `src/plugin.ts` registers one action object per row. There is no second list
  to keep in step, and a test fails the build if the committed manifest drifts.
- **`src/render/`** draws the keys. Pure `(state) => SVG`, so the visual layer
  is unit-tested without a device — which matters, because a malformed SVG
  reaches hardware as a blank key with no error logged anywhere. The tests check
  every glyph and every key state for well-formedness.
- **`src/core` + `src/client.ts` + `src/service.ts`** — the queue state, the
  `Action`→request table, the fetch/WebSocket client, and the service tying them
  together. No SDK imports, so `node --test` runs them directly.
- **`src/actions/`** — the thin layer that meets the hardware.

### A note on "connected"

The deck's liveness signal is whether the **REST poll** is answering, not
whether the `/stream` socket is up. agentglass gates that socket harder than the
rest of its surface — it refuses a caller with no `Origin` header unless the
server is bound loopback-only, which is exactly this plugin against a LAN-bound
cockpit. A deck that trusted the socket would paint every key cold and dead
while all of them worked.

## Status

- 60 tests green: state, dispatch, client, service, the usage model, the render
  layer, and catalog/manifest consistency.
- Verified end-to-end against a stub OpenDeck and a stub agentglass: all 27 keys
  register and paint, navigation and chat commands reach `/control`, and
  scrub-then-approve decides the right gate.
- **Run on real hardware** — a FIFINE Ampligame D6 (15 keys, 3×5, no encoders)
  under OpenDeck on Linux, with no changes needed. `CodePath` launched the
  bundle directly, and the runtime-rendered SVG keys draw on a real panel. That
  device is also the dial-less case this plugin was shaped around, so the key
  equivalents for the dials are exercised rather than merely asserted by a test.
- **The three encoder actions are still untested on hardware** — the D6 has no
  dials, so nothing has yet driven `setFeedback` or the `$B1` touch-strip layout
  on a physical Stream Deck +. The keypad path does not depend on them.

## License

MIT — see [LICENSE](LICENSE).

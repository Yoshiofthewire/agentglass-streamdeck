# agentglass-streamdeck

An **[OpenDeck](https://github.com/nekename/OpenDeck)** (and Elgato Stream Deck)
plugin that drives the [agentglass](https://github.com/SirAllap/agentglass)
cockpit from a **Stream Deck +** — switch workspace views, approve or deny held
tool calls, and watch the fleet, all mapped to whatever keys and dials you like.

Unlike a fixed daemon, this is *programmable*: OpenDeck owns the device and gives
you a GUI, so you drag agentglass actions onto keys and dials and configure each
one. The plugin talks to a normal agentglass on `127.0.0.1:4000` — navigation
through `POST /control`, approvals through `POST /gate/decide`, and it watches
the live `/stream` socket so a pending approval lights the key the moment it lands.

> Needs agentglass with the control bridge (`POST /control`) — SirAllap/agentglass
> PR #237 — for the navigation actions. Approve/deny and the live count work
> against any version.

## Actions

Drop these onto keys and dials in OpenDeck; each is configured in its inspector.

| Action | Controller | What it does |
|---|---|---|
| **View** | key | Opens a workspace view — pick `git · diff · pr · docker · term · chat` in the inspector. |
| **Command** | key | A control command — toggle workspace, home/close, or open stats/skills/search/help/palette. |
| **Approve** | key | Approves the selected held tool call; the key lights red and shows the pending count. |
| **Deny** | key | Denies the selected held tool call. |
| **Gate dial** | dial | Turn to scrub the approval queue, press (or tap) to approve; the strip names the selected tool. |
| **Theme dial** | dial | Turn to cycle agentglass's themes. |
| **Zoom dial** | dial | Turn to zoom the UI, press to reset. |

The **agentglass URL + token** are shared (global) settings — set them once in
any action's inspector.

## Build & install

Needs Node ≥ 20 (for building) and OpenDeck installed with a Stream Deck +.

```bash
npm install
npm run build          # generates icons + bundles com.agentglass.controller.sdPlugin/bin/plugin.js
```

Then install the built `com.agentglass.controller.sdPlugin/` folder into OpenDeck
— either through OpenDeck's **Install plugin from folder/file**, or by linking it
into OpenDeck's plugins directory (Linux: typically `~/.config/opendeck/plugins/`):

```bash
ln -s "$PWD/com.agentglass.controller.sdPlugin" ~/.config/opendeck/plugins/
```

Restart OpenDeck; the **agentglass** category appears in the action list. Add
actions, set the server URL in an inspector, and you're driving the cockpit.

> **OpenDeck launch note.** The bundle is a Node ESM file with a
> `#!/usr/bin/env node` shebang and the executable bit, launched via the
> manifest's `CodePath`. If OpenDeck on your build doesn't run it directly,
> point `CodePath` at a `node` invocation per OpenDeck's plugin docs — this is
> the one integration detail that varies by OpenDeck version.

## Configure

Open any action's inspector and set **agentglass URL** (default
`http://127.0.0.1:4000`) and, only if the server runs with `AGENTGLASS_TOKEN`, a
**token**. Both are stored as global settings and used by every action.

## Develop

```bash
npm test         # node --test — pure logic (state, dispatch, client, service)
npm run typecheck
npm run build    # icons + rollup bundle
```

The code splits in two:

- **`src/core` + `src/client.ts` + `src/service.ts`** — pure logic, no SDK:
  the approval-queue state and selection, the `Action`→request table, the
  fetch/WebSocket client, and the service that ties them together. Covered by
  the test suite (`node --test`), which runs the TypeScript directly.
- **`src/actions/*` + `src/plugin.ts`** — the Stream Deck action classes and the
  entry point, bundled by rollup into the `.sdPlugin`. These use the
  `@elgato/streamdeck` runtime and are the layer that meets the hardware.

```
key/dial ─▶ action ─▶ Action ─▶ service ─▶ dispatch ─▶ AgentglassClient ─▶ agentglass
                                    ▲                                          │
                                    └──────── /gate/pending + /stream ◀────────┘
```

## Status

- The core (25 tests) and the build are green; the plugin bundles and loads.
- **Not yet verified on real hardware / a running OpenDeck** — the action wiring
  is written against the documented `@elgato/streamdeck` 2.x API and OpenDeck's
  plugin protocol. Running it on the deck is the remaining step; the encoder
  `setFeedback` layout and the `CodePath` launch are the most likely spots to
  need a small tweak.

## License

MIT — see [LICENSE](LICENSE).

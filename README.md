# agentglass-streamdeck

Drive the [agentglass](https://github.com/SirAllap/agentglass) cockpit from an
**Elgato Stream Deck +** — switch workspace views, approve or deny held tool
calls, and watch the fleet, without touching the keyboard.

It talks to a normal agentglass on `127.0.0.1:4000`: navigation goes through the
`POST /control` bridge, approvals through `POST /gate/decide`, and it watches the
live `/stream` socket so a pending approval lights the deck the moment it lands.

> Requires agentglass with the control bridge (`POST /control`) — agentglass
> **≥ the release that includes it** (SirAllap/agentglass PR #237). Approvals and
> monitoring work against any version.

## The layout

Stock mapping for the 8 keys, 4 dials and the touch strip:

```
┌──────┬──────┬──────┬──────┐
│ git  │ diff │  pr  │docker│      keys 1–4
├──────┼──────┼──────┼──────┤
│ term │ chat │ home │approve│     keys 5–8   (approve glows + counts when held)
└──────┴──────┴──────┴──────┘
  ◑ gate   ◑ theme   ◑ zoom   ◑ deck     ← touch strip (one zone per dial)
 turn:select turn:cycle turn:±  turn:dim
 push:deny   push: —   push:⊙  push:workspace
```

- **Keys 1–6** open the workspace on that view (`git · diff · pr · docker · term · chat`).
- **Key 7 — home**: back to the cockpit (Esc); tints amber when there are warnings.
- **Key 8 — approve**: approves the selected pending gate; fills red and shows the count while any tool call is held.
- **Dial 1 — gate**: turn to scrub the approval queue, push to **deny** the selected one.
- **Dial 2 — theme**: turn to cycle agentglass's 22 themes.
- **Dial 3 — zoom**: turn to zoom the UI, push to reset.
- **Dial 4 — deck**: turn to dim/brighten the deck (local), push to toggle the workspace overlay.

The deck dims itself after a quiet spell and wakes on the next event or approval.

## Install

Needs Python ≥ 3.11 and the Stream Deck HID backend (`libhidapi`).

```bash
# 1. udev rule so the deck is reachable without root
sudo cp udev/60-streamdeck.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
# unplug and replug the deck

# 2. install (pipx keeps it isolated; pip --user also works)
pipx install .        # or: pip install --user .

# 3. run
agentglass-streamdeck
```

If `hidapi` is missing at runtime, install your distro's `libhidapi` /
`hidapi` package (the Python `streamdeck` wheel binds to it).

## Configure

Everything has a sane default (a local agentglass, no token). To change any of
it, copy the example and edit:

```bash
mkdir -p ~/.config/agentglass-streamdeck
cp config.example.toml ~/.config/agentglass-streamdeck/config.toml
```

Key fields: `server`, `token` (only if you set `AGENTGLASS_TOKEN` on the
server), `brightness`, `poll_interval`, `idle_brightness`, `idle_after`.
`AGENTGLASS_SERVER` and `AGENTGLASS_TOKEN` in the environment override the file.

## Run at login

```bash
mkdir -p ~/.config/systemd/user
cp systemd/agentglass-streamdeck.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now agentglass-streamdeck
```

## Design

Two halves. The **pure logic** — `config`, `actions`, `layout`, `dispatch`,
`state`, `view` — imports only the standard library and is fully unit-tested
(`python -m unittest`), so "which button hits which endpoint" and "does approve
target the selected gate" are tests, not things you can only check on hardware.
The **IO / hardware** — `client` (HTTP + the `/stream` socket), `render`
(Pillow), `deck` (the device), `app` (the async controller) — is the thin layer
that carries those decisions to the network and the panel.

```
key/dial ─▶ layout ─▶ Action ─▶ dispatch ─▶ AgentglassClient ─▶ agentglass
                                    │                                │
   deck ◀── render ◀── view ◀── DeckState ◀────── /stream + polls ◀──┘
```

## Test

```bash
python -m unittest discover -s tests
```

No hardware, network, or third-party packages needed for the suite.

## License

MIT — see [LICENSE](LICENSE).

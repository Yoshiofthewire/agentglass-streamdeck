"""Drive the agentglass cockpit from an Elgato Stream Deck +.

The package splits cleanly in two:

* Pure logic — `config`, `actions`, `layout`, `state` — imports only the
  standard library and is covered by the test suite.
* IO / hardware — `client` (HTTP + the /stream socket), `render` (Pillow),
  `deck` (the physical device) — reached only at runtime.
"""

__version__ = "0.1.0"

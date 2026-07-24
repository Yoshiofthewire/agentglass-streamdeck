"""An intent, decoupled from both the hardware and the API.

`layout` turns a physical key/dial event into an `Action`; `client` turns an
`Action` into an agentglass call. Keeping the two apart is what lets the mapping
be tested without a deck and the API be tested without one either.

Kinds:
  view <id>          open the workspace on a view (via POST /control)
  workspace          toggle the workspace overlay
  esc                close panels / workspace
  open <what>        open a panel (stats/skills/search/help/palette)
  theme <±1>         step the theme list
  zoom <±1|0>        zoom in / out / reset
  approve            approve the selected pending gate (POST /gate/decide)
  deny               deny the selected pending gate
  gate_select <±1>   move the selection within the pending queue (local only)
  scope_select <±1>  move the project selection (local only)
  scope_apply        scope the cockpit to the selected project (POST /workspace)
  noop               nothing bound here
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Action:
    kind: str
    arg: str | int | None = None

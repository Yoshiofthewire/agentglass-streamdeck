"""Turn an `Action` into the agentglass request that carries it out — or None.

Pure, so the whole "which button hits which endpoint" table is testable without
a server. Navigation and appearance go to POST /control; approve/deny go to
POST /gate/decide against the *selected* pending gate; the local-only actions
(scrubbing the queue, dimming the deck) return None because they never leave the
daemon.
"""

from __future__ import annotations

from .actions import Action
from .state import DeckState, selected_gate

DENY_REASON = "denied from the Stream Deck"


def plan_request(action: Action, state: DeckState):
    """Return (method, path, body) or None if the action needs no HTTP call."""
    k = action.kind

    if k == "view":
        return ("POST", "/control", {"cmd": "view", "to": action.arg})
    if k == "workspace":
        return ("POST", "/control", {"cmd": "workspace"})
    if k == "esc":
        return ("POST", "/control", {"cmd": "esc"})
    if k == "open":
        return ("POST", "/control", {"cmd": "open", "what": action.arg})
    if k == "theme":
        return ("POST", "/control", {"cmd": "theme", "dir": action.arg})
    if k == "zoom":
        return ("POST", "/control", {"cmd": "zoom", "dir": action.arg})

    if k in ("approve", "deny"):
        gate = selected_gate(state)
        if gate is None:
            return None
        body = {"id": gate["id"], "decision": "allow" if k == "approve" else "deny"}
        if k == "deny":
            body["reason"] = DENY_REASON
        return ("POST", "/gate/decide", body)

    # gate_select, brightness, noop — handled locally, never sent.
    return None

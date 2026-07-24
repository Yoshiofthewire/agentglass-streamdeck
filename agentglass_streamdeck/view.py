"""Turn a DeckState into what each key and touch zone should say.

Pure: state in, display specs out, no PIL and no deck — so "does the approve key
light up when something is waiting" is a unit test, not something you can only
confirm by watching the hardware. `render` paints these specs; `deck` wires them
to the panel.
"""

from __future__ import annotations

from .layout import KEY_VIEWS
from .state import DeckState, selected_gate

ACCENT = (167, 139, 250)   # view keys / normal
WARN = (251, 191, 36)      # home when the fleet needs attention
DANGER = (244, 63, 94)     # a pending approval


def key_specs(state: DeckState) -> list:
    """One spec per physical key (8), each: title, subtitle, accent, emphasis."""
    specs = [
        {"title": v, "subtitle": "", "accent": ACCENT, "emphasis": False}
        for v in KEY_VIEWS
    ]

    # Key 6 — Home / Esc. Amber when there are derived warnings to notice.
    specs.append({
        "title": "home",
        "subtitle": "",
        "accent": WARN if state.insights else ACCENT,
        "emphasis": False,
    })

    # Key 7 — Approve. The one glanceable "something needs you": filled and
    # counted while any tool call is held.
    n = len(state.gates)
    specs.append({
        "title": "approve",
        "subtitle": str(n) if n else "",
        "accent": DANGER,
        "emphasis": n > 0,
    })
    return specs


def touch_cells(state: DeckState) -> list:
    """Four zones, one above each dial: the selected gate, then dial hints."""
    gate = selected_gate(state)
    if gate is not None:
        n = len(state.gates)
        gate_value = gate.get("tool_name", "?")
        if n > 1:
            gate_value = f"{gate_value} {state.selected + 1}/{n}"
        gate_accent = DANGER
    else:
        gate_value = "none"
        gate_accent = ACCENT

    return [
        {"title": "gate", "value": gate_value, "accent": gate_accent},
        {"title": "theme", "value": "▲▼", "accent": ACCENT},
        {"title": "zoom", "value": "± ⊙", "accent": ACCENT},
        {"title": "deck", "value": "dim ⌂", "accent": ACCENT},
    ]

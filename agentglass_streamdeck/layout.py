"""The default mapping from Stream Deck + inputs to `Action`s.

The Stream Deck + has 8 keys (2×4), 4 push-dials and a touch strip. The keys
carry navigation and the one action you reach for without looking (approve); the
dials carry the things that have a direction — scrubbing the approval queue,
cycling the theme, zooming, dimming the deck. Held in one place, as pure
functions, so the whole scheme is legible and testable at a glance.
"""

from __future__ import annotations

from .actions import Action

N_KEYS = 8
N_DIALS = 4

# Keys 0..5, in the dashboard rail's order.
KEY_VIEWS = ["git", "diff", "pr", "docker", "term", "chat"]

_NOOP = Action("noop")


def key_action(index: int) -> Action:
    if 0 <= index < len(KEY_VIEWS):
        return Action("view", KEY_VIEWS[index])
    if index == 6:
        return Action("esc")       # Home — back to the cockpit
    if index == 7:
        return Action("approve")   # the selected pending gate
    return _NOOP


def _sign(v: int) -> int:
    return (v > 0) - (v < 0)


def dial_action(index: int, event: str, value: int) -> Action:
    """`event` is "turn" (value = signed detents) or "push" (value ignored).

    Dial 0 scrubs the approval queue and denies (approve is key 7); dial 1
    cycles the theme; dial 2 zooms and resets; dial 3 dims the deck (local, no
    server) and toggles the workspace overlay.
    """
    if event == "turn":
        step = _sign(value)
        if step == 0:
            return _NOOP
        return {
            0: Action("gate_select", step),
            1: Action("theme", step),
            2: Action("zoom", step),
            3: Action("brightness", step),
        }.get(index, _NOOP)
    if event == "push":
        return {
            0: Action("deny"),
            1: _NOOP,
            2: Action("zoom", 0),
            3: Action("workspace"),
        }.get(index, _NOOP)
    return _NOOP

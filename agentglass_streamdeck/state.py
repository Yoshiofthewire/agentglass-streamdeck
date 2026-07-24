"""The daemon's model of the world, and pure reducers over it.

Everything the deck draws — the approval queue and which one is selected, the
live stats, whether the server is reachable — lives here. The reducers return
new states rather than mutating, so they are trivial to test and the render pass
always sees a consistent snapshot.

The one piece of real logic is selection tracking: when the pending queue is
re-read and an earlier request has been resolved elsewhere, the selection must
follow the request it was on, not the index — otherwise a dial you nudged a
second ago now points at someone else's tool call, and the approve key lands on
the wrong one.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace


@dataclass
class DeckState:
    gates: list = field(default_factory=list)
    selected: int = 0
    stats: dict | None = None
    insights: list = field(default_factory=list)
    connected: bool = False


def selected_gate(state: DeckState):
    if not state.gates:
        return None
    return state.gates[state.selected]


def set_gates(state: DeckState, gates) -> DeckState:
    gates = list(gates)
    if not gates:
        return replace(state, gates=gates, selected=0)

    cur = selected_gate(state)
    if cur is not None:
        cur_id = cur.get("id")
        for i, g in enumerate(gates):
            if g.get("id") == cur_id:
                return replace(state, gates=gates, selected=i)

    return replace(state, gates=gates, selected=min(state.selected, len(gates) - 1))


def select_gate(state: DeckState, delta: int) -> DeckState:
    n = len(state.gates)
    if n == 0:
        return replace(state, selected=0)
    return replace(state, selected=(state.selected + delta) % n)


def set_connected(state: DeckState, connected: bool) -> DeckState:
    return replace(state, connected=connected)


def set_stats(state: DeckState, stats: dict | None) -> DeckState:
    return replace(state, stats=stats)


def set_insights(state: DeckState, insights) -> DeckState:
    return replace(state, insights=list(insights))

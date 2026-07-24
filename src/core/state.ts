/**
 * The pending-approval queue and which one is selected, plus pure reducers.
 *
 * The one real bit of logic is selection tracking: when the queue is re-read and
 * an earlier request has been resolved elsewhere, the selection follows the
 * request it was on, not the index — otherwise the dial you nudged a second ago
 * now points at someone else's tool call and approve lands on the wrong one.
 */

export type Gate = {
  id: string;
  tool_name?: string;
  source_app?: string;
  [k: string]: unknown;
};

export type GateState = {
  gates: Gate[];
  selected: number;
};

export const emptyState = (): GateState => ({ gates: [], selected: 0 });

export function selectedGate(state: GateState): Gate | null {
  return state.gates.length ? state.gates[state.selected] : null;
}

export function setGates(state: GateState, gates: Gate[]): GateState {
  if (gates.length === 0) return { gates, selected: 0 };

  const current = selectedGate(state);
  if (current) {
    const i = gates.findIndex((g) => g.id === current.id);
    if (i >= 0) return { gates, selected: i };
  }
  return { gates, selected: Math.min(state.selected, gates.length - 1) };
}

export function selectGate(state: GateState, delta: number): GateState {
  const n = state.gates.length;
  if (n === 0) return { ...state, selected: 0 };
  return { ...state, selected: ((state.selected + delta) % n + n) % n };
}

import { test } from "node:test";
import assert from "node:assert/strict";

import { emptyState, setGates, selectGate, selectedGate } from "../src/core/state.ts";

const gate = (i: number) => ({ id: String(i), tool_name: `tool${i}`, source_app: "app" });

test("selectedGate is null when empty", () => {
  assert.equal(selectedGate(emptyState()), null);
});

test("selectedGate points at the selected index", () => {
  let s = setGates(emptyState(), [gate(0), gate(1), gate(2)]);
  s = selectGate(s, 1);
  assert.equal(selectedGate(s)!.id, "1");
});

test("setGates with an empty list resets selection", () => {
  const s = setGates({ gates: [], selected: 3 }, []);
  assert.equal(s.selected, 0);
  assert.deepEqual(s.gates, []);
});

test("setGates clamps an out-of-range selection", () => {
  const s = setGates({ gates: [], selected: 5 }, [gate(0), gate(1)]);
  assert.equal(s.selected, 1);
});

test("setGates keeps pointing at the same request when an earlier one resolves", () => {
  let s = setGates(emptyState(), [gate(0), gate(1), gate(2)]);
  s = selectGate(s, 1); // id "1"
  s = setGates(s, [gate(1), gate(2)]); // gate 0 gone
  assert.equal(selectedGate(s)!.id, "1");
  assert.equal(s.selected, 0);
});

test("setGates falls back to clamp when the selected request is gone", () => {
  let s = setGates(emptyState(), [gate(0), gate(1)]);
  s = selectGate(s, 1); // id "1"
  s = setGates(s, [gate(0)]); // gate 1 gone
  assert.equal(selectedGate(s)!.id, "0");
});

test("selectGate wraps forward past the end", () => {
  let s = setGates(emptyState(), [gate(0), gate(1)]);
  s = selectGate(s, 1);
  s = selectGate(s, 1);
  assert.equal(s.selected, 0);
});

test("selectGate wraps backward below zero", () => {
  let s = setGates(emptyState(), [gate(0), gate(1), gate(2)]);
  s = selectGate(s, -1);
  assert.equal(s.selected, 2);
});

test("selectGate on an empty queue never throws", () => {
  const s = selectGate(emptyState(), 1);
  assert.equal(s.selected, 0);
});

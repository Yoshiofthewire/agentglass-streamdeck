import { test } from "node:test";
import assert from "node:assert/strict";

import { HISTORY, applyUsage, emptyUsage, resetNote, windowOf } from "../src/core/usage.ts";

const at = (utilization: number) => ({ utilization, remaining: 100 - utilization, resets_at: null });

test("history grows in order, oldest first", () => {
  let s = emptyUsage();
  for (const v of [10, 20, 30]) s = applyUsage(s, { available: true, five_hour: at(v) });
  assert.deepEqual(s.history.five_hour, [10, 20, 30]);
});

test("history is capped, dropping the oldest samples", () => {
  let s = emptyUsage();
  for (let i = 0; i < HISTORY + 10; i++) s = applyUsage(s, { available: true, five_hour: at(i) });
  assert.equal(s.history.five_hour.length, HISTORY);
  assert.equal(s.history.five_hour[0], 10);
  assert.equal(s.history.five_hour[HISTORY - 1], HISTORY + 9);
});

test("an unavailable payload records nothing — a gap is not a drop to zero", () => {
  let s = applyUsage(emptyUsage(), { available: true, five_hour: at(42) });
  s = applyUsage(s, { available: false, error: "no credentials" });
  assert.deepEqual(s.history.five_hour, [42]);
  assert.equal(windowOf(s, "five_hour"), null, "an unavailable reading must not be reported as live");
});

test("a null payload (server unreachable) records nothing and keeps the last one", () => {
  const s = applyUsage(applyUsage(emptyUsage(), { available: true, seven_day: at(7) }), null);
  assert.deepEqual(s.history.seven_day, [7]);
  assert.equal(windowOf(s, "seven_day")!.utilization, 7);
});

test("a payload missing one window only advances the other", () => {
  let s = applyUsage(emptyUsage(), { available: true, five_hour: at(5), seven_day: at(50) });
  s = applyUsage(s, { available: true, five_hour: at(6) });
  assert.deepEqual(s.history.five_hour, [5, 6]);
  assert.deepEqual(s.history.seven_day, [50]);
});

test("resetNote is coarse: minutes, then hours, then days", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const inMs = (ms: number) => new Date(now + ms).toISOString();
  assert.equal(resetNote(inMs(9 * 60_000), now), "9m");
  assert.equal(resetNote(inMs(134 * 60_000), now), "2h");
  assert.equal(resetNote(inMs(3 * 24 * 3600_000), now), "3d");
  assert.equal(resetNote(inMs(-5000), now), "due");
});

test("resetNote says nothing rather than something wrong", () => {
  assert.equal(resetNote(null), "");
  assert.equal(resetNote(undefined), "");
  assert.equal(resetNote("not a date"), "");
});

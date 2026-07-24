import { test } from "node:test";
import assert from "node:assert/strict";

import { planRequest } from "../src/core/dispatch.ts";
import { emptyState, setGates, selectGate } from "../src/core/state.ts";

test("view hits the control bridge", () => {
  assert.deepEqual(planRequest({ kind: "view", view: "git" }, emptyState()), {
    method: "POST",
    path: "/control",
    body: { cmd: "view", to: "git" },
  });
});

test("workspace / esc / open / theme / zoom map to control commands", () => {
  const s = emptyState();
  assert.deepEqual(planRequest({ kind: "workspace" }, s)!.body, { cmd: "workspace" });
  assert.deepEqual(planRequest({ kind: "esc" }, s)!.body, { cmd: "esc" });
  assert.deepEqual(planRequest({ kind: "open", what: "stats" }, s)!.body, { cmd: "open", what: "stats" });
  assert.deepEqual(planRequest({ kind: "theme", dir: -1 }, s)!.body, { cmd: "theme", dir: -1 });
  assert.deepEqual(planRequest({ kind: "zoom", dir: 0 }, s)!.body, { cmd: "zoom", dir: 0 });
});

test("approve targets the selected gate", () => {
  let s = setGates(emptyState(), [{ id: "a" }, { id: "b" }]);
  s = selectGate(s, 1);
  const plan = planRequest({ kind: "approve" }, s)!;
  assert.deepEqual([plan.method, plan.path], ["POST", "/gate/decide"]);
  assert.equal(plan.body.id, "b");
  assert.equal(plan.body.decision, "allow");
});

test("deny targets the selected gate with a reason", () => {
  const s = setGates(emptyState(), [{ id: "a" }]);
  const plan = planRequest({ kind: "deny" }, s)!;
  assert.equal(plan.body.id, "a");
  assert.equal(plan.body.decision, "deny");
  assert.ok(plan.body.reason);
});

test("approve or deny with an empty queue is no request", () => {
  assert.equal(planRequest({ kind: "approve" }, emptyState()), null);
  assert.equal(planRequest({ kind: "deny" }, emptyState()), null);
});

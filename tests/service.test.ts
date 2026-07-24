import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentglassService, type AgentglassApi } from "../src/service.ts";
import type { Gate } from "../src/core/state.ts";

class FakeApi implements AgentglassApi {
  calls: { method: string; path: string; body?: unknown }[] = [];
  gates: Gate[] = [];
  async request(method: string, path: string, body?: unknown) {
    this.calls.push({ method, path, body });
    return { ok: true };
  }
  async pendingGates() {
    return this.gates;
  }
  connectStream() {
    return () => {};
  }
}

function svcWith(api: FakeApi) {
  const svc = new AgentglassService();
  svc.setApi(api);
  return svc;
}

test("refreshGates pulls the pending queue into state", async () => {
  const api = new FakeApi();
  api.gates = [{ id: "a", tool_name: "Bash" }, { id: "b", tool_name: "Write" }];
  const svc = svcWith(api);
  await svc.refreshGates();
  assert.equal(svc.pendingCount(), 2);
  assert.equal(svc.selectedGate()!.id, "a");
});

test("run(view) posts to the control bridge", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  await svc.run({ kind: "view", view: "git" });
  assert.deepEqual(api.calls[0], { method: "POST", path: "/control", body: { cmd: "view", to: "git" } });
});

test("run(approve) decides the selected gate then re-reads the queue", async () => {
  const api = new FakeApi();
  api.gates = [{ id: "a" }, { id: "b" }];
  const svc = svcWith(api);
  await svc.refreshGates();
  svc.selectGate(1); // selects "b"
  await svc.run({ kind: "approve" });
  const decide = api.calls.find((c) => c.path === "/gate/decide");
  assert.ok(decide, "expected a /gate/decide call");
  assert.equal((decide!.body as any).id, "b");
  assert.equal((decide!.body as any).decision, "allow");
});

test("run(approve) with an empty queue makes no call", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  await svc.run({ kind: "approve" });
  assert.equal(api.calls.length, 0);
});

test("selectGate notifies subscribers", async () => {
  const api = new FakeApi();
  api.gates = [{ id: "a" }, { id: "b" }];
  const svc = svcWith(api);
  await svc.refreshGates();
  let hits = 0;
  svc.subscribe(() => hits++);
  svc.selectGate(1);
  assert.ok(hits >= 1);
});

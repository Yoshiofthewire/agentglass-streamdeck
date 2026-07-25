import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentglassService, type AgentglassApi } from "../src/service.ts";
import type { Gate } from "../src/core/state.ts";
import type { UsagePayload } from "../src/core/usage.ts";

class FakeApi implements AgentglassApi {
  calls: { method: string; path: string; body?: unknown }[] = [];
  gates: Gate[] | null = [];
  usagePayload: UsagePayload | null = null;
  async request(method: string, path: string, body?: unknown) {
    this.calls.push({ method, path, body });
    return { ok: true };
  }
  async pendingGates() {
    return this.gates;
  }
  async usage() {
    return this.usagePayload;
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

test("run(chat) posts the chat control command", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  await svc.run({ kind: "chat", do: "compact" });
  assert.deepEqual(api.calls[0], { method: "POST", path: "/control", body: { cmd: "chat", do: "compact" } });
});

test("refreshUsage records both windows and grows their history", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  api.usagePayload = {
    available: true,
    five_hour: { utilization: 40, remaining: 60, resets_at: null },
    seven_day: { utilization: 12, remaining: 88, resets_at: null },
  };
  await svc.refreshUsage();
  api.usagePayload = {
    available: true,
    five_hour: { utilization: 55, remaining: 45, resets_at: null },
    seven_day: { utilization: 13, remaining: 87, resets_at: null },
  };
  await svc.refreshUsage();

  assert.equal(svc.usageWindow("five_hour")!.utilization, 55);
  assert.deepEqual(svc.usageHistory("five_hour"), [40, 55]);
  assert.deepEqual(svc.usageHistory("seven_day"), [12, 13]);
});

test("an unavailable usage reading leaves the graph alone", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  api.usagePayload = { available: true, five_hour: { utilization: 40, remaining: 60, resets_at: null } };
  await svc.refreshUsage();
  // A 429 or missing credentials must not be charted as "usage dropped to zero".
  api.usagePayload = { available: false, error: "HTTP 429" };
  await svc.refreshUsage();
  assert.deepEqual(svc.usageHistory("five_hour"), [40]);
  assert.equal(svc.usageWindow("five_hour"), null);
});

test("reachability follows the REST poll, not the stream socket", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  assert.equal(svc.isConnected(), false, "nothing has been polled yet");

  api.gates = [];
  await svc.refreshGates();
  // An empty queue from a server that answered is still a reachable server —
  // this is the case that made the whole deck paint cold when the /stream
  // socket was the signal.
  assert.equal(svc.isConnected(), true);

  api.gates = null;
  await svc.refreshGates();
  assert.equal(svc.isConnected(), false);
});

test("a failed poll keeps the queue rather than reporting it resolved", async () => {
  const api = new FakeApi();
  const svc = svcWith(api);
  api.gates = [{ id: "a" }, { id: "b" }];
  await svc.refreshGates();

  api.gates = null;
  await svc.refreshGates();
  assert.equal(svc.pendingCount(), 2, "losing the server must not look like both calls were approved");
  assert.equal(svc.selectedGate()!.id, "a");
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

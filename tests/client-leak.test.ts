import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";

import { AgentglassService, type AgentglassApi } from "../src/service.ts";
import { AgentglassClient } from "../src/client.ts";
import type { Gate } from "../src/core/state.ts";
import type { UsagePayload } from "../src/core/usage.ts";

/*
 * A server that stops answering must not cost the plugin a socket per attempt.
 *
 * Found on a live machine rather than in review: this plugin held 2702
 * established connections to agentglass and 3620 open file descriptors after
 * four hours. The server it was polling spent 42 and then 102 seconds with its
 * event loop blocked, answered /health anywhere between 0.09s and 10s, and the
 * dashboard drew "Wrong server" over an empty cockpit — its own health probe
 * could not be answered inside 2.5s.
 *
 * It fed back on itself. A server accepts TCP out of the kernel's backlog even
 * while its event loop is blocked, so every one of those connections was
 * accepted and queued and made the server slower, which timed more polls out,
 * which opened more connections.
 *
 * The cause was concurrency, not a per-request leak: an aborted `fetch` does
 * return its socket, just several seconds later. Nothing stopped a new request
 * starting while the last was still waiting out its 5s timeout — the poll timer
 * fired regardless, and `nudge()` fired every 250ms on a busy event stream,
 * which is up to twenty overlapping requests before the first one gives up.
 * `nudge` even documented "at most one in flight"; nothing implemented it.
 */

/** A server that accepts connections and never answers, counting what it holds. */
function deafServer(): Promise<{ server: Server; port: number; live: () => number; release: () => void }> {
  let open = 0;
  const held: ServerResponse[] = [];
  const server = createServer((_req, res) => { held.push(res); });
  server.on("connection", (s) => { open++; s.on("close", () => { open--; }); });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        port: (server.address() as { port: number }).port,
        live: () => open,
        release: () => { for (const r of held) { try { r.destroy(); } catch { /* already gone */ } } },
      });
    });
  });
}

test("a deaf server costs one socket, however often it is polled", async () => {
  const { server, port, live, release } = await deafServer();
  const svc = new AgentglassService();
  svc.setApi(new AgentglassClient({ server: `http://127.0.0.1:${port}` }));
  try {
    // Twenty overlapping refreshes: what a busy agent's event stream produced,
    // one nudge every 250ms against a five-second timeout.
    const flood = Array.from({ length: 20 }, () => svc.refreshGates());
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(live() <= 1, `${live()} sockets open — each poll opened its own`);
    release();
    await Promise.allSettled(flood);
  } finally {
    server.close();
  }
});

/** Counts how many polls actually reached the transport. */
class CountingApi implements AgentglassApi {
  inFlight = 0;
  peak = 0;
  starts = 0;
  private release!: () => void;
  readonly gate = new Promise<void>((r) => { this.release = r; });
  async request() { return { ok: true }; }
  async pendingGates(): Promise<Gate[] | null> {
    this.starts++;
    this.inFlight++;
    this.peak = Math.max(this.peak, this.inFlight);
    await this.gate;
    this.inFlight--;
    return [];
  }
  async usage(): Promise<UsagePayload | null> {
    this.inFlight++;
    this.peak = Math.max(this.peak, this.inFlight);
    await this.gate;
    this.inFlight--;
    return null;
  }
  connectStream() { return () => {}; }
  finish() { this.release(); }
}

test("a slow poll is not joined by the next one", async () => {
  const api = new CountingApi();
  const svc = new AgentglassService();
  svc.setApi(api);
  const many = Array.from({ length: 10 }, () => svc.refreshGates());
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(api.peak, 1, `${api.peak} gate polls overlapped`);
  assert.equal(api.starts, 1, `${api.starts} gate polls started for one slow request`);
  api.finish();
  await Promise.allSettled(many);
});

test("usage polls are single-flighted too", async () => {
  const api = new CountingApi();
  const svc = new AgentglassService();
  svc.setApi(api);
  const many = Array.from({ length: 10 }, () => svc.refreshUsage());
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(api.peak, 1, `${api.peak} usage polls overlapped`);
  api.finish();
  await Promise.allSettled(many);
});

test("the guard clears, so polling resumes after one finishes", async () => {
  // A latch that never reopened would be worse than the leak: the deck would
  // silently stop updating after the first slow poll.
  const api = new CountingApi();
  const svc = new AgentglassService();
  svc.setApi(api);
  const first = svc.refreshGates();
  api.finish();
  await first;
  await svc.refreshGates();
  assert.equal(api.starts, 2, "the second poll never ran");
});

/*
 * The other half of the storm, and the one that made it exponential.
 *
 * Every handler used to close over `ws`, which is reassigned on each reconnect.
 * A superseded socket erroring — routine when a server has stopped answering and
 * several attempts are outstanding — therefore closed the *current* socket
 * rather than itself, and that close scheduled another reconnect. One failure
 * became two chains, then four. Live, it reached 5783 sockets in SYN-SENT
 * against an accept queue that was already full.
 */
test("a superseded socket cannot restart the reconnect chain", async () => {
  const made: FakeSocket[] = [];
  class FakeSocket {
    onopen: (() => void) | null = null;
    onmessage: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    url: string;
    constructor(url: string) { this.url = url; made.push(this); }
    close() { this.closed = true; this.onclose?.(); }
  }
  const realWs = (globalThis as any).WebSocket;
  (globalThis as any).WebSocket = FakeSocket;
  try {
    const api = new AgentglassClient({ server: "http://127.0.0.1:1" });
    const stop = api.connectStream(() => {}, () => {});
    assert.equal(made.length, 1, "one socket to begin with");

    // The first attempt fails and schedules a retry.
    made[0].close();
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(made.length, 2, "one retry, not several");

    // Now the dead first socket errors, late, as a real one does. It must close
    // itself and nothing else — the live socket keeps running.
    made[0].onerror?.();
    await new Promise((r) => setTimeout(r, 700));
    assert.ok(!made[1].closed, "the live socket was closed by its predecessor");
    assert.equal(made.length, 2, `the chain forked: ${made.length} sockets`);
    stop();
  } finally {
    (globalThis as any).WebSocket = realWs;
  }
});

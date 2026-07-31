import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentglassClient } from "../src/client.ts";
import { AgentglassService, type AgentglassApi } from "../src/service.ts";

/*
 * Constructing the socket is the one step in this transport that throws rather
 * than reporting, and both of its throws used to be fatal to the whole plugin.
 *
 * `new WebSocket` throws synchronously — not an error event — on a URL it
 * cannot parse, and throws a bare ReferenceError when the runtime has no such
 * global. Node 20 has none, and Node 20 is exactly what the manifest asks the
 * host for (`Nodejs.Version`). Either throw travelled out of connectStream, out
 * of service.start(), and off the top level of plugin.ts, where monitor.start()
 * on the following line then never ran — so a mistyped server address, or a
 * correct one on the declared runtime, killed the four machine meters that have
 * nothing to do with agentglass at all.
 *
 * These tests are about the deck staying up, not about the stream working. The
 * stream is an optimisation; the REST poll in service.ts is what drives the
 * deck, which is why giving up on the socket is an acceptable answer and
 * crashing is not.
 */

/** Run `fn` with `globalThis.WebSocket` replaced, then put it back. */
async function withWebSocket(replacement: unknown, fn: () => void | Promise<void>): Promise<void> {
  const real = (globalThis as any).WebSocket;
  (globalThis as any).WebSocket = replacement;
  try {
    await fn();
  } finally {
    (globalThis as any).WebSocket = real;
  }
}

test("a runtime with no WebSocket costs the stream, not the plugin", async () => {
  await withWebSocket(undefined, () => {
    const api = new AgentglassClient({ server: "http://127.0.0.1:1" });
    let connected: boolean | null = null;
    // The throw here was a ReferenceError, which is indistinguishable from a
    // typo at the call site and just as fatal.
    const stop = api.connectStream(
      () => {},
      (c) => { connected = c; },
    );
    assert.equal(typeof stop, "function", "connectStream must still return a stop function");
    assert.equal(connected, false, "the deck should be told the stream is not up");
    assert.doesNotThrow(() => stop(), "stopping a stream that never opened must be safe");
  });
});

test("a server address the constructor rejects costs the stream, not the plugin", async () => {
  // A URL that survives buildWsUrl's scheme default but that the constructor
  // still refuses — the class of input that cannot be fixed by retrying.
  class Rejecting {
    constructor() {
      throw new SyntaxError("Invalid URL");
    }
  }
  await withWebSocket(Rejecting, () => {
    const api = new AgentglassClient({ server: "http://[bad" });
    assert.doesNotThrow(() => {
      const stop = api.connectStream(() => {}, () => {});
      stop();
    });
  });
});

test("service.start survives a stream that cannot open, and still polls", async () => {
  await withWebSocket(undefined, async () => {
    const svc = new AgentglassService();
    let polls = 0;
    const api: AgentglassApi = {
      async request() { return { ok: true }; },
      async pendingGates() { polls++; return []; },
      async usage() { return null; },
      // The real client, so the missing global is exercised through the code
      // path plugin.ts actually takes rather than a stub that cannot fail.
      connectStream: (onFrame, onConnected) =>
        new AgentglassClient({ server: "http://127.0.0.1:1" }).connectStream(onFrame, onConnected),
    };
    svc.setApi(api);
    assert.doesNotThrow(() => svc.start(50, 50_000));
    await new Promise((r) => setTimeout(r, 20));
    svc.stop();
    assert.ok(polls > 0, "the REST poll is what drives the deck and must have run");
  });
});

/*
 * start() reassigning a live timer handle orphans that interval permanently:
 * stop() can only clear the handle it can still see. monitor.start() has always
 * guarded against this; service.start() did not, and the only thing preventing
 * a doubled poll rate was plugin.ts happening to call start() exactly once.
 */
test("start is idempotent, so a second call cannot orphan a timer", async () => {
  const svc = new AgentglassService();
  let polls = 0;
  svc.setApi({
    async request() { return { ok: true }; },
    async pendingGates() { polls++; return []; },
    async usage() { return null; },
    connectStream: () => () => {},
  });

  svc.start(20, 50_000);
  svc.start(20, 50_000); // the call that used to double the rate forever
  await new Promise((r) => setTimeout(r, 120));
  svc.stop();

  const afterStop = polls;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(polls, afterStop, `stop() left ${polls - afterStop} orphaned polls running`);
});

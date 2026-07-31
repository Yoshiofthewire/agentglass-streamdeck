/**
 * Transport to agentglass: REST via global `fetch`, the live feed via the global
 * `WebSocket`, so the plugin ships no HTTP deps.
 *
 * Those two globals do NOT arrive together, and this file used to claim they
 * did. `fetch` is unflagged from Node 18; `WebSocket` only from Node 22.4, and
 * the manifest asks the host for Node 20 (`Nodejs.Version`), which has no such
 * global at all. So the socket is treated as an optimisation that may simply
 * not exist here — see connectStream. The deck is driven by the REST poll in
 * service.ts and stays fully usable without a stream; all the stream buys is
 * an approval lighting up the moment it lands instead of up to a poll later.
 *
 * That is also why this ran fine on the author's desk and would not have on an
 * Elgato host: OpenDeck launches the bundle through its `#!/usr/bin/env node`
 * shebang, so it inherits whatever system Node is installed, while an Elgato
 * host honours the manifest and hands it Node 20.
 *
 * Auth mirrors agentglass's own client — a bearer header on REST, `?token=` on
 * the socket (the WHATWG WebSocket constructor takes no headers). Everything is
 * failure-tolerant: a down server yields null / a dropped socket that
 * reconnects, never a throw, because the deck must keep working regardless.
 */

import type { Gate } from "./core/state.ts";
import type { UsagePayload } from "./core/usage.ts";

export function buildHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token) h["authorization"] = `Bearer ${token}`;
  return h;
}

/**
 * The `/stream` URL for a server address as somebody actually typed it.
 *
 * The scheme-less branch is the whole reason this has a default. There was no
 * `else`, so `localhost:4000` passed through untouched and produced
 * `localhost:4000/stream` — which `new WebSocket` rejects by *throwing*, not by
 * firing an error event. That throw took the entire plugin down (see
 * connectStream), including the four machine meters that have nothing to do
 * with agentglass. `host:port` is what everyone types for a local server, so
 * this assumes the plain scheme rather than treating it as a user error.
 */
export function buildWsUrl(server: string, token?: string): string {
  let base = server.trim().replace(/\/+$/, "");
  if (base.startsWith("https://")) base = "wss://" + base.slice("https://".length);
  else if (base.startsWith("http://")) base = "ws://" + base.slice("http://".length);
  else if (!/^wss?:\/\//i.test(base)) base = "ws://" + base;
  let url = `${base}/stream`;
  if (token) url += `?token=${encodeURIComponent(token)}`;
  return url;
}

export type ClientConfig = { server: string; token?: string };

export class AgentglassClient {
  private readonly cfg: ClientConfig;

  constructor(cfg: ClientConfig) {
    this.cfg = cfg;
  }

  private base(): string {
    return this.cfg.server.replace(/\/+$/, "");
  }

  async request(method: string, path: string, body?: unknown): Promise<any | null> {
    try {
      const res = await fetch(this.base() + path, {
        method,
        headers: buildHeaders(this.cfg.token),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return null;
    }
  }

  /**
   * The approval queue, or null if the server could not be reached.
   *
   * The distinction matters: an empty array means "nothing is waiting on you"
   * and null means "we don't know". Collapsing both to `[]` is what would let
   * a dead server render as a calm, idle deck.
   */
  async pendingGates(): Promise<Gate[] | null> {
    const data = await this.request("GET", "/gate/pending");
    if (!data) return null;
    return Array.isArray(data.gates) ? (data.gates as Gate[]) : [];
  }

  /**
   * The Anthropic plan windows, or null if this server can't tell us.
   *
   * The server caches these for five minutes and backs off hard on a 429 — the
   * upstream endpoint is rate-limited and shared with Claude Code itself — so
   * polling it more often than that costs nothing and gains nothing. The deck
   * samples on its own slower schedule regardless; see core/usage.ts.
   */
  async usage(): Promise<UsagePayload | null> {
    const data = await this.request("GET", "/usage");
    return data && typeof data === "object" ? (data as UsagePayload) : null;
  }

  /**
   * Consume /stream, reconnecting with capped backoff. Returns a stop function.
   * `onFrame` for each frame; `onConnected` on every open/close so the deck can
   * show a live-vs-stale badge.
   */
  connectStream(onFrame: (frame: any) => void, onConnected: (connected: boolean) => void): () => void {
    let stopped = false;
    let ws: WebSocket | null = null;
    let backoff = 500;

    /*
     * Every handler talks about *its own* socket, never the outer `ws`.
     *
     * They used to close over `ws`, which is reassigned on every reconnect. So
     * a superseded socket erroring — which is exactly what happens when a
     * server stops answering and several attempts are outstanding — closed the
     * *current* socket instead of itself. That close scheduled another
     * reconnect, and since the same thing then happened to that one, one failure
     * became two chains, then four. On a live machine it reached 5783 sockets in
     * SYN-SENT against a server whose accept queue was already full.
     *
     * The `ws !== sock` guard is the other half: only the socket that is still
     * the current one may schedule a reconnect or report the connection down. A
     * dead predecessor has nothing to say about either.
     */
    const open = () => {
      if (stopped) return;
      /*
       * Constructing the socket is the one step here that throws rather than
       * reporting, and both of its throws used to be fatal to the whole plugin.
       *
       * `new WebSocket` throws synchronously on a URL it cannot parse, and it
       * is a bare ReferenceError when the runtime has no such global — Node 20,
       * which is what the manifest asks the host for. Either one propagated out
       * of `connectStream`, out of `service.start()`, and off the top level of
       * plugin.ts, where `monitor.start()` on the following line then never
       * ran: one mistyped server address and the CPU meter died along with the
       * cockpit it has nothing to do with.
       *
       * Neither failure is transient — the URL will not re-parse and the global
       * will not appear — so this gives up on the stream rather than retrying
       * into a spin. Giving up costs nothing structural: the REST poll in
       * service.ts is what drives the deck and what `reachable` is computed
       * from, and the stream only buys an approval lighting up a poll sooner.
       */
      let sock: WebSocket;
      try {
        sock = new WebSocket(buildWsUrl(this.cfg.server, this.cfg.token));
      } catch {
        onConnected(false);
        return;
      }
      ws = sock;
      sock.onopen = () => {
        if (ws !== sock) return;
        backoff = 500;
        onConnected(true);
      };
      sock.onmessage = (ev: MessageEvent) => {
        if (ws !== sock) return;
        try {
          onFrame(JSON.parse(String(ev.data)));
        } catch {
          /* a non-JSON frame is not ours */
        }
      };
      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* already gone */
        }
      };
      sock.onclose = () => {
        // A socket that has already been replaced must not restart the chain,
        // or every stale failure forks a new one.
        if (ws !== sock) return;
        onConnected(false);
        if (stopped) return;
        setTimeout(open, backoff);
        backoff = Math.min(8000, backoff * 2);
      };
    };

    open();
    return () => {
      stopped = true;
      try {
        ws?.close();
      } catch {
        /* already gone */
      }
    };
  }
}

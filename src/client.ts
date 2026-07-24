/**
 * Transport to agentglass: REST via global `fetch`, the live feed via the global
 * `WebSocket` (both built into Node ≥ 22), so the plugin ships no HTTP deps.
 *
 * Auth mirrors agentglass's own client — a bearer header on REST, `?token=` on
 * the socket (a WS upgrade can't carry a header). Everything is failure-tolerant:
 * a down server yields null / a dropped socket that reconnects, never a throw,
 * because the deck must keep working regardless.
 */

import type { Gate } from "./core/state.ts";

export function buildHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token) h["authorization"] = `Bearer ${token}`;
  return h;
}

export function buildWsUrl(server: string, token?: string): string {
  let base = server.replace(/\/+$/, "");
  if (base.startsWith("https://")) base = "wss://" + base.slice("https://".length);
  else if (base.startsWith("http://")) base = "ws://" + base.slice("http://".length);
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

  async pendingGates(): Promise<Gate[]> {
    const data = await this.request("GET", "/gate/pending");
    return data && Array.isArray(data.gates) ? (data.gates as Gate[]) : [];
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

    const open = () => {
      if (stopped) return;
      ws = new WebSocket(buildWsUrl(this.cfg.server, this.cfg.token));
      ws.onopen = () => {
        backoff = 500;
        onConnected(true);
      };
      ws.onmessage = (ev: MessageEvent) => {
        try {
          onFrame(JSON.parse(String(ev.data)));
        } catch {
          /* a non-JSON frame is not ours */
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* already gone */
        }
      };
      ws.onclose = () => {
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

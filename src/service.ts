/**
 * The shared brain behind every action: one agentglass connection, one copy of
 * the approval queue, and the glue that keeps them in step.
 *
 * The Stream Deck action classes are thin — they translate a key/dial event into
 * an `Action` or a selection nudge and call in here; this holds the live state
 * and notifies them back when it changes so they can repaint. It depends on an
 * `AgentglassApi` interface (not the concrete client) so the orchestration is
 * unit-tested with a fake, and it imports no SDK, so it stays strip-only clean.
 */

import { AgentglassClient, type ClientConfig } from "./client.ts";
import type { Action } from "./core/model.ts";
import { planRequest } from "./core/dispatch.ts";
import { type Gate, type GateState, emptyState, selectGate, selectedGate, setGates } from "./core/state.ts";

export interface AgentglassApi {
  request(method: string, path: string, body?: unknown): Promise<any | null>;
  pendingGates(): Promise<Gate[]>;
  connectStream(onFrame: (frame: any) => void, onConnected: (connected: boolean) => void): () => void;
}

export type Listener = () => void;

const DEFAULT_POLL_MS = 2000;

export class AgentglassService {
  private api: AgentglassApi | null = null;
  private state: GateState = emptyState();
  private connected = false;
  private readonly listeners = new Set<Listener>();
  private stopStream: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Point the service at a server; rebuilds the connection if it is running. */
  configure(cfg: ClientConfig): void {
    const wasLive = this.pollTimer !== null;
    this.stop();
    this.setApi(new AgentglassClient(cfg));
    if (wasLive) this.start();
  }

  /** Inject the API directly — used by configure() and by tests with a fake. */
  setApi(api: AgentglassApi): void {
    this.api = api;
  }

  // --- reads (for the action visuals) ------------------------------------

  pendingCount(): number {
    return this.state.gates.length;
  }

  selectedGate(): Gate | null {
    return selectedGate(this.state);
  }

  /** Index of the selected gate within the queue (0 when empty). */
  selectedIndex(): number {
    return this.state.gates.length ? this.state.selected : 0;
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* one bad listener must not stop the rest */
      }
    }
  }

  // --- commands ----------------------------------------------------------

  async run(action: Action): Promise<void> {
    const plan = planRequest(action, this.state);
    if (!plan || !this.api) return;
    await this.api.request(plan.method, plan.path, plan.body);
    if (action.kind === "approve" || action.kind === "deny") {
      // The queue just changed — re-read so the deck reflects it now, not at
      // the next poll.
      await this.refreshGates();
    }
  }

  selectGate(delta: number): void {
    this.state = selectGate(this.state, delta);
    this.notify();
  }

  async refreshGates(): Promise<void> {
    if (!this.api) return;
    const gates = await this.api.pendingGates();
    this.state = setGates(this.state, gates);
    this.notify();
  }

  // --- lifecycle ---------------------------------------------------------

  start(pollMs: number = DEFAULT_POLL_MS): void {
    if (!this.api) return;
    void this.refreshGates();
    this.pollTimer = setInterval(() => void this.refreshGates(), pollMs);
    this.stopStream = this.api.connectStream(
      () => {
        /* frames just keep us live; gate arrivals are caught by the poll */
      },
      (connected) => {
        this.connected = connected;
        this.notify();
      },
    );
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.stopStream) {
      this.stopStream();
      this.stopStream = null;
    }
  }
}

/** One service for the whole plugin process. */
export const service = new AgentglassService();

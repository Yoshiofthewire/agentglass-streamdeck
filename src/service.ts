/**
 * The shared brain behind every action: one agentglass connection, one copy of
 * the approval queue, one copy of the usage meters, and the glue that keeps
 * them in step.
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
import {
  type UsagePayload,
  type UsageState,
  type UsageWindow,
  type WindowId,
  applyUsage,
  emptyUsage,
  windowOf,
} from "./core/usage.ts";

export interface AgentglassApi {
  request(method: string, path: string, body?: unknown): Promise<any | null>;
  /** null means the server could not be reached — distinct from an empty queue. */
  pendingGates(): Promise<Gate[] | null>;
  usage(): Promise<UsagePayload | null>;
  connectStream(onFrame: (frame: any) => void, onConnected: (connected: boolean) => void): () => void;
}

export type Listener = () => void;

const DEFAULT_POLL_MS = 2000;
/**
 * One usage sample a minute.
 *
 * Slower than the gate poll by design. The server caches the reading for five
 * minutes and the upstream endpoint is rate-limited, so a faster poll would
 * mostly re-read the same cached number; slower than a minute and the graph
 * stops being a trend. It also sets the graph's span — see HISTORY.
 */
const DEFAULT_USAGE_MS = 60_000;

export class AgentglassService {
  private api: AgentglassApi | null = null;
  private state: GateState = emptyState();
  private usageState: UsageState = emptyUsage();
  /**
   * Whether the last REST poll got an answer.
   *
   * This — not the /stream socket — is what "connected" means to the deck,
   * because REST is what every key actually uses. agentglass gates the socket
   * harder than the rest of its surface (it refuses a caller with no Origin
   * header unless the server is bound loopback-only, which is precisely this
   * plugin against a LAN-bound cockpit), so a deck that took the socket as
   * its liveness signal would paint every key cold and dead while all of them
   * worked perfectly.
   */
  private reachable = false;
  private readonly listeners = new Set<Listener>();
  private stopStream: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private usageTimer: ReturnType<typeof setInterval> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;

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
    return this.reachable;
  }

  usageWindow(id: WindowId): UsageWindow | null {
    return windowOf(this.usageState, id);
  }

  usageHistory(id: WindowId): number[] {
    return this.usageState.history[id];
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
    // A failed poll leaves the queue standing rather than clearing it. The keys
    // grey out because `reachable` went false, which says "we've lost the
    // cockpit" — emptying the queue would instead say "everything was
    // resolved", and that is a different, wrong thing to tell someone.
    this.reachable = gates !== null;
    if (gates !== null) this.state = setGates(this.state, gates);
    this.notify();
  }

  async refreshUsage(): Promise<void> {
    if (!this.api) return;
    this.usageState = applyUsage(this.usageState, await this.api.usage());
    this.notify();
  }

  // --- lifecycle ---------------------------------------------------------

  start(pollMs: number = DEFAULT_POLL_MS, usageMs: number = DEFAULT_USAGE_MS): void {
    if (!this.api) return;
    void this.refreshGates();
    void this.refreshUsage();
    this.pollTimer = setInterval(() => void this.refreshGates(), pollMs);
    this.usageTimer = setInterval(() => void this.refreshUsage(), usageMs);
    this.stopStream = this.api.connectStream(
      // A frame means something happened in the cockpit — most usefully, a tool
      // call being held. Re-reading on it is what lets an approval light the key
      // as it lands instead of up to a poll later. Coalesced, because a busy
      // agent emits far more frames than the queue changes, and this must not
      // turn a burst of events into a burst of HTTP.
      () => this.nudge(),
      () => {
        /* the socket's own up/down is not the deck's liveness signal — see `reachable` */
      },
    );
  }

  /** Coalesced gate re-read: at most one in flight, at most one queued. */
  private nudge(): void {
    if (this.nudgeTimer !== null) return;
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      void this.refreshGates();
    }, 250);
  }

  stop(): void {
    for (const t of [this.pollTimer, this.usageTimer]) if (t !== null) clearInterval(t);
    this.pollTimer = null;
    this.usageTimer = null;
    if (this.nudgeTimer !== null) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = null;
    if (this.stopStream) {
      this.stopStream();
      this.stopStream = null;
    }
  }
}

/** One service for the whole plugin process. */
export const service = new AgentglassService();

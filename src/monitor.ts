/**
 * The machine meters' shared brain: one sampler, one copy of the readings and
 * their history, and the notification that repaints the keys — the same shape
 * as service.ts, for the same reasons.
 *
 * Deliberately *not* part of AgentglassService. These four keys read the
 * computer the plugin is running on, so they have to stay live when the cockpit
 * is unreachable: a CPU meter that greys out because a web server went down is
 * lying about the CPU. Keeping them on their own object with their own clock is
 * what makes that structural rather than a rule someone has to remember while
 * editing the offline path.
 */

import { type MetricId, type Reading, type SystemState, applySample, emptySystem } from "./core/system.ts";
import { type Probe, createProbe } from "./probe.ts";

/**
 * 3 seconds.
 *
 * Fast enough that a compile is a visible hump while it is still running, slow
 * enough that the sampling doesn't register in the number it reports. With the
 * 30-sample history that makes each graph 90 seconds wide.
 */
const DEFAULT_TICK_MS = 3000;

/**
 * Every fifth tick — 15 seconds — for the probes that cost a process spawn.
 *
 * Both of those readings are slow-moving in practice (a battery moves a point
 * every few minutes; an NVIDIA card under a sustained load is not doing
 * anything different at 3s resolution than at 15s), so this trades detail
 * nobody would read for a plugin that stays out of its own graph.
 */
const SLOW_EVERY = 5;

export class SystemMonitor {
  private state: SystemState = emptySystem();
  private probe: Probe = createProbe();
  private ticks = 0;
  /** A spawn can outlive its tick; overlapping samples would queue processes. */
  private sampling = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();

  /** Inject a sampler — used by the tests, which have no machine to read. */
  setProbe(probe: Probe): void {
    this.probe = probe;
  }

  reading(id: MetricId): Reading {
    return this.state.readings[id];
  }

  history(id: MetricId): number[] {
    return this.state.history[id];
  }

  subscribe(fn: () => void): () => void {
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

  /**
   * Take one sample. `slow` forces the spawning probes to run — that is what a
   * key press means, and it is why pressing a meter is worth doing.
   */
  async refresh(slow?: boolean): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    const wanted = slow ?? this.ticks % SLOW_EVERY === 0;
    this.ticks++;
    try {
      this.state = applySample(this.state, await this.probe(wanted));
    } catch {
      // A probe that throws must not stop the clock; the keys keep their last
      // readings and the next tick tries again.
    } finally {
      this.sampling = false;
    }
    this.notify();
  }

  start(tickMs: number = DEFAULT_TICK_MS): void {
    if (this.timer !== null) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), tickMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}

/** One monitor for the whole plugin process. */
export const monitor = new SystemMonitor();

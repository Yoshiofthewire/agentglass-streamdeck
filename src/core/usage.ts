/**
 * The two Anthropic rate-limit windows, and enough history to draw them.
 *
 * agentglass's `GET /usage` reports a *level* — "you are 42% through the 5-hour
 * window" — and nothing about how you got there. A bare number tells you where
 * you stand; the shape of the last hour tells you whether you are about to run
 * out, which is the thing you actually want from a glance at a deck. So the
 * plugin keeps its own short history by sampling that level.
 *
 * The history is deliberately in memory only. It is a trend line for a surface
 * you are looking at now, not a record: persisting it would mean deciding what
 * a restart, a machine asleep for a day, or a window that reset while nothing
 * was sampling should look like on the graph, and every answer to that is worse
 * than starting the line again.
 */

export type UsageWindow = {
  /** 0..100 of the window consumed. */
  utilization: number;
  remaining: number;
  resets_at: string | null;
};

export type UsagePayload = {
  available: boolean;
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  fetched_at?: number;
  error?: string;
};

export type WindowId = "five_hour" | "seven_day";

/**
 * How many samples the graph holds.
 *
 * At the 60s poll below that is a rolling hour, which is the right span for
 * both windows for different reasons: it is a fifth of the 5-hour window, so a
 * burst is visible while there is still time to act on it, and for the weekly
 * window an hour of slope is what says whether today is unusual. A longer
 * buffer would just compress that into the same 116 pixels.
 */
export const HISTORY = 30;

export type UsageState = {
  payload: UsagePayload | null;
  history: Record<WindowId, number[]>;
};

export const emptyUsage = (): UsageState => ({ payload: null, history: { five_hour: [], seven_day: [] } });

const push = (series: number[], value: number): number[] => {
  const next = series.length >= HISTORY ? series.slice(series.length - HISTORY + 1) : series.slice();
  next.push(value);
  return next;
};

/**
 * Fold a fresh reading in.
 *
 * An unavailable payload — no credentials, a 429, the server down — leaves the
 * history alone rather than recording a zero. A gap in sampling is not a drop
 * in usage, and drawing it as one would turn a failed fetch into a graph that
 * says you have plenty of headroom.
 */
export function applyUsage(state: UsageState, payload: UsagePayload | null): UsageState {
  if (!payload || !payload.available) {
    return { payload: payload ?? state.payload, history: state.history };
  }
  const history = { ...state.history };
  for (const id of ["five_hour", "seven_day"] as const) {
    const w = payload[id];
    if (w && typeof w.utilization === "number") history[id] = push(state.history[id], w.utilization);
  }
  return { payload, history };
}

export const windowOf = (state: UsageState, id: WindowId): UsageWindow | null => {
  const p = state.payload;
  if (!p || !p.available) return null;
  return p[id] ?? null;
};

/**
 * "2h14m" — how long until the window rolls over.
 *
 * Coarse on purpose: the key is read in passing, and a ticking count of seconds
 * on a device in your peripheral vision is noise. Returns "" for anything it
 * can't make sense of, which the caller draws as no note at all.
 */
export function resetNote(resets_at: string | null | undefined, now: number = Date.now()): string {
  if (!resets_at) return "";
  const t = Date.parse(resets_at);
  if (!Number.isFinite(t)) return "";
  const ms = t - now;
  if (ms <= 0) return "due";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * The machine the plugin runs on — processor, graphics, memory, battery — as
 * readings the meter art can draw.
 *
 * These four keys are the odd ones out on the deck: every other key is about
 * agentglass, and these are about the computer agentglass's keys are being
 * pressed from. They share the meter look (a level, an hour's shape, a bar)
 * because they answer the same kind of question — "how much room is left" —
 * and a deck where two instruments mean the same thing should look like it.
 *
 * Everything here is arithmetic and parsing, no I/O: the numbers come from
 * sysfs files and command output, which src/probe.ts reads and hands to these
 * functions. That split is what lets the awkward cases — a mouse that reports
 * itself as a battery, a machine with no MemAvailable — be unit-tested without
 * a machine that has them.
 */

/** The four metrics, which are also the ids of the key behaviours that draw them. */
export type MetricId = "cpu" | "gpu" | "ram" | "battery";

export const METRICS: readonly MetricId[] = ["cpu", "gpu", "ram", "battery"];

export type Reading = {
  /** 0..100, or null when this machine cannot report the metric at all. */
  percent: number | null;
  /** The small note in the key's top-right: "16c", "23G", "chg". */
  note: string;
};

/** No such sensor here — a desktop's battery, a machine with no readable GPU. */
export const UNREADABLE: Reading = { percent: null, note: "" };

/**
 * One round of sampling.
 *
 * Partial on purpose. An absent metric means "nothing fresh this tick", which
 * is not the same as a null percent ("this machine can't tell you"): the probes
 * that cost a process spawn only run every few ticks, and the keys they feed
 * must keep showing their last real reading in between rather than blinking.
 */
export type Sample = Partial<Record<MetricId, Reading>>;

export type SystemState = {
  readings: Record<MetricId, Reading>;
  history: Record<MetricId, number[]>;
};

/**
 * How many samples each graph holds.
 *
 * At the 3s tick in src/monitor.ts that is 90 seconds — the span over which a
 * build, a test run or a compile is one legible hump rather than a flat line
 * with a spike in it. The usage meters keep an hour because their windows are
 * hours long; a CPU graph an hour wide is a smear.
 */
export const HISTORY = 30;

export const emptySystem = (): SystemState => ({
  readings: { cpu: UNREADABLE, gpu: UNREADABLE, ram: UNREADABLE, battery: UNREADABLE },
  history: { cpu: [], gpu: [], ram: [], battery: [] },
});

export const clampPercent = (v: number): number => Math.max(0, Math.min(100, v));

const push = (series: number[], value: number): number[] => {
  const next = series.length >= HISTORY ? series.slice(series.length - HISTORY + 1) : series.slice();
  next.push(value);
  return next;
};

/**
 * Fold a sample in.
 *
 * A reading with a null percent still updates the key — that is how a metric
 * this machine lost (an unplugged eGPU, a probe that started failing) goes dim
 * instead of freezing at its last value — but it is never charted. Same rule as
 * the usage meters: a gap in sampling is not a drop to zero, and drawing it as
 * one would say the machine went idle when in fact you stopped being told.
 */
export function applySample(state: SystemState, sample: Sample): SystemState {
  const readings = { ...state.readings };
  const history = { ...state.history };
  for (const id of METRICS) {
    const r = sample[id];
    if (!r) continue;
    readings[id] = r;
    if (r.percent !== null) history[id] = push(state.history[id], r.percent);
  }
  return { readings, history };
}

// --- processor ---------------------------------------------------------------

/** The tick counters, summed across cores. */
export type CpuTimes = { idle: number; total: number };

export type CoreTimes = { times: { user: number; nice: number; sys: number; idle: number; irq: number } };

/** Structurally typed to `os.cpus()`, so the arithmetic is testable with a literal. */
export function cpuTimes(cores: readonly CoreTimes[]): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const c of cores) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

/**
 * Busy percent between two readings of the counters.
 *
 * There is no such thing as an instantaneous CPU load — it is only ever the
 * difference between two moments, which is why the probe keeps the previous
 * reading rather than asking the OS for "the number". Null when no time has
 * passed (two samples inside the same clock tick) or when the counters went
 * backwards, which a suspend/resume can do; the caller charts neither.
 */
export function cpuLoad(prev: CpuTimes, next: CpuTimes): number | null {
  const elapsed = next.total - prev.total;
  const idle = next.idle - prev.idle;
  if (elapsed <= 0 || idle < 0) return null;
  return clampPercent(((elapsed - idle) / elapsed) * 100);
}

// --- memory ------------------------------------------------------------------

/**
 * MemTotal and MemAvailable out of /proc/meminfo, in kB.
 *
 * Worth the file read rather than taking `os.freemem()`: on Linux that is
 * MemFree, which counts the page cache as used, so a machine with gigabytes
 * genuinely available reads as 95% full and the key is amber all day. The
 * kernel publishes its own estimate of what a new allocation could actually
 * get — the number `free -h` prints under "available" — and that is the one a
 * person glancing at the key is asking for.
 */
export function parseMeminfo(text: string): { total: number; available: number } | null {
  const field = (name: string): number | null => {
    const m = new RegExp(`^${name}:\\s+(\\d+)\\s+kB$`, "m").exec(text);
    return m ? Number(m[1]) : null;
  };
  const total = field("MemTotal");
  const available = field("MemAvailable");
  if (total === null || available === null || total <= 0) return null;
  return { total, available };
}

/** How much memory is in use, 0..100. */
export const memoryPercent = (total: number, available: number): number | null =>
  total > 0 ? clampPercent(((total - Math.max(0, Math.min(total, available))) / total) * 100) : null;

/** "23G" — the machine's size, so the percentage has a scale beside it. */
export const gib = (bytes: number): string => `${Math.round(bytes / 2 ** 30)}G`;

// --- graphics ----------------------------------------------------------------

/**
 * The PCI vendor id a DRM card reports, as the three or five characters that
 * fit on a key. Nice to have on a laptop with two GPUs: the note says which of
 * them the graph is about.
 */
export function vendorName(id: string): string {
  switch (id.trim().toLowerCase()) {
    case "0x1002":
    case "0x1022":
      return "amd";
    case "0x8086":
      return "intel";
    case "0x10de":
      return "nvidia";
    default:
      return "gpu";
  }
}

/**
 * `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits` — one
 * bare integer per GPU. The busiest is the one worth watching; a second card
 * sitting idle should not halve the reading of the one that is working.
 */
export function parseNvidiaSmi(stdout: string): number | null {
  const values = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+$/.test(l))
    .map(Number);
  return values.length ? clampPercent(Math.max(...values)) : null;
}

// --- battery -----------------------------------------------------------------

/**
 * A power supply's `status` file, as something that fits in the note.
 *
 * "bat" for discharging rather than an empty note: on a key read in passing,
 * nothing at all is indistinguishable from a note that failed to render, and
 * "running on the battery" is exactly the state you want stated.
 */
export function batteryNote(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "charging":
      return "chg";
    case "full":
      return "full";
    case "discharging":
      return "bat";
    case "not charging":
      return "ac";
    default:
      return "";
  }
}

/**
 * `pmset -g batt` on macOS:
 *   -InternalBattery-0 (id=1234)\t87%; discharging; 2:11 remaining present: true
 *
 * The percentage and the state are on one line and always in that order, which
 * is the whole of what the key needs.
 */
export function parsePmset(stdout: string): Reading | null {
  const m = /(\d{1,3})%;\s*([A-Za-z ]+)/.exec(stdout);
  if (!m) return null;
  const state = m[2]!.trim().toLowerCase();
  const note = state.startsWith("charging")
    ? "chg"
    : state.startsWith("charged") || state.startsWith("finishing")
      ? "full"
      : state.startsWith("ac")
        ? "ac"
        : "bat";
  return { percent: clampPercent(Number(m[1])), note };
}

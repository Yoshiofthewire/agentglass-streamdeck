/**
 * Where the machine readings come from — the counterpart to client.ts, which is
 * the transport to agentglass. This one's "server" is the computer itself.
 *
 * Node's standard library covers the processor and, awkwardly, the memory; the
 * graphics card and the battery have no portable API at all, so those come from
 * sysfs on Linux and from a command elsewhere. Everything degrades to a null
 * reading rather than an error: a desktop has no battery and a headless box has
 * no GPU, and neither is a fault the deck should shout about — those keys just
 * sit dim, which is exactly what "nothing to report" should look like.
 *
 * The two costs worth naming, because they are what shaped this file:
 *
 *  - A process spawn is not free, and a meter that spawns `nvidia-smi` every
 *    few seconds is a plugin that shows up in the CPU graph it is drawing. So
 *    the spawning probes run on the slow tick, and their source is resolved
 *    once: a machine does not grow a different GPU while the plugin runs.
 *  - A sysfs read is free, so where a source exists there it is read every
 *    tick, and those graphs get the finer resolution for nothing.
 */

import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";

import {
  type CpuTimes,
  type Reading,
  type Sample,
  UNREADABLE,
  batteryNote,
  clampPercent,
  cpuLoad,
  cpuTimes,
  gib,
  memoryPercent,
  parseMeminfo,
  parseNvidiaSmi,
  parsePmset,
  vendorName,
} from "./core/system.ts";

/** One round of sampling. `slow` allows the probes that cost a process spawn. */
export type Probe = (slow: boolean) => Promise<Sample>;

const exec = promisify(execFile);

/** A file's contents, or null if it isn't there — which is the usual answer. */
async function readText(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

/** Command output, or null if the tool is missing, slow, or unhappy. */
async function run(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec(cmd, args, { timeout: 4000, windowsHide: true });
    return stdout;
  } catch {
    return null;
  }
}

const isLinux = process.platform === "linux";

// --- memory ------------------------------------------------------------------

/**
 * What a new allocation could get, off Linux.
 *
 * Node 22 added `availableMemory()`, which means what MemAvailable means;
 * Node 20 — which is what the Elgato host ships, and what the manifest asks
 * for — has only `freemem()`, which reads high on any OS that caches
 * aggressively. Looked up rather than called, because it has to compile
 * against both and be absent on one at runtime.
 */
function availableBytes(): number {
  const o = os as typeof os & { availableMemory?: () => number };
  return typeof o.availableMemory === "function" ? o.availableMemory() : os.freemem();
}

async function memory(): Promise<Reading> {
  const meminfo = isLinux ? parseMeminfo((await readText("/proc/meminfo")) ?? "") : null;
  const total = meminfo ? meminfo.total * 1024 : os.totalmem();
  const available = meminfo ? meminfo.available * 1024 : availableBytes();
  const percent = memoryPercent(total, available);
  return percent === null ? UNREADABLE : { percent, note: gib(total) };
}

// --- graphics ----------------------------------------------------------------

type GpuSource =
  /** amdgpu and Intel's xe publish a busy percentage; a plain file read. */
  | { kind: "sysfs"; path: string; note: string }
  /** NVIDIA has no sysfs equivalent — only the tool. */
  | { kind: "nvidia" }
  | { kind: "none" };

const NVIDIA_ARGS = ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"];

async function findGpu(): Promise<GpuSource> {
  try {
    for (const card of (await readdir("/sys/class/drm")).sort()) {
      if (!/^card\d+$/.test(card)) continue;
      const dir = `/sys/class/drm/${card}/device`;
      if ((await readText(`${dir}/gpu_busy_percent`)) === null) continue;
      return { kind: "sysfs", path: `${dir}/gpu_busy_percent`, note: vendorName((await readText(`${dir}/vendor`)) ?? "") };
    }
  } catch {
    /* no /sys/class/drm — not Linux, or a kernel without DRM */
  }
  return (await run("nvidia-smi", NVIDIA_ARGS)) !== null ? { kind: "nvidia" } : { kind: "none" };
}

async function gpuReading(src: GpuSource): Promise<Reading> {
  if (src.kind === "sysfs") {
    const raw = await readText(src.path);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? { percent: clampPercent(v), note: src.note } : UNREADABLE;
  }
  if (src.kind === "nvidia") {
    const out = await run("nvidia-smi", NVIDIA_ARGS);
    const v = out === null ? null : parseNvidiaSmi(out);
    return v === null ? UNREADABLE : { percent: v, note: "nvidia" };
  }
  return UNREADABLE;
}

// --- battery -----------------------------------------------------------------

type BatterySource =
  | { kind: "sysfs"; dir: string }
  /** macOS. Windows has no equivalent that is cheap enough to poll; see below. */
  | { kind: "pmset" }
  | { kind: "none" };

async function findBattery(): Promise<BatterySource> {
  try {
    for (const name of (await readdir("/sys/class/power_supply")).sort()) {
      const dir = `/sys/class/power_supply/${name}`;
      if ((await readText(`${dir}/type`)) !== "Battery") continue;
      // A wireless mouse is a battery too, and it is emphatically not the one
      // you want on the key. The kernel marks peripherals scope=Device; the
      // machine's own pack has no scope at all, or "System".
      if ((await readText(`${dir}/scope`)) === "Device") continue;
      if ((await readText(`${dir}/capacity`)) === null) continue;
      return { kind: "sysfs", dir };
    }
  } catch {
    /* no /sys/class/power_supply */
  }
  // Windows would mean a PowerShell CIM query — a third of a second of spawn
  // for a number that moves by one point an hour. Left out on purpose rather
  // than left unnoticed: the key reads "—", which is honest.
  if (process.platform === "darwin" && (await run("pmset", ["-g", "batt"])) !== null) return { kind: "pmset" };
  return { kind: "none" };
}

async function batteryReading(src: BatterySource): Promise<Reading> {
  if (src.kind === "sysfs") {
    const raw = await readText(`${src.dir}/capacity`);
    const v = raw === null ? NaN : Number(raw);
    if (!Number.isFinite(v)) return UNREADABLE;
    return { percent: clampPercent(v), note: batteryNote((await readText(`${src.dir}/status`)) ?? "") };
  }
  if (src.kind === "pmset") {
    const out = await run("pmset", ["-g", "batt"]);
    return (out === null ? null : parsePmset(out)) ?? UNREADABLE;
  }
  return UNREADABLE;
}

// --- the probe ---------------------------------------------------------------

/**
 * A sampler with the little memory it needs: the previous CPU counters (load is
 * only ever a difference between two moments) and the sources it has resolved.
 *
 * The counters are read at construction rather than left null, so the first
 * tick has something to measure against — the window is however long the plugin
 * took to come up. If that is less than a clock tick the load comes back null
 * and the key shows a dash for one interval, which is the honest answer: there
 * is no such thing as CPU load over zero elapsed time.
 */
export function createProbe(): Probe {
  let previous: CpuTimes = cpuTimes(os.cpus());
  let gpu: GpuSource | null = null;
  let battery: BatterySource | null = null;

  return async (slow: boolean): Promise<Sample> => {
    const sample: Sample = {};

    const cores = os.cpus();
    const now = cpuTimes(cores);
    const load = cpuLoad(previous, now);
    previous = now;
    if (load !== null) sample.cpu = { percent: load, note: `${cores.length}c` };

    sample.ram = await memory();

    // Both sources are resolved on the first tick, which is always a slow one.
    if (slow) {
      gpu ??= await findGpu();
      battery ??= await findBattery();
    }
    // Read every tick where that is a file read, and only on the slow tick
    // where it is a process — a held reading is left out of the sample rather
    // than repeated into the graph as a flat step that never happened.
    if (gpu && (slow || gpu.kind === "sysfs")) sample.gpu = await gpuReading(gpu);
    if (battery && (slow || battery.kind === "sysfs")) sample.battery = await batteryReading(battery);

    return sample;
  };
}

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY,
  type CoreTimes,
  type Sample,
  applySample,
  batteryNote,
  cpuLoad,
  cpuTimes,
  emptySystem,
  gib,
  memoryPercent,
  parseMeminfo,
  parseNvidiaSmi,
  parsePmset,
  vendorName,
} from "../src/core/system.ts";
import { SystemMonitor } from "../src/monitor.ts";

const core = (user: number, sys: number, idle: number): CoreTimes => ({
  times: { user, nice: 0, sys, idle, irq: 0 },
});

test("cpu load is the busy share of the time between two readings", () => {
  const prev = cpuTimes([core(100, 50, 850), core(100, 50, 850)]);
  const next = cpuTimes([core(150, 50, 1050), core(100, 100, 1050)]);
  // 250 ticks passed on each core, 200 of them idle: 50 busy in 250 is 20%.
  assert.equal(cpuLoad(prev, next), 20);
});

test("cpu load is null when no time has passed, or the counters went backwards", () => {
  const t = cpuTimes([core(100, 50, 850)]);
  assert.equal(cpuLoad(t, t), null, "two samples inside one clock tick");
  // A suspend/resume can reset the counters; a negative idle delta would
  // otherwise render as a spike to 100%.
  assert.equal(cpuLoad(cpuTimes([core(100, 50, 900)]), cpuTimes([core(200, 100, 850)])), null);
});

test("meminfo is read for MemAvailable, not MemFree", () => {
  const text = "MemTotal:       23682256 kB\nMemFree:         2029220 kB\nMemAvailable:    9750960 kB\n";
  const m = parseMeminfo(text)!;
  assert.equal(m.total, 23682256);
  assert.equal(m.available, 9750960);
  // The page cache is not "in use": free would say 91%, available says 59%.
  assert.equal(Math.round(memoryPercent(m.total, m.available)!), 59);
});

test("meminfo without MemAvailable is no reading at all", () => {
  // Rather than silently falling back to MemFree and reporting a machine with
  // room to spare as nearly full.
  assert.equal(parseMeminfo("MemTotal: 100 kB\nMemFree: 50 kB\n"), null);
  assert.equal(parseMeminfo(""), null);
});

test("memory percent is clamped against a nonsense available figure", () => {
  assert.equal(memoryPercent(100, 200), 0);
  assert.equal(memoryPercent(100, -5), 100);
  assert.equal(memoryPercent(0, 0), null);
});

test("the note carries the size of the machine", () => {
  assert.equal(gib(23682256 * 1024), "23G");
});

test("nvidia-smi reports the busiest card, not the first", () => {
  assert.equal(parseNvidiaSmi("8\n74\n"), 74);
  assert.equal(parseNvidiaSmi("0\n"), 0);
  // No card, or a driver error printed on stderr and nothing on stdout.
  assert.equal(parseNvidiaSmi(""), null);
  assert.equal(parseNvidiaSmi("Failed to initialise NVML\n"), null);
});

test("drm vendor ids become something that fits on a key", () => {
  assert.equal(vendorName("0x1002"), "amd");
  assert.equal(vendorName("0x8086"), "intel");
  assert.equal(vendorName("0x10de"), "nvidia");
  assert.equal(vendorName("0xbeef"), "gpu");
});

test("battery status becomes a three-character note", () => {
  assert.equal(batteryNote("Charging"), "chg");
  assert.equal(batteryNote("Discharging\n"), "bat");
  assert.equal(batteryNote("Full"), "full");
  assert.equal(batteryNote("Not charging"), "ac");
  assert.equal(batteryNote("Unknown"), "");
});

test("pmset yields a level and a state", () => {
  const out =
    "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t87%; discharging; 2:11 remaining present: true\n";
  assert.deepEqual(parsePmset(out), { percent: 87, note: "bat" });
  assert.deepEqual(parsePmset(" -InternalBattery-0 (id=1)\t45%; charging; 1:02 remaining present: true"), {
    percent: 45,
    note: "chg",
  });
  assert.deepEqual(parsePmset(" -InternalBattery-0 (id=1)\t100%; charged; present: true"), {
    percent: 100,
    note: "full",
  });
  assert.equal(parsePmset("Now drawing from 'AC Power'"), null);
});

test("a sample updates the reading and charts it", () => {
  const s = applySample(emptySystem(), { cpu: { percent: 42, note: "16c" } });
  assert.equal(s.readings.cpu.percent, 42);
  assert.deepEqual(s.history.cpu, [42]);
  assert.deepEqual(s.history.gpu, [], "a metric not in the sample is untouched");
});

test("a metric missing from a sample keeps its last reading", () => {
  // This is the slow tick: the GPU was read five ticks ago and there is no
  // fresh number, which must not look like the card vanished.
  let s = applySample(emptySystem(), { gpu: { percent: 70, note: "amd" } });
  s = applySample(s, { cpu: { percent: 5, note: "16c" } });
  assert.equal(s.readings.gpu.percent, 70);
  assert.deepEqual(s.history.gpu, [70], "and is not charted twice");
});

test("an unreadable metric dims the key but never charts a zero", () => {
  let s = applySample(emptySystem(), { gpu: { percent: 70, note: "amd" } });
  s = applySample(s, { gpu: { percent: null, note: "" } });
  assert.equal(s.readings.gpu.percent, null, "the key goes dim rather than freezing at 70%");
  assert.deepEqual(s.history.gpu, [70], "losing the sensor is not the GPU going idle");
});

test("history is a ring the width of the graph", () => {
  let s = emptySystem();
  for (let i = 0; i < HISTORY + 10; i++) s = applySample(s, { cpu: { percent: i, note: "" } });
  assert.equal(s.history.cpu.length, HISTORY);
  assert.equal(s.history.cpu[HISTORY - 1], HISTORY + 9, "the newest sample is the last one");
});

// --- the monitor -------------------------------------------------------------

function fakeProbe() {
  const slowCalls: boolean[] = [];
  const probe = async (slow: boolean): Promise<Sample> => {
    slowCalls.push(slow);
    return { cpu: { percent: 10, note: "8c" } };
  };
  return { probe, slowCalls };
}

test("the spawning probes are allowed on the first tick and every fifth after", async () => {
  const { probe, slowCalls } = fakeProbe();
  const m = new SystemMonitor();
  m.setProbe(probe);
  for (let i = 0; i < 6; i++) await m.refresh();
  assert.deepEqual(slowCalls, [true, false, false, false, false, true]);
});

test("pressing the key forces a full sample", async () => {
  const { probe, slowCalls } = fakeProbe();
  const m = new SystemMonitor();
  m.setProbe(probe);
  await m.refresh(); // the first, already slow
  await m.refresh(true);
  assert.deepEqual(slowCalls, [true, true]);
});

test("samples never overlap — a spawn that outlives its tick is not queued", async () => {
  let running = 0;
  let peak = 0;
  const m = new SystemMonitor();
  m.setProbe(async () => {
    peak = Math.max(peak, ++running);
    await new Promise((r) => setTimeout(r, 20));
    running--;
    return {};
  });
  await Promise.all([m.refresh(), m.refresh(), m.refresh()]);
  assert.equal(peak, 1);
});

test("a probe that throws leaves the readings standing and the clock running", async () => {
  const m = new SystemMonitor();
  m.setProbe(async () => ({ ram: { percent: 61, note: "23G" } }));
  await m.refresh();
  m.setProbe(async () => {
    throw new Error("sysfs went away");
  });
  await m.refresh();
  assert.equal(m.reading("ram").percent, 61);
  m.setProbe(async () => ({ ram: { percent: 62, note: "23G" } }));
  await m.refresh();
  assert.equal(m.reading("ram").percent, 62);
});

test("the monitor notifies subscribers so the keys repaint", async () => {
  const m = new SystemMonitor();
  m.setProbe(async () => ({ cpu: { percent: 3, note: "8c" } }));
  let hits = 0;
  const off = m.subscribe(() => hits++);
  await m.refresh();
  assert.equal(hits, 1);
  off();
  await m.refresh();
  assert.equal(hits, 1, "unsubscribing takes");
});

test("an unread metric starts as no reading rather than as zero", () => {
  const m = new SystemMonitor();
  for (const id of ["cpu", "gpu", "ram", "battery"] as const) {
    assert.equal(m.reading(id).percent, null, `${id} must not open at 0%`);
    assert.deepEqual(m.history(id), []);
  }
});

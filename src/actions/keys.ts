/**
 * One class, every key.
 *
 * The keys differ in what they dispatch and what they draw, not in how they
 * behave, so they are one class parameterised by a `KeyDef` from the catalog
 * rather than twenty-odd near-identical subclasses. `manifestId` is an instance
 * field on `SingletonAction`, which is what makes that possible — the `@action`
 * decorator only exists to set it, and a table-driven plugin can set it itself.
 *
 * Every key paints itself from live state, including the ones that only send a
 * fixed command: when agentglass isn't reachable the whole deck goes cold, so
 * you find out by looking instead of by pressing something and waiting for
 * nothing to happen.
 */

import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";

import { monitor } from "../monitor.ts";
import { service } from "../service.ts";
import { type KeyDef, isMetric, uuidOf } from "../core/catalog.ts";
import type { MetricId } from "../core/system.ts";
import { resetNote, type WindowId } from "../core/usage.ts";
import { ACCENTS } from "../render/theme.ts";
import { keyImage, linkImage, meterImage } from "../render/hud.ts";

export class CatalogKeyAction extends SingletonAction {
  /**
   * The image each placement is currently showing.
   *
   * Every key subscribes to the service, and the service notifies on every
   * poll, so without this a two-second tick would repaint a full deck of
   * base64 PNG-sized payloads over the socket forever. Keys change rarely;
   * comparing the rendered string is the cheapest possible way to know.
   */
  private readonly painted = new Map<string, string>();

  constructor(private readonly def: KeyDef) {
    super();
    (this as { manifestId: string | undefined }).manifestId = uuidOf(def.id);
    service.subscribe(() => void this.paint());
    // Only the machine meters follow the machine's own clock. Every other key
    // would repaint to an identical image on every tick of it.
    if (isMetric(def.behaviour)) monitor.subscribe(() => void this.paint());
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    // The labels are drawn into the image; the deck's own title overlay would
    // land a second, unstyled copy on top of them.
    if ("setTitle" in ev.action) await ev.action.setTitle("");
    await this.paint();
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    switch (this.def.behaviour) {
      case "gate-next":
        service.selectGate(1);
        return;
      case "gate-prev":
        service.selectGate(-1);
        return;
      case "usage-5h":
      case "usage-week":
        // The meters are slow-polled on purpose; pressing one is how you say
        // "no, tell me now" — after finishing a big run, say.
        await service.refreshUsage();
        return;
      case "link":
        await service.refreshGates();
        return;
      case "cpu":
      case "gpu":
      case "ram":
      case "battery":
        // A forced sample, spawning probes and all — the deck's answer to
        // "what is it doing *right now*".
        await monitor.refresh(true);
        return;
      default:
        if (this.def.action) await service.run(this.def.action);
    }
  }

  /** The current art for this key, given everything the service knows. */
  private image(): string {
    const offline = !service.isConnected();
    const pending = service.pendingCount();

    switch (this.def.behaviour) {
      case "usage-5h":
        return this.meter("five_hour");
      case "usage-week":
        return this.meter("seven_day");
      case "link":
        return linkImage(service.isConnected(), pending);
      case "cpu":
      case "gpu":
      case "ram":
      case "battery":
        return this.machine(this.def.behaviour);
      case "approve":
        // Idle it looks like any other key; with work waiting it goes amber and
        // carries the count, so the queue is visible from across the room.
        return keyImage({
          label: this.def.label,
          glyph: this.def.glyph,
          accent: this.def.accent,
          offline,
          count: pending,
          accentOverride: pending > 0 ? ACCENTS.alert : undefined,
        });
      case "deny":
      case "gate-next":
      case "gate-prev":
        // Nothing to decide on and nothing to scrub through — these are dead
        // keys until the queue has something in it, and they should look it.
        return keyImage({
          label: this.def.label,
          glyph: this.def.glyph,
          accent: this.def.accent,
          offline: offline || pending === 0,
          count: this.def.behaviour === "deny" ? 0 : pending > 1 ? service.selectedIndex() + 1 : 0,
        });
      default:
        return keyImage({ label: this.def.label, glyph: this.def.glyph, accent: this.def.accent, offline });
    }
  }

  /**
   * A machine meter.
   *
   * Note what it does *not* pass: `offline`. Alone on the deck, these keys have
   * nothing to do with whether agentglass is reachable — the computer is still
   * here, and greying its CPU out because a web server went down would be the
   * key telling a lie. They go dim only when the metric itself is unreadable,
   * which `percent: null` already means: a desktop's battery, a box with no GPU.
   */
  private machine(id: MetricId): string {
    const r = monitor.reading(id);
    return meterImage({
      label: this.def.label,
      percent: r.percent,
      history: monitor.history(id),
      note: r.note,
      // A full battery is not a problem; a full disk of RAM is.
      tone: id === "battery" ? "charge" : "load",
    });
  }

  private meter(id: WindowId): string {
    const w = service.usageWindow(id);
    return meterImage({
      label: this.def.label,
      percent: w ? w.utilization : null,
      history: service.usageHistory(id),
      note: w ? resetNote(w.resets_at) : "",
      offline: !service.isConnected(),
    });
  }

  private async paint(): Promise<void> {
    const img = this.image();
    for (const a of this.actions) {
      if (this.painted.get(a.id) === img) continue;
      try {
        if (!("setImage" in a)) continue;
        await a.setImage(img);
        this.painted.set(a.id, img);
      } catch {
        // The placement disappeared mid-render. Drop the cache entry so it
        // repaints from scratch if it comes back.
        this.painted.delete(a.id);
      }
    }
  }
}

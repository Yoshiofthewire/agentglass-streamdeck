/**
 * The Stream Deck + encoders: scrub the approval queue, cycle the theme, zoom.
 *
 * Every one of these is a convenience, not a capability — the catalog carries
 * key equivalents for all three (Gate · Next/Previous, Look · Theme ±, Look ·
 * Zoom ±), so a deck without dials can do everything a Stream Deck + can. What
 * the dial adds is the feel: scrubbing a queue of six approvals with a thumb
 * beats pressing "next" six times, and that is worth the extra actions.
 *
 * Each turn is normalised to a single step so a fast flick doesn't cycle the
 * theme eleven times, and the touch strip above the dial says what it is on.
 */

import {
  SingletonAction,
  type DialDownEvent,
  type DialRotateEvent,
  type TouchTapEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { service } from "../service.ts";
import { uuidOf } from "../core/catalog.ts";

type Feedback = { title: string; value: string };

/** The touch strip is a fixed `$B1` layout: a title and a value. */
abstract class DialBase extends SingletonAction {
  private readonly shown = new Map<string, string>();

  constructor(id: string) {
    super();
    (this as { manifestId: string | undefined }).manifestId = uuidOf(id);
  }

  protected abstract feedback(): Feedback;

  override onWillAppear(_ev: WillAppearEvent): Promise<void> {
    return this.render();
  }

  protected async render(): Promise<void> {
    const f = this.feedback();
    const key = `${f.title} ${f.value}`;
    for (const a of this.actions) {
      if (!("setFeedback" in a) || this.shown.get(a.id) === key) continue;
      try {
        await a.setFeedback(f);
        this.shown.set(a.id, key);
      } catch {
        this.shown.delete(a.id);
      }
    }
  }
}

export class GateDialAction extends DialBase {
  constructor() {
    super("dial.gate");
    service.subscribe(() => void this.render());
  }

  override onDialRotate(ev: DialRotateEvent): void {
    service.selectGate(Math.sign(ev.payload.ticks));
  }

  override async onDialDown(): Promise<void> {
    await service.run({ kind: "approve" });
  }

  override async onTouchTap(_ev: TouchTapEvent): Promise<void> {
    await service.run({ kind: "approve" });
  }

  protected feedback(): Feedback {
    const n = service.pendingCount();
    const gate = service.selectedGate();
    return {
      title: n > 0 ? "approve" : "gate",
      value: gate ? (gate.tool_name ?? "?") + (n > 1 ? ` ${service.selectedIndex() + 1}/${n}` : "") : "none",
    };
  }
}

export class ThemeDialAction extends DialBase {
  constructor() {
    super("dial.theme");
  }

  override async onDialRotate(ev: DialRotateEvent): Promise<void> {
    const dir = Math.sign(ev.payload.ticks);
    if (dir === 0) return;
    await service.run({ kind: "theme", dir: dir as 1 | -1 });
  }

  protected feedback(): Feedback {
    return { title: "theme", value: "▲ ▼" };
  }
}

export class ZoomDialAction extends DialBase {
  constructor() {
    super("dial.zoom");
  }

  override async onDialRotate(ev: DialRotateEvent): Promise<void> {
    const dir = Math.sign(ev.payload.ticks);
    if (dir === 0) return;
    await service.run({ kind: "zoom", dir: dir as 1 | -1 });
  }

  override async onDialDown(_ev: DialDownEvent): Promise<void> {
    await service.run({ kind: "zoom", dir: 0 });
  }

  protected feedback(): Feedback {
    return { title: "zoom", value: "± ⊙" };
  }
}

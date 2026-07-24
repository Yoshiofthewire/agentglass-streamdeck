/**
 * The dial (encoder) actions for the Stream Deck +: scrub the approval queue,
 * cycle the theme, zoom. Each turn is normalised to a single step so the feel
 * matches the keyboard's one-press-one-step, and the touch strip above the dial
 * shows what it does via setFeedback.
 */

import {
  action,
  SingletonAction,
  type DialDownEvent,
  type DialRotateEvent,
  type TouchTapEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { service } from "../service.ts";

async function feedbackAll(self: SingletonAction, title: string, value: string): Promise<void> {
  for (const a of self.actions) {
    if ("setFeedback" in a) {
      try {
        await (a as { setFeedback(f: Record<string, unknown>): Promise<void> }).setFeedback({ title, value });
      } catch {
        /* placement gone mid-render */
      }
    }
  }
}

@action({ UUID: "com.agentglass.controller.gate" })
export class GateDialAction extends SingletonAction {
  constructor() {
    super();
    service.subscribe(() => void this.render());
  }

  override onWillAppear(): Promise<void> {
    return this.render();
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

  private render(): Promise<void> {
    const n = service.pendingCount();
    const gate = service.selectedGate();
    const value = gate
      ? (gate.tool_name ?? "?") + (n > 1 ? ` ${service.selectedIndex() + 1}/${n}` : "")
      : "none";
    return feedbackAll(this, n > 0 ? "approve" : "gate", value);
  }
}

@action({ UUID: "com.agentglass.controller.theme" })
export class ThemeDialAction extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): Promise<void> {
    return feedbackAll(this, "theme", "▲ ▼");
  }

  override async onDialRotate(ev: DialRotateEvent): Promise<void> {
    const dir = Math.sign(ev.payload.ticks);
    if (dir === 0) return;
    await service.run({ kind: "theme", dir: dir as 1 | -1 });
  }
}

@action({ UUID: "com.agentglass.controller.zoom" })
export class ZoomDialAction extends SingletonAction {
  override onWillAppear(): Promise<void> {
    return feedbackAll(this, "zoom", "± ⊙");
  }

  override async onDialRotate(ev: DialRotateEvent): Promise<void> {
    const dir = Math.sign(ev.payload.ticks);
    if (dir === 0) return;
    await service.run({ kind: "zoom", dir: dir as 1 | -1 });
  }

  override async onDialDown(_ev: DialDownEvent): Promise<void> {
    await service.run({ kind: "zoom", dir: 0 });
  }
}

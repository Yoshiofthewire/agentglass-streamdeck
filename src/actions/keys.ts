/**
 * The keypad actions: open a view, run a control command, approve, deny.
 *
 * Each is thin — it reads its per-key settings, builds an `Action`, and hands it
 * to the shared `service`. Approve/deny also subscribe to the service so their
 * key reflects the live approval count without polling of their own.
 */

import { action, SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";

import { service } from "../service.ts";
import { type Action, type OpenWhat, type ViewId, isViewId } from "../core/model.ts";

/** Refresh the count/badge on every placement of a subscribing action. */
async function renderCount(self: SingletonAction): Promise<void> {
  const n = service.pendingCount();
  for (const a of self.actions) {
    try {
      await a.setTitle(n > 0 ? String(n) : "");
      if ("setState" in a) await (a as { setState(s: number): Promise<void> }).setState(n > 0 ? 1 : 0);
    } catch {
      /* the action may have disappeared mid-render */
    }
  }
}

type ViewSettings = { view?: ViewId };

@action({ UUID: "com.agentglass.controller.view" })
export class ViewAction extends SingletonAction<ViewSettings> {
  override async onWillAppear(ev: WillAppearEvent<ViewSettings>): Promise<void> {
    const v = ev.payload.settings.view;
    await ev.action.setTitle(isViewId(v) ? v : "view");
  }

  override async onKeyDown(ev: KeyDownEvent<ViewSettings>): Promise<void> {
    const v = ev.payload.settings.view;
    await service.run({ kind: "view", view: isViewId(v) ? v : "git" });
  }
}

/** The control commands that aren't a view or an approval, behind one key with
 *  a dropdown. `open-*` map onto the /control `open` command. */
type Command = "workspace" | "esc" | "open-stats" | "open-skills" | "open-search" | "open-help" | "open-palette";
type CommandSettings = { command?: Command };

const COMMAND_LABEL: Record<Command, string> = {
  workspace: "workspace",
  esc: "home",
  "open-stats": "stats",
  "open-skills": "skills",
  "open-search": "search",
  "open-help": "help",
  "open-palette": "palette",
};

function commandToAction(cmd: Command): Action {
  switch (cmd) {
    case "workspace":
      return { kind: "workspace" };
    case "esc":
      return { kind: "esc" };
    default:
      return { kind: "open", what: cmd.slice("open-".length) as OpenWhat };
  }
}

@action({ UUID: "com.agentglass.controller.command" })
export class CommandAction extends SingletonAction<CommandSettings> {
  override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
    await ev.action.setTitle(COMMAND_LABEL[ev.payload.settings.command ?? "workspace"]);
  }

  override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
    await service.run(commandToAction(ev.payload.settings.command ?? "workspace"));
  }
}

@action({ UUID: "com.agentglass.controller.approve" })
export class ApproveAction extends SingletonAction {
  constructor() {
    super();
    service.subscribe(() => void renderCount(this));
  }

  override onWillAppear(): Promise<void> {
    return renderCount(this);
  }

  override async onKeyDown(): Promise<void> {
    await service.run({ kind: "approve" });
  }
}

@action({ UUID: "com.agentglass.controller.deny" })
export class DenyAction extends SingletonAction {
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle("deny");
  }

  override async onKeyDown(): Promise<void> {
    await service.run({ kind: "deny" });
  }
}

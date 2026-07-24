/**
 * Plugin entry: register every action, connect to OpenDeck / Stream Deck, then
 * point the shared service at the configured agentglass and go live.
 *
 * The server URL and token are global settings (edited in any action's property
 * inspector); a change re-points the service without a restart.
 */

import streamDeck from "@elgato/streamdeck";

import { service } from "./service.ts";
import { ApproveAction, CommandAction, DenyAction, ViewAction } from "./actions/keys.ts";
import { GateDialAction, ThemeDialAction, ZoomDialAction } from "./actions/dials.ts";

type GlobalSettings = { server?: string; token?: string };

const DEFAULT_SERVER = "http://127.0.0.1:4000";

async function applySettings(): Promise<void> {
  const s = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
  const server = (s.server ?? "").trim() || DEFAULT_SERVER;
  const token = (s.token ?? "").trim() || undefined;
  service.configure({ server, token });
}

streamDeck.actions.registerAction(new ViewAction());
streamDeck.actions.registerAction(new CommandAction());
streamDeck.actions.registerAction(new ApproveAction());
streamDeck.actions.registerAction(new DenyAction());
streamDeck.actions.registerAction(new GateDialAction());
streamDeck.actions.registerAction(new ThemeDialAction());
streamDeck.actions.registerAction(new ZoomDialAction());

streamDeck.settings.onDidReceiveGlobalSettings(() => void applySettings());

await streamDeck.connect();
await applySettings();
service.start();

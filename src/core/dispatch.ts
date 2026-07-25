/**
 * Turn an `Action` into the agentglass request that carries it out — or null.
 *
 * Pure, so the whole "which action hits which endpoint" table is a unit test.
 * Navigation and appearance go to POST /control; approve/deny go to
 * POST /gate/decide against the *selected* pending gate.
 */

import type { Action } from "./model.ts";
import { type GateState, selectedGate } from "./state.ts";

export const DENY_REASON = "denied from the Stream Deck";

export type Request = { method: "POST"; path: string; body: Record<string, unknown> };

export function planRequest(action: Action, state: GateState): Request | null {
  switch (action.kind) {
    case "view":
      return { method: "POST", path: "/control", body: { cmd: "view", to: action.view } };
    case "workspace":
      return { method: "POST", path: "/control", body: { cmd: "workspace" } };
    case "esc":
      return { method: "POST", path: "/control", body: { cmd: "esc" } };
    case "open":
      return { method: "POST", path: "/control", body: { cmd: "open", what: action.what } };
    case "theme":
      return { method: "POST", path: "/control", body: { cmd: "theme", dir: action.dir } };
    case "zoom":
      return { method: "POST", path: "/control", body: { cmd: "zoom", dir: action.dir } };
    case "chat":
      return { method: "POST", path: "/control", body: { cmd: "chat", do: action.do } };
    case "approve":
    case "deny": {
      const gate = selectedGate(state);
      if (!gate) return null;
      const body: Record<string, unknown> = {
        id: gate.id,
        decision: action.kind === "approve" ? "allow" : "deny",
      };
      if (action.kind === "deny") body.reason = DENY_REASON;
      return { method: "POST", path: "/gate/decide", body };
    }
  }
}

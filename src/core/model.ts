/**
 * The vocabulary shared by the plugin's actions and the request planner.
 *
 * An `Action` is an intent the user assigned to a key or dial; `dispatch` turns
 * it into an agentglass request. Keeping it separate from the Stream Deck action
 * classes is what lets the request table be unit-tested without the SDK.
 */

export const VIEW_IDS = ["git", "diff", "pr", "docker", "term", "chat"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export const OPEN_WHATS = ["stats", "skills", "search", "help", "palette"] as const;
export type OpenWhat = (typeof OPEN_WHATS)[number];

export type Action =
  | { kind: "view"; view: ViewId }
  | { kind: "workspace" }
  | { kind: "esc" }
  | { kind: "open"; what: OpenWhat }
  | { kind: "theme"; dir: 1 | -1 }
  | { kind: "zoom"; dir: 1 | -1 | 0 }
  | { kind: "approve" }
  | { kind: "deny" };

export const isViewId = (v: unknown): v is ViewId =>
  typeof v === "string" && (VIEW_IDS as readonly string[]).includes(v);

/** Normalise a dial's tick count to a single step in either direction. */
export const sign = (n: number): 1 | -1 | 0 => (n > 0 ? 1 : n < 0 ? -1 : 0);

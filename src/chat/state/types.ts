/* Session state shape + action vocabulary. Session.status is the display
 * truth (sidebar dot, sort); activeRuns is the engine truth (send gate, hook
 * streaming, drain). They split for seeds: s-e2e only displays streaming,
 * showcase has a seed run with no registry token. */
import type { ChatMessage, ContentBlock, Draft, Project, Session, SessionMeta, TaskGroup } from "../types";

export interface QueueState {
  messages: string[];
  paused: boolean;
}

/** kind:"draft" implies draft !== null; the draft slot survives selection
 * changes and only session/commitDraft clears it. */
export type Selection = { kind: "session"; sessionId: string } | { kind: "draft" };

export interface SessionState {
  sessions: Session[];
  projects: Project[];
  groups: TaskGroup[];
  draft: Draft | null;
  selection: Selection;
  /** Presence = a run is attached to the session. */
  activeRuns: ReadonlySet<string>;
  queues: Record<string, QueueState>;
}

export type Action =
  | { type: "selection/set"; sessionId: string; expectedUnreadAtMs?: number }
  | { type: "selection/draft"; seed?: Draft }
  | { type: "selection/patchDraft"; text: string }
  | { type: "session/commitDraft"; sessionId: string; text: string; userMsg: ChatMessage; replyMsg: ChatMessage }
  | { type: "session/patchMeta"; id: string; patch: Partial<SessionMeta> }
  | { type: "session/archive"; id: string; archived: boolean }
  | { type: "session/remove"; id: string }
  | { type: "run/start"; sessionId: string; userMsg: ChatMessage; replyMsg: ChatMessage }
  | { type: "run/finish"; sessionId: string; outcome: "done" | "error" | "aborted" }
  | { type: "block/append"; sessionId: string; messageId: string; block: ContentBlock }
  | { type: "block/patch"; sessionId: string; messageId: string; blockId: string; patch: (b: ContentBlock) => ContentBlock }
  | { type: "queue/push"; sessionId: string; text: string }
  | { type: "queue/remove"; sessionId: string; index: number }
  | { type: "queue/shift"; sessionId: string }
  | { type: "queue/setPaused"; sessionId: string; paused: boolean }
  | { type: "project/save"; project: Project }
  | { type: "project/remove"; id: string }
  | { type: "project/togglePin"; id: string };

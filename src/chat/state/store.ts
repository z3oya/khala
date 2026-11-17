/* Session store: the reducer is the single write path for
 * sessions/projects/activeRuns/queues; seeds assemble from mockData. */
import { initialGroups, initialProjects, initialSessions, SHOWCASE_SEED } from "../mockData";
import type { ContentBlock, Session } from "../types";
import type { Action, SessionState } from "./types";

function mostRecent(sessions: Session[]): Session | undefined {
  return sessions.reduce<Session | undefined>((a, b) => (!a || b.updatedAtMs > a.updatedAtMs ? b : a), undefined);
}

export function createInitialState(showcase: boolean): SessionState {
  const sessions = showcase ? [SHOWCASE_SEED.session, ...initialSessions] : [...initialSessions];
  return {
    sessions,
    projects: initialProjects,
    groups: initialGroups,
    draft: { text: "" },
    selection: { kind: "draft" },
    activeRuns: new Set(showcase ? [SHOWCASE_SEED.session.id] : []),
    queues: showcase
      ? { [SHOWCASE_SEED.session.id]: { messages: [...SHOWCASE_SEED.queue], paused: SHOWCASE_SEED.queuePaused } }
      : {},
  };
}

export interface SessionStore {
  getState: () => SessionState;
  dispatch: (action: Action) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createSessionStore(initial: SessionState): SessionStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    // No-op dispatches keep the snapshot identity stable for useSyncExternalStore.
    dispatch: (action) => {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Queue keys vanish only when empty AND unpaused. */
function withQueue(state: SessionState, sessionId: string, messages: string[], paused: boolean): SessionState {
  if (messages.length === 0 && !paused) {
    if (!(sessionId in state.queues)) return state;
    const queues = { ...state.queues };
    delete queues[sessionId];
    return { ...state, queues };
  }
  return { ...state, queues: { ...state.queues, [sessionId]: { messages, paused } } };
}

function patchMessageBlocks(
  state: SessionState,
  sessionId: string,
  messageId: string,
  fn: (blocks: ContentBlock[]) => ContentBlock[],
): SessionState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            messages: s.messages.map((m) => (m.id === messageId ? { ...m, blocks: fn(m.blocks) } : m)),
          }
        : s,
    ),
  };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "selection/set": {
      // CAS clear: only when it still matches the rendered value.
      const sessions = state.sessions.map((s) =>
        s.id === action.sessionId &&
        s.unreadAtMs !== undefined &&
        (action.expectedUnreadAtMs === undefined || s.unreadAtMs === action.expectedUnreadAtMs)
          ? { ...s, unreadAtMs: undefined }
          : s,
      );
      return { ...state, sessions, selection: { kind: "session", sessionId: action.sessionId } };
    }

    case "selection/draft":
      return { ...state, draft: state.draft ?? action.seed ?? { text: "" }, selection: { kind: "draft" } };

    case "selection/patchDraft": {
      if (!state.draft || state.draft.text === action.text) return state;
      return { ...state, draft: { ...state.draft, text: action.text } };
    }

    case "session/commitDraft": {
      const d = state.draft;
      if (!d) return state;
      const now = Date.now();
      const session: Session = {
        id: action.sessionId,
        title: action.text.slice(0, 16),
        titleOverridden: false,
        createdAtMs: now,
        updatedAtMs: now,
        pinned: false,
        archived: false,
        status: "streaming",
        messages: [action.userMsg, action.replyMsg],
        projectId: d.projectId,
        groupId: d.groupId,
      };
      const activeRuns = new Set(state.activeRuns);
      activeRuns.add(session.id);
      return {
        ...state,
        sessions: [session, ...state.sessions],
        draft: null,
        selection: { kind: "session", sessionId: session.id },
        activeRuns,
      };
    }

    case "session/patchMeta":
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };

    case "session/archive": {
      const sessions = state.sessions.map((s) => (s.id === action.id ? { ...s, archived: action.archived } : s));
      let { draft, selection } = state;
      // Archiving the selected session falls back to the most recent
      // NON-archived session, else the draft.
      if (action.archived && selection.kind === "session" && selection.sessionId === action.id) {
        const next = mostRecent(sessions.filter((s) => s.id !== action.id && !s.archived));
        if (next) selection = { kind: "session", sessionId: next.id };
        else {
          draft = draft ?? { text: "" };
          selection = { kind: "draft" };
        }
      }
      return { ...state, sessions, draft, selection };
    }

    case "session/remove": {
      const sessions = state.sessions.filter((s) => s.id !== action.id);
      let { draft, selection } = state;
      // Deleting the selected session falls back to the most recent remaining
      // session INCLUDING archived ones (asymmetric with archive, deliberately).
      if (selection.kind === "session" && selection.sessionId === action.id) {
        if (sessions.length === 0) {
          draft = draft ?? { text: "" };
          selection = { kind: "draft" };
        } else {
          const next = mostRecent(sessions);
          if (next) selection = { kind: "session", sessionId: next.id };
        }
      }
      const queues = { ...state.queues };
      delete queues[action.id];
      const activeRuns = new Set(state.activeRuns);
      activeRuns.delete(action.id);
      return { ...state, sessions, draft, selection, queues, activeRuns };
    }

    case "run/start": {
      const sessions = state.sessions.map((s) =>
        s.id === action.sessionId
          ? {
              ...s,
              status: "streaming" as const,
              updatedAtMs: Date.now(),
              messages: [...s.messages, action.userMsg, action.replyMsg],
            }
          : s,
      );
      const activeRuns = new Set(state.activeRuns);
      activeRuns.add(action.sessionId);
      return { ...state, sessions, activeRuns };
    }

    case "run/finish": {
      // Unread only when backgrounded and unarchived, on every outcome
      // including aborted; the sweep touches only messages carrying the
      // streaming flag.
      const backgrounded = state.selection.kind !== "session" || state.selection.sessionId !== action.sessionId;
      const sessions = state.sessions.map((s) => {
        if (s.id !== action.sessionId) return s;
        return {
          ...s,
          status: action.outcome === "error" ? ("error" as const) : ("idle" as const),
          ...(backgrounded && !s.archived ? { unreadAtMs: Date.now() } : {}),
          messages: s.messages.map((m) =>
            m.streaming
              ? {
                  ...m,
                  streaming: false,
                  blocks: m.blocks.map((b) =>
                    b.kind === "tool" && b.status === "running" ? { ...b, status: "done" as const } : b,
                  ),
                }
              : m,
          ),
        };
      });
      const activeRuns = new Set(state.activeRuns);
      activeRuns.delete(action.sessionId);
      return { ...state, sessions, activeRuns };
    }

    case "block/append":
      return patchMessageBlocks(state, action.sessionId, action.messageId, (blocks) => [...blocks, action.block]);

    case "block/patch":
      return patchMessageBlocks(state, action.sessionId, action.messageId, (blocks) =>
        blocks.map((b) => (b.id === action.blockId ? action.patch(b) : b)),
      );

    case "queue/push": {
      const prev = state.queues[action.sessionId];
      return withQueue(state, action.sessionId, [...(prev?.messages ?? []), action.text], prev?.paused ?? false);
    }

    case "queue/remove": {
      const prev = state.queues[action.sessionId];
      if (!prev || action.index < 0 || action.index >= prev.messages.length) return state;
      return withQueue(state, action.sessionId, prev.messages.filter((_, i) => i !== action.index), prev.paused);
    }

    case "queue/shift": {
      const prev = state.queues[action.sessionId];
      if (!prev || prev.messages.length === 0) return state;
      return withQueue(state, action.sessionId, prev.messages.slice(1), prev.paused);
    }

    case "queue/setPaused": {
      const prev = state.queues[action.sessionId];
      if ((prev?.paused ?? false) === action.paused) return state;
      return withQueue(state, action.sessionId, prev?.messages ?? [], action.paused);
    }

    case "project/save": {
      const exists = state.projects.some((p) => p.id === action.project.id);
      return {
        ...state,
        projects: exists
          ? state.projects.map((p) => (p.id === action.project.id ? action.project : p))
          : [...state.projects, action.project],
      };
    }

    case "project/remove":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        // Soft detach: members fall back to the unfiled list.
        sessions: state.sessions.map((s) => (s.projectId === action.id ? { ...s, projectId: undefined } : s)),
      };

    case "project/togglePin":
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.id ? { ...p, pinned: !p.pinned } : p)),
      };
  }
}

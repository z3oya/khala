/* Stable action surface — the only bridge from UI/engine to the reducer. */
import type { ChatMessage, Draft, PermissionDecision } from "../types";
import { startScript, uid, type RunRegistry } from "./engine";
import type { SessionStore } from "./store";

export interface SessionActions {
  send(raw: string): void;
  stop(): void;
  removeQueued(sessionId: string, index: number): void;
  resumeQueue(sessionId: string): void;
  newTask(projectId?: string, groupId?: string): void;
  updateDraftText(text: string): void;
  deleteSession(id: string): void;
  selectSession(id: string, expectedUnreadAtMs?: number): void;
  resolvePermission(sessionId: string, messageId: string, blockId: string, decision: PermissionDecision): void;
  togglePin(id: string): void;
  setArchived(id: string, archived: boolean): void;
  renameSession(id: string, title: string): void;
  markUnread(id: string): void;
  moveToProject(id: string, projectId?: string): void;
  saveProject(input: { id?: string; name: string }): void;
  deleteProject(id: string): void;
  toggleProjectPin(id: string): void;
}

export function createActions(store: SessionStore, registry: RunRegistry): SessionActions {
  return {
    /** Sends during a live run queue. Order pinned: unpause before the run
     * gate, or a paused queue can strand messages forever. */
    send(raw) {
      const text = raw.trim();
      if (!text) return;
      const st = store.getState();
      if (st.selection.kind === "session") {
        const id = st.selection.sessionId;
        if (st.queues[id]?.paused) store.dispatch({ type: "queue/setPaused", sessionId: id, paused: false });
        if (st.activeRuns.has(id)) {
          store.dispatch({ type: "queue/push", sessionId: id, text });
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: uid("m"),
        role: "user",
        atMs: Date.now(),
        blocks: [{ kind: "text", id: uid("b"), markdown: text }],
      };
      const replyId = uid("m");
      const replyMsg: ChatMessage = { id: replyId, role: "assistant", atMs: Date.now(), blocks: [], streaming: true };

      let sessionId: string;
      if (st.selection.kind === "draft") {
        if (!st.draft) return;
        sessionId = uid("s");
        store.dispatch({ type: "session/commitDraft", sessionId, text, userMsg, replyMsg });
      } else {
        sessionId = st.selection.sessionId;
        store.dispatch({ type: "run/start", sessionId, userMsg, replyMsg });
      }
      // Registry insert + script launch share the run-starting dispatch's tick.
      startScript(store, registry, sessionId, replyId);
    },

    stop() {
      const st = store.getState();
      if (st.selection.kind !== "session") return;
      const id = st.selection.sessionId;
      registry.cancel(id); // seed runs: registry miss, no-op
      store.dispatch({ type: "run/finish", sessionId: id, outcome: "aborted" });
      store.dispatch({ type: "queue/setPaused", sessionId: id, paused: true });
    },

    removeQueued: (sessionId, index) => store.dispatch({ type: "queue/remove", sessionId, index }),
    resumeQueue: (sessionId) => store.dispatch({ type: "queue/setPaused", sessionId, paused: false }),

    /** Args only seed a fresh draft; an existing draft is returned to untouched. */
    newTask(projectId, groupId) {
      const seed: Draft | undefined = projectId || groupId ? { text: "", projectId, groupId } : undefined;
      store.dispatch({ type: "selection/draft", seed });
    },

    updateDraftText: (text) => store.dispatch({ type: "selection/patchDraft", text }),

    /** Cancel the run first so waiters unwind; the reducer then purges
     * queue/runs and picks the fallback selection. */
    deleteSession(id) {
      registry.cancel(id);
      store.dispatch({ type: "session/remove", id });
    },

    selectSession: (id, expectedUnreadAtMs) =>
      store.dispatch({ type: "selection/set", sessionId: id, expectedUnreadAtMs }),

    resolvePermission(sessionId, messageId, blockId, decision) {
      store.dispatch({
        type: "block/patch",
        sessionId,
        messageId,
        blockId,
        patch: (b) => (b.kind === "permission" ? { ...b, decision } : b),
      });
      registry.resolve(sessionId, blockId, decision);
    },

    togglePin(id) {
      const s = store.getState().sessions.find((x) => x.id === id);
      if (s) store.dispatch({ type: "session/patchMeta", id, patch: { pinned: !s.pinned } });
    },

    setArchived: (id, archived) => store.dispatch({ type: "session/archive", id, archived }),

    renameSession(id, title) {
      const name = title.trim();
      if (!name) return;
      store.dispatch({ type: "session/patchMeta", id, patch: { title: name, titleOverridden: true } });
    },

    markUnread: (id) => store.dispatch({ type: "session/patchMeta", id, patch: { unreadAtMs: Date.now() } }),

    moveToProject: (id, projectId) => store.dispatch({ type: "session/patchMeta", id, patch: { projectId } }),

    saveProject(input) {
      const name = input.name.trim();
      if (!name) return;
      if (input.id) {
        const p = store.getState().projects.find((x) => x.id === input.id);
        if (p) store.dispatch({ type: "project/save", project: { ...p, name } });
        return;
      }
      store.dispatch({
        type: "project/save",
        project: { id: uid("p"), name, pinned: false, createdAtMs: Date.now() },
      });
    },

    deleteProject: (id) => store.dispatch({ type: "project/remove", id }),

    toggleProjectPin(id) {
      const p = store.getState().projects.find((x) => x.id === id);
      if (p) store.dispatch({ type: "project/save", project: { ...p, pinned: !p.pinned } });
    },
  };
}

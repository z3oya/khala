/* React binding: useSyncExternalStore over the session store + queue drain +
 * unmount cleanup; the return shape is the useMockChat hook API. */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createActions, type SessionActions } from "./actions";
import { createRunRegistry, SHOWCASE, type RunRegistry } from "./engine";
import { createInitialState, createSessionStore, type SessionStore } from "./store";
import { activeSession, archivedSessions, isStreaming, queuePausedFor, queuedFor } from "./selectors";

interface Binding {
  store: SessionStore;
  registry: RunRegistry;
  actions: SessionActions;
}

export function useSessionStore() {
  const ref = useRef<Binding | null>(null);
  if (ref.current === null) {
    const store = createSessionStore(createInitialState(SHOWCASE));
    const registry = createRunRegistry();
    ref.current = { store, registry, actions: createActions(store, registry) };
  }
  const { store, registry, actions } = ref.current;

  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => () => registry.cancelAll(), [registry]);

  const session = activeSession(state);
  const streaming = isStreaming(state, session);
  const queued = queuedFor(state, session);
  const queuePaused = queuePausedFor(state, session);

  /* Drain the SELECTED session's queue on each idle edge; stop pauses, send
   * or the resume button un-pauses. */
  useEffect(() => {
    if (session === null || streaming || queuePaused || queued.length === 0) return;
    const id = session.id;
    store.dispatch({ type: "queue/shift", sessionId: id });
    actions.send(queued[0]);
  }, [streaming, queued, queuePaused, session, actions, store]);

  return {
    sessions: state.sessions,
    projects: state.projects,
    groups: state.groups,
    archivedSessions: archivedSessions(state),
    draft: state.draft,
    activeSession: session,
    streaming,
    queued,
    queuePaused,
    send: actions.send,
    stop: actions.stop,
    removeQueued: actions.removeQueued,
    resumeQueue: actions.resumeQueue,
    newTask: actions.newTask,
    updateDraftText: actions.updateDraftText,
    deleteSession: actions.deleteSession,
    selectSession: actions.selectSession,
    resolvePermission: actions.resolvePermission,
    togglePin: actions.togglePin,
    setArchived: actions.setArchived,
    renameSession: actions.renameSession,
    markUnread: actions.markUnread,
    moveToProject: actions.moveToProject,
    saveProject: actions.saveProject,
    deleteProject: actions.deleteProject,
    toggleProjectPin: actions.toggleProjectPin,
  };
}

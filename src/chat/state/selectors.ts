/* Derived reads; computed per render in the binding. EMPTY_QUEUE is stable so
 * snapshot-derived arrays don't thrash re-renders. */
import type { Session } from "../types";
import type { SessionState } from "./types";

const EMPTY_QUEUE: string[] = [];

export function activeSession(state: SessionState): Session | null {
  const selection = state.selection;
  if (selection.kind !== "session") return null;
  return state.sessions.find((s) => s.id === selection.sessionId) ?? null;
}

/** Engine truth (activeRuns), not display status — the seeds split the two. */
export function isStreaming(state: SessionState, session: Session | null): boolean {
  return session !== null && state.activeRuns.has(session.id);
}

export function queuedFor(state: SessionState, session: Session | null): string[] {
  return session !== null ? (state.queues[session.id]?.messages ?? EMPTY_QUEUE) : EMPTY_QUEUE;
}

export function queuePausedFor(state: SessionState, session: Session | null): boolean {
  return session !== null ? (state.queues[session.id]?.paused ?? false) : false;
}

export function archivedSessions(state: SessionState): Session[] {
  return state.sessions.filter((s) => s.archived);
}

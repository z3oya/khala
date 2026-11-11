/* Task-list ordering + timeline date buckets. */
import type { Session } from "../types";

export const DAY = 86_400_000;

export function createdAtMs(s: Session): number {
  return s.messages[0]?.atMs ?? s.updatedAtMs;
}

export function compareTasks(a: Session, b: Session): number {
  const aRun = a.status === "streaming";
  const bRun = b.status === "streaming";
  if (aRun !== bRun) return aRun ? -1 : 1;
  if (aRun && bRun) return createdAtMs(b) - createdAtMs(a);
  return b.updatedAtMs - a.updatedAtMs;
}

export function compareRecent(a: Session, b: Session): number {
  return b.updatedAtMs - a.updatedAtMs;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(today: number): number {
  const d = new Date(today);
  const dow = (d.getDay() + 6) % 7;
  return today - dow * DAY;
}

export type TimelineKey =
  | "today"
  | "yesterday"
  | `d${number}`
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "earlier";

export function timelineKey(ms: number, today: number): TimelineKey {
  const day = startOfDay(ms);
  if (day === today) return "today";
  if (day === today - DAY) return "yesterday";
  if (day > today - 7 * DAY) return `d${Math.round((today - day) / DAY)}`;
  const weekStart = startOfWeek(today);
  if (day >= weekStart) return "thisWeek";
  if (day >= weekStart - 7 * DAY) return "lastWeek";
  const monthStart = new Date(today);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  if (day >= monthStart.getTime()) return "thisMonth";
  const prevMonth = new Date(monthStart);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  if (day >= prevMonth.getTime()) return "lastMonth";
  return "earlier";
}

export function orderedById<T extends { id: string }>(items: T[], savedOrder: string[]): T[] {
  const ids = new Set(items.map((i) => i.id));
  const saved = savedOrder.filter((id) => ids.has(id));
  const rest = items.filter((i) => !saved.includes(i.id));
  return [...saved, ...rest.map((i) => i.id)].map((id) => items.find((i) => i.id === id)!);
}

/** Sidebar scope keys: `p:{projectId}` for a project's children, "unfiled" for the footer zone. */
export const UNFILED_SCOPE = "unfiled";
export function projectScope(projectId: string): string {
  return `p:${projectId}`;
}

/**
 * Manual-order merge for one drag scope: sessions absent from the saved order
 * keep recency order (compareTasks, running-first) on top; the manual segment
 * follows the saved sequence verbatim — inside it manual order wins over
 * running-state so a dragged list stays put.
 */
export function mergeScopeOrder(sessions: Session[], savedOrder: string[]): Session[] {
  const ids = new Set(sessions.map((s) => s.id));
  const manual = [...new Set(savedOrder)].filter((id) => ids.has(id));
  if (manual.length === 0) return sessions.slice().sort(compareTasks);
  const manualSet = new Set(manual);
  const rest = sessions.filter((s) => !manualSet.has(s.id)).sort(compareTasks);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return [...rest, ...manual.map((id) => byId.get(id)!)];
}

export function dropPosOf(activeIndex: number, overIndex: number): "before" | "after" {
  return activeIndex > overIndex ? "before" : "after";
}

/** Strip stale/duplicate ids and empty scopes from persisted task orders.
 * Returns the cleaned map, or null when nothing changed. Empty sessions (not
 * yet loaded, or everything archived) keeps the persisted orders intact. */
export function reconcileTaskOrder(
  taskOrder: Record<string, string[]>,
  sessions: Session[],
): Record<string, string[]> | null {
  if (sessions.length === 0) return null;
  const liveByScope = new Map<string, Set<string>>();
  for (const s of sessions) {
    const key = s.projectId ? projectScope(s.projectId) : UNFILED_SCOPE;
    const live = liveByScope.get(key) ?? new Set<string>();
    live.add(s.id);
    liveByScope.set(key, live);
  }
  let dirty = false;
  const next: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(taskOrder)) {
    const live = liveByScope.get(key);
    if (!live) {
      dirty = true;
      continue;
    }
    const kept = [...new Set(ids.filter((id) => live.has(id)))];
    if (kept.length !== ids.length || kept.length === 0) dirty = true;
    if (kept.length) next[key] = kept;
  }
  return dirty ? next : null;
}

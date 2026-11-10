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

import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { Session } from "../types";
import type { TaskRowOps } from "./TaskRow";
import { MemoTaskRow } from "./TaskRow";
import { compareRecent, startOfDay, timelineKey, type TimelineKey } from "./ordering";

const PAGE = 20;

interface Props {
  sessions: Session[];
  ops: TaskRowOps;
}

export function TimelineView({ sessions, ops }: Props) {
  const { t } = useI18n();
  const [count, setCount] = useState(PAGE);
  const today = startOfDay(Date.now());

  const sorted = useMemo(() => sessions.slice().sort(compareRecent), [sessions]);
  const visible = sorted.slice(0, count);

  const buckets = useMemo(() => {
    const groups: [TimelineKey, Session[]][] = [];
    const map = new Map<TimelineKey, Session[]>();
    for (const s of visible) {
      const key = timelineKey(s.updatedAtMs, today);
      const list = map.get(key);
      if (list) list.push(s);
      else {
        const fresh = [s];
        map.set(key, fresh);
        groups.push([key, fresh]);
      }
    }
    return groups;
  }, [visible, today]);

  const heading = (key: TimelineKey): string => {
    if (key === "today") return t("timeToday");
    if (key === "yesterday") return t("timeYesterday");
    if (key === "thisWeek") return t("thisWeek");
    if (key === "lastWeek") return t("lastWeek");
    if (key === "thisMonth") return t("thisMonth");
    if (key === "lastMonth") return t("lastMonth");
    if (key === "earlier") return t("timeEarlier");
    return t("daysAgo").replace("{n}", key.slice(1));
  };

  return (
    <>
      {buckets.map(([key, items]) => (
        <div key={key} className="sb-zone" data-testid="task-timeline-group" data-key={key}>
          <div className="sb-zone-label static" data-testid="task-date-heading" data-key={key}>
            <span className="sb-zone-name">{heading(key)}</span>
            <span className="sb-zone-tag">{items.length}</span>
          </div>
          <div className="sb-zone-body">
            {items.map((s) => (
              <MemoTaskRow key={s.id} session={s} ops={ops} testid="task-item-timeline" />
            ))}
          </div>
        </div>
      ))}
      {visible.length < sorted.length && (
        <button type="button" className="show-more" data-testid="task-show-more" onClick={() => setCount((c) => c + PAGE)}>
          {t("showMore")}
        </button>
      )}
    </>
  );
}

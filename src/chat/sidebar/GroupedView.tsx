import { useMemo } from "react";
import { ChevronDown, ChevronRight, SquarePen } from "lucide-react";
import { useI18n } from "../i18n";
import type { Draft, GroupColor, Session, TaskGroup } from "../types";
import type { TaskRowOps } from "./TaskRow";
import { MemoTaskRow } from "./TaskRow";
import { compareTasks } from "./ordering";

const GROUP_COLORS: Record<GroupColor, string> = {
  gray: "var(--grp-gray)",
  red: "var(--grp-red)",
  orange: "var(--grp-orange)",
  yellow: "var(--grp-yellow)",
  green: "var(--grp-green)",
  blue: "var(--grp-blue)",
  purple: "var(--grp-purple)",
};

interface Props {
  sessions: Session[];
  groups: TaskGroup[];
  draft: Draft | null;
  collapsedGroups: string[];
  toggleGroupCollapsed: (id: string) => void;
  ops: TaskRowOps;
  onNewTask: (projectId?: string, groupId?: string) => void;
  onSelectDraft: () => void;
}

function DraftRow({ onSelect }: { onSelect: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="button"
      tabIndex={0}
      className="t-row t-draft"
      data-testid="task-draft-row"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="t-slot" aria-hidden>
        <SquarePen size={12} />
      </span>
      <span className="t-title t-draft-hint">{t("draftHint")}</span>
    </div>
  );
}

export function GroupedView({ sessions, groups, draft, collapsedGroups, toggleGroupCollapsed, ops, onNewTask, onSelectDraft }: Props) {
  const { t } = useI18n();

  const byGroup = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.groupId) continue;
      const list = map.get(s.groupId) ?? [];
      list.push(s);
      map.set(s.groupId, list);
    }
    for (const [key, list] of map) map.set(key, list.slice().sort(compareTasks));
    return map;
  }, [sessions]);

  const ungrouped = useMemo(() => sessions.filter((s) => !s.groupId).sort(compareTasks), [sessions]);

  const section = (id: string, name: string, color: GroupColor | null, members: Session[], withDraft: boolean) => {
    const collapsed = collapsedGroups.includes(id);
    const open = !collapsed;
    return (
      <div className="sb-zone" data-testid="task-group" data-id={id} data-open={open}>
        <button
          type="button"
          className="grp-head"
          data-testid="task-group-toggle"
          onClick={() => toggleGroupCollapsed(id)}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span className="grp-hash" style={color ? { color: GROUP_COLORS[color] } : undefined}>
            #
          </span>
          <span className="grp-name">{name}</span>
          <span className="grp-count" data-testid="task-group-count">
            {members.length}
          </span>
        </button>
        <div className="sb-collapse" data-open={open} inert={open ? undefined : true} aria-hidden={!open}>
          <div
            className="sb-collapse-inner grp-body"
            style={color ? { ["--grp-color" as string]: GROUP_COLORS[color] } : undefined}
          >
            {withDraft && <DraftRow onSelect={onSelectDraft} />}
            {members.map((s) => (
              <MemoTaskRow key={s.id} session={s} ops={ops} testid="task-item-grouped" />
            ))}
            {members.length === 0 && !withDraft && (
              <button
                type="button"
                className="show-more"
                data-testid="task-group-new"
                onClick={() => onNewTask(undefined, id)}
              >
                {t("newInGroup")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {groups.map((g) => section(g.id, g.name, g.color, byGroup.get(g.id) ?? [], draft?.groupId === g.id))}
      {section("ungrouped", t("ungrouped"), null, ungrouped, draft !== null && !draft.groupId)}
    </>
  );
}

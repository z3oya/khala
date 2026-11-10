/* Projects view: pinned strip → project tree → unfiled tasks. */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Ellipsis, Folder, FolderOpen, Plus } from "lucide-react";
import { useI18n } from "../i18n";
import type { Project, Session } from "../types";
import type { TaskRowOps } from "./TaskRow";
import { MemoTaskRow } from "./TaskRow";
import { compareTasks, orderedById } from "./ordering";

const PAGE = 5;
const PINNED_LIMIT = 20;

interface Props {
  sessions: Session[];
  projects: Project[];
  expanded: Record<string, boolean>;
  order: string[];
  onOrderChange: (order: string[]) => void;
  setExpanded: (projectId: string, open: boolean) => void;
  ops: TaskRowOps;
  onNewTask: (projectId?: string) => void;
  onNewProject: () => void;
  onEditProject: (id: string) => void;
  onToggleProjectPin: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

function ShowMore({ onClick, testid, label }: { onClick: () => void; testid: string; label: string }) {
  return (
    <button type="button" className="show-more" data-testid={testid} onClick={onClick}>
      {label}
    </button>
  );
}

function ProjectChildren({ tasks, ops }: { tasks: Session[]; ops: TaskRowOps }) {
  const { t } = useI18n();
  const [count, setCount] = useState(PAGE);
  const visible = tasks.slice(0, count);
  return (
    <>
      {visible.map((s) => (
        <MemoTaskRow key={s.id} session={s} ops={ops} />
      ))}
      {visible.length < tasks.length && (
        <ShowMore
          testid="task-show-more"
          label={t("showMore")}
          onClick={() => setCount((c) => c + PAGE)}
        />
      )}
    </>
  );
}

export function ProjectTree({
  sessions,
  projects,
  expanded,
  order,
  onOrderChange,
  setExpanded,
  ops,
  onNewTask,
  onNewProject,
  onEditProject,
  onToggleProjectPin,
  onDeleteProject,
}: Props) {
  const { t } = useI18n();

  const byProject = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.projectId) continue;
      const list = map.get(s.projectId) ?? [];
      list.push(s);
      map.set(s.projectId, list);
    }
    for (const [key, list] of map) map.set(key, list.slice().sort(compareTasks));
    return map;
  }, [sessions]);

  const ordered = useMemo(() => {
    const list = orderedById(projects, order);
    return [...list.filter((p) => p.pinned), ...list.filter((p) => !p.pinned)];
  }, [projects, order]);

  useEffect(() => {
    const want = projects.map((p) => p.id);
    if (want.some((id) => !order.includes(id))) {
      onOrderChange([...order.filter((id) => want.includes(id)), ...want.filter((id) => !order.includes(id))]);
    }
  }, [projects, order, onOrderChange]);

  const pinned = useMemo(() => sessions.filter((s) => s.pinned).sort(compareTasks), [sessions]);
  const unfiled = useMemo(() => sessions.filter((s) => !s.projectId).sort(compareTasks), [sessions]);

  const [showAllPinned, setShowAllPinned] = useState(false);
  const visiblePinned = showAllPinned ? pinned : pinned.slice(0, PINNED_LIMIT);

  const projectMenu = (p: Project, open: boolean) => [
    { key: "new-task", label: t("newInProjectTitle"), action: () => onNewTask(p.id) },
    { key: "edit", label: t("editProject"), action: () => onEditProject(p.id) },
    {
      key: "toggle-pin",
      label: p.pinned ? t("unpin") : t("pin"),
      action: () => onToggleProjectPin(p.id),
    },
    {
      key: "toggle",
      label: open ? t("collapseProject") : t("expandProject"),
      action: () => setExpanded(p.id, !open),
    },
    { key: "delete-project", label: t("deleteProjectTitle"), danger: true, action: () => onDeleteProject(p.id) },
  ];

  return (
    <>
      {pinned.length > 0 && (
        <div className="sb-zone" data-testid="task-pinned-zone">
          <div className="sb-zone-label static" data-testid="task-pinned-label">
            <span className="sb-zone-name">{t("pinned")}</span>
          </div>
          <div className="sb-zone-body">
            {visiblePinned.map((s) => (
              <MemoTaskRow key={s.id} session={s} ops={ops} testid="task-item-pinned" />
            ))}
            {pinned.length > PINNED_LIMIT && !showAllPinned && (
              <ShowMore testid="task-show-all" label={t("showAll")} onClick={() => setShowAllPinned(true)} />
            )}
          </div>
        </div>
      )}

      <div className="sb-zone" data-testid="task-project-zone">
        <div className="sb-zone-head">
          <div className="sb-zone-label static" data-testid="task-project-zone-label">
            <span className="sb-zone-name">{t("projects")}</span>
          </div>
          <button
            type="button"
            className="sb-zone-add"
            data-testid="task-project-new-entry"
            title={t("newProject")}
            aria-label={t("newProject")}
            onClick={onNewProject}
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="sb-zone-body">
          {ordered.map((p) => {
            const tasks = byProject.get(p.id) ?? [];
            const open = expanded[p.id] !== false;
            const unread = tasks.some((s) => s.unreadAtMs !== undefined);
            return (
              <div key={p.id} className="sb-project" data-testid="task-project" data-id={p.id} data-open={open}>
                <div className="p-row" data-testid="task-project-row">
                  <button
                    type="button"
                    className="p-head"
                    data-testid="task-project-toggle"
                    onClick={() => setExpanded(p.id, !open)}
                    onContextMenu={(e) => ops.onCtx(e, projectMenu(p, open))}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {open ? <FolderOpen size={16} /> : <Folder size={16} />}
                    <span className="p-name" title={p.path ? `${p.name} · ${p.path}` : p.name}>
                      {p.name}
                    </span>
                    {unread && <span className="dot dot-unread" data-testid="task-project-unread" />}
                  </button>
                  <span className="p-actions">
                    <button
                      type="button"
                      className="sb-icon-mini"
                      data-testid="task-project-more"
                      title={t("editProject")}
                      aria-label={t("editProject")}
                      onClick={(e) => {
                        e.stopPropagation();
                        ops.onCtx(e, projectMenu(p, open));
                      }}
                    >
                      <Ellipsis size={13} />
                    </button>
                    <button
                      type="button"
                      className="sb-icon-mini"
                      data-testid="task-project-new"
                      data-id={p.id}
                      title={t("newInProjectTitle")}
                      aria-label={`${t("newInProjectTitle")}: ${p.name}`}
                      onClick={() => onNewTask(p.id)}
                    >
                      <Plus size={12} />
                    </button>
                  </span>
                </div>
                <div className="sb-collapse sb-collapse-tree" data-open={open} inert={open ? undefined : true} aria-hidden={!open}>
                  <div className="sb-collapse-inner p-tasks">
                    {tasks.length > 0 ? (
                      <ProjectChildren tasks={tasks} ops={ops} />
                    ) : (
                      <div className="p-empty" data-testid="task-project-empty">
                        {t("newInProjectTitle")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sb-zone" data-testid="task-unfiled-zone">
        <div className="sb-zone-head">
          <div className="sb-zone-label static" data-testid="task-unfiled-label">
            <span className="sb-zone-name">{t("tasks")}</span>
          </div>
          <button
            type="button"
            className="sb-zone-add"
            data-testid="task-unfiled-new"
            title={t("newTask")}
            aria-label={t("newTask")}
            onClick={() => onNewTask()}
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="sb-zone-body">
          {unfiled.length > 0 ? (
            unfiled.map((s) => <MemoTaskRow key={s.id} session={s} ops={ops} testid="task-item-unfiled" />)
          ) : (
            <div className="p-empty" data-testid="task-unfiled-empty">
              {t("newTask")}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* Projects view: pinned strip → project tree → unfiled tasks. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, Ellipsis, Folder, FolderOpen, Plus } from "lucide-react";
import { useI18n } from "../i18n";
import type { Project, Session } from "../types";
import type { TaskRowOps } from "./TaskRow";
import { MemoTaskRow } from "./TaskRow";
import { SortableTaskRow } from "./SortableTaskRow";
import {
  UNFILED_SCOPE,
  compareTasks,
  dropPosOf,
  mergeScopeOrder,
  orderedById,
  projectScope,
  reconcileTaskOrder,
} from "./ordering";

/* Sensor options must stay module-level: inline objects rebuild activators
 * every render and defeat the row memo. */
const POINTER_OPTIONS = { activationConstraint: { distance: 6 } };

const EMPTY_ORDER: string[] = [];

/* x locked (sideways transforms widen the overflow-y list), y clamped to the
 * scope container so the ghost never visually leaves its list. */
const clampToScope =
  (getContainer: () => HTMLElement | null): Modifier =>
  ({ transform, draggingNodeRect, activeNodeRect }) => {
    const nodeRect = draggingNodeRect ?? activeNodeRect;
    const bounds = getContainer()?.getBoundingClientRect();
    if (!nodeRect || !bounds) return { ...transform, x: 0 };
    const minY = bounds.top - nodeRect.top;
    const maxY = bounds.bottom - nodeRect.bottom;
    return { ...transform, x: 0, y: Math.min(Math.max(transform.y, minY), maxY) };
  };

const GHOST_OPS: TaskRowOps = {
  activeId: null,
  onSelect: () => {},
  onTogglePin: () => {},
  onArchive: () => {},
  onMarkUnread: () => {},
  onRename: () => {},
  onDelete: () => {},
  onCtx: () => {},
};

/* closestCenter inside the container (pointerWithin misses the 1px row gaps),
 * no target once the pointer leaves — otherwise distant-row commits land for
 * drops that visibly fell outside the list. */
const scopeCollision =
  (getContainer: () => HTMLElement | null): CollisionDetection =>
  (args) => {
    const pointer = args.pointerCoordinates;
    const container = getContainer();
    if (pointer && container) {
      const r = container.getBoundingClientRect();
      const inside =
        pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
      if (!inside) return [];
    }
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
  };

interface Props {
  sessions: Session[];
  projects: Project[];
  expanded: Record<string, boolean>;
  order: string[];
  onOrderChange: (order: string[]) => void;
  taskOrder: Record<string, string[]>;
  onTaskOrderChange: (next: Record<string, string[]>) => void;
  setExpanded: (projectId: string, open: boolean) => void;
  ops: TaskRowOps;
  onNewTask: (projectId?: string) => void;
  onNewProject: () => void;
  onEditProject: (id: string) => void;
  onToggleProjectPin: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

function SortableTasks({
  scope,
  sessions,
  savedOrder,
  onCommit,
  ops,
  testid,
  className,
}: {
  scope: string;
  sessions: Session[];
  savedOrder: string[];
  onCommit: (ids: string[]) => void;
  ops: TaskRowOps;
  testid?: string;
  className?: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS));
  const ordered = useMemo(() => mergeScopeOrder(sessions, savedOrder), [sessions, savedOrder]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const getContainer = useCallback(() => containerRef.current, []);
  const collision = useMemo(() => scopeCollision(getContainer), [getContainer]);
  const modifiers = useMemo(() => [clampToScope(getContainer)], [getContainer]);
  const [drag, setDrag] = useState<{ activeId: string; overId: string | null; width: number } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [drag?.activeId]);

  const activeIdx = drag ? ordered.findIndex((s) => s.id === drag.activeId) : -1;
  const overIdx = drag?.overId ? ordered.findIndex((s) => s.id === drag.overId) : -1;
  const dropPos =
    activeIdx >= 0 && overIdx >= 0 && activeIdx !== overIdx
      ? dropPosOf(activeIdx, overIdx)
      : undefined;
  const activeSession = drag ? ordered.find((s) => s.id === drag.activeId) : undefined;

  const commit = (activeId: string, overId: string) => {
    const ids = ordered.map((s) => s.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    onCommit(ids);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      modifiers={modifiers}
      onDragStart={({ active }) => {
        // Ghost width = the dragged row's own rect: the container includes its
        // left-rail padding, which would push the ghost past the right edge.
        const width =
          containerRef.current?.querySelector(`.t-row[data-id="${String(active.id)}"]`)?.getBoundingClientRect()
            .width ?? 0;
        setDrag({ activeId: String(active.id), overId: null, width });
      }}
      onDragOver={({ over }) => {
        setDrag((d) => (d ? { ...d, overId: over ? String(over.id) : null } : d));
      }}
      onDragEnd={({ active, over }) => {
        setDrag(null);
        if (!over) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        if (activeId === overId) return;
        // Structural isolation makes this unreachable today; guards a future
        // shared context against regressing the scope boundary.
        if (active.data.current?.scope !== scope || over.data.current?.scope !== scope) return;
        commit(activeId, overId);
      }}
      onDragCancel={() => setDrag(null)}
    >
      <SortableContext items={ordered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={containerRef}
          className={`sort-list${className ? ` ${className}` : ""}`}
          data-sort-scope={scope}
          data-drag-active={drag ? true : undefined}
        >
          {ordered.map((s) => (
            <SortableTaskRow key={s.id} session={s} scope={scope} ops={ops} testid={testid} />
          ))}
          {/* Test observable only; the visual indicator lives on the row. */}
          {drag && dropPos && (
            <div
              data-testid="task-drop-indicator"
              data-over-id={drag.overId}
              data-drop-position={dropPos}
              aria-hidden
            />
          )}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {drag && activeSession ? (
          <div data-drag-ghost style={{ width: drag.width, pointerEvents: "none" }}>
            <MemoTaskRow session={activeSession} ops={GHOST_OPS} testid="task-item-ghost" sortable={{ dragging: true }} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function ProjectTree({
  sessions,
  projects,
  expanded,
  order,
  onOrderChange,
  taskOrder,
  onTaskOrderChange,
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

  useEffect(() => {
    const next = reconcileTaskOrder(taskOrder, sessions);
    if (next) onTaskOrderChange(next);
  }, [sessions, taskOrder, onTaskOrderChange]);

  const commitScope = (scope: string, ids: string[]) =>
    onTaskOrderChange({ ...taskOrder, [scope]: ids });

  const pinned = useMemo(() => sessions.filter((s) => s.pinned).sort(compareTasks), [sessions]);
  const unfiled = useMemo(() => sessions.filter((s) => !s.projectId).sort(compareTasks), [sessions]);

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
            {pinned.map((s) => (
              <MemoTaskRow key={s.id} session={s} ops={ops} testid="task-item-pinned" />
            ))}
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
                  {tasks.length > 0 ? (
                    <SortableTasks
                      scope={projectScope(p.id)}
                      sessions={tasks}
                      savedOrder={taskOrder[projectScope(p.id)] ?? EMPTY_ORDER}
                      onCommit={(ids) => commitScope(projectScope(p.id), ids)}
                      ops={ops}
                      className="sb-collapse-inner p-tasks"
                    />
                  ) : (
                    <div className="sb-collapse-inner p-tasks">
                      <div className="p-empty" data-testid="task-project-empty">
                        {t("newInProjectTitle")}
                      </div>
                    </div>
                  )}
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
            <SortableTasks
              scope={UNFILED_SCOPE}
              sessions={unfiled}
              savedOrder={taskOrder[UNFILED_SCOPE] ?? EMPTY_ORDER}
              onCommit={(ids) => commitScope(UNFILED_SCOPE, ids)}
              ops={ops}
              testid="task-item-unfiled"
            />
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

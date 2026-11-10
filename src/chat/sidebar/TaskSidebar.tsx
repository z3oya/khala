/* Task sidebar v4 (ZCodium project/task list): nav rows, view switcher,
 * three views, footer. Collapses stay mounted behind grid-rows + inert. */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AppWindow, Bot, Check, ListFilter, Plus, Puzzle, Search, Settings, Workflow } from "lucide-react";
import type { CtxItem } from "../ChatContextMenu";
import { useI18n, type MsgKey } from "../i18n";
import type { Draft, Project, Session, TaskGroup } from "../types";
import { ChatContextMenu } from "../ChatContextMenu";
import { useSidebarResize } from "../useSidebarResize";
import { GroupedView } from "./GroupedView";
import { ProjectTree } from "./ProjectTree";
import { TimelineView } from "./TimelineView";
import { ProjectEditorDialog, RenameDialog } from "./dialogs";
import type { TaskRowOps } from "./TaskRow";
import { useScrollMask } from "./useScrollMask";
import type { SidebarView, TaskSidebarPrefs } from "./useTaskSidebarPrefs";

interface Props {
  sessions: Session[];
  projects: Project[];
  groups: TaskGroup[];
  draft: Draft | null;
  activeId: string | null;
  prefs: TaskSidebarPrefs;
  onPrefsChange: (patch: Partial<TaskSidebarPrefs>) => void;
  setView: (view: SidebarView) => void;
  setExpanded: (projectId: string, open: boolean) => void;
  toggleGroupCollapsed: (id: string) => void;
  onSelect: (id: string, unreadAtMs?: number) => void;
  onSelectDraft: () => void;
  onNewTask: (projectId?: string, groupId?: string) => void;
  onDeleteSession: (id: string) => void;
  onTogglePin: (id: string) => void;
  onArchive: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onMarkUnread: (id: string) => void;
  onSaveProject: (input: { id?: string; name: string }) => void;
  onDeleteProject: (id: string) => void;
  onToggleProjectPin: (id: string) => void;
  onOpenSettings: () => void;
  onOpenApps: () => void;
  settingsJustClosed: boolean;
  width: number;
  collapsed: boolean;
  dragging: boolean;
  onWidth: (width: number) => void;
  onDragging: (dragging: boolean) => void;
}

const VIEWS: [SidebarView, MsgKey][] = [
  ["projects", "viewByProject"],
  ["grouped", "viewByGroup"],
  ["timeline", "viewByUpdated"],
];

export function TaskSidebar(props: Props) {
  const { t } = useI18n();
  const {
    sessions,
    projects,
    groups,
    draft,
    activeId,
    prefs,
    onPrefsChange,
    setView,
    setExpanded,
    toggleGroupCollapsed,
    onSelect,
    onSelectDraft,
    onNewTask,
    onDeleteSession,
    onTogglePin,
    onArchive,
    onRenameSession,
    onMarkUnread,
    onSaveProject,
    onDeleteProject,
    onToggleProjectPin,
    onOpenSettings,
    onOpenApps,
    settingsJustClosed,
    width,
    collapsed,
    dragging,
    onWidth,
    onDragging,
  } = props;

  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [editorProject, setEditorProject] = useState<Project | null | undefined>(undefined);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const startResize = useSidebarResize({ width, onWidth, onDragging });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mask = useScrollMask(scrollRef);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("wheel", close, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("wheel", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  const openCtx = useCallback((e: ReactMouseEvent, items: CtxItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items });
  }, []);
  const closeCtx = useCallback(() => setCtx(null), []);

  const live = sessions.filter((s) => !s.archived);
  const ops: TaskRowOps = {
    activeId,
    onSelect,
    onTogglePin,
    onArchive,
    onMarkUnread,
    onRename: setRenameId,
    onDelete: onDeleteSession,
    onCtx: openCtx,
  };

  const renameTarget = renameId !== null ? (sessions.find((s) => s.id === renameId) ?? null) : null;

  return (
    <aside
      className={`chat-sidebar${dragging ? " dragging" : ""}`}
      style={{ width: collapsed ? 0 : width }}
      data-testid="chat-sidebar"
      data-task-count={live.length}
      data-project-count={projects.length}
      data-sidebar-view={prefs.view}
      data-width={Math.round(collapsed ? 0 : width)}
    >
      <div className="chat-sidebar-inner">
        <nav className="sb-nav" data-testid="task-nav">
          <button type="button" className="sb-nav-new" data-testid="task-nav-new" onClick={() => onNewTask()}>
            <Plus size={14} />
            <span className="sb-nav-new-label">{t("newTask")}</span>
            <kbd className="sb-kbd" aria-hidden>
              Ctrl N
            </kbd>
          </button>
          <button type="button" className="sb-nav-row" data-testid="task-nav-automation" title={`${t("automation")} (mock)`}>
            <Workflow size={13} />
            {t("automation")}
          </button>
          <button type="button" className="sb-nav-row" data-testid="task-nav-apps" onClick={onOpenApps}>
            <AppWindow size={13} />
            {t("apps")}
          </button>
          <button type="button" className="sb-nav-row" data-testid="task-nav-plugins" title={`${t("plugins")} (mock)`}>
            <Puzzle size={13} />
            {t("plugins")}
          </button>
          <button type="button" className="sb-nav-row" data-testid="task-nav-assistant" title={`${t("assistant")} (mock)`}>
            <Bot size={13} />
            {t("assistant")}
          </button>
        </nav>

        <div className="sb-head">
          <span className="sb-head-title" data-testid="task-head-title">
            {t("tasks")}
          </span>
          <div className="sb-head-actions">
            <button
              type="button"
              className="sb-icon-btn"
              data-testid="task-search"
              title={t("searchTitle")}
              aria-label={t("searchTitle")}
            >
              <Search size={14} />
            </button>
            <div className="sb-filter" ref={filterRef}>
              <button
                type="button"
                className="sb-icon-btn"
                data-testid="task-view-filter"
                title={t("viewFilterTitle")}
                aria-label={t("viewFilterTitle")}
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((o) => !o)}
              >
                <ListFilter size={14} />
              </button>
              {filterOpen && (
                <div className="chip-menu sb-filter-menu" data-testid="task-view-menu" role="listbox">
                  {VIEWS.map(([view, key]) => (
                    <button
                      key={view}
                      type="button"
                      className={`chip-menu-item${prefs.view === view ? " active" : ""}`}
                      data-testid="task-view-option"
                      data-view={view}
                      role="option"
                      aria-selected={prefs.view === view}
                      onClick={() => {
                        setView(view);
                        setFilterOpen(false);
                      }}
                    >
                      {t(key)}
                      {prefs.view === view && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sb-scroll" ref={scrollRef} data-scroll-mask={mask} data-testid="task-scroll">
          {prefs.view === "projects" && (
            <ProjectTree
              sessions={live}
              projects={projects}
              expanded={prefs.expanded}
              order={prefs.order}
              onOrderChange={(order) => onPrefsChange({ order })}
              setExpanded={setExpanded}
              ops={ops}
              onNewTask={(projectId) => onNewTask(projectId)}
              onNewProject={() => setEditorProject(null)}
              onEditProject={(id) => setEditorProject(projects.find((p) => p.id === id) ?? null)}
              onToggleProjectPin={onToggleProjectPin}
              onDeleteProject={onDeleteProject}
            />
          )}
          {prefs.view === "grouped" && (
            <GroupedView
              sessions={live}
              groups={groups}
              draft={draft}
              collapsedGroups={prefs.collapsedGroups}
              toggleGroupCollapsed={toggleGroupCollapsed}
              ops={ops}
              onNewTask={onNewTask}
              onSelectDraft={onSelectDraft}
            />
          )}
          {prefs.view === "timeline" && <TimelineView sessions={live} ops={ops} />}
        </div>

        <div className="sb-footer">
          <button
            type="button"
            className="sb-settings"
            data-testid="chat-settings"
            data-gear={settingsJustClosed ? "off" : undefined}
            title={t("openSettings")}
            aria-label={t("openSettings")}
            onClick={onOpenSettings}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div
        className="sb-resizer"
        data-testid="chat-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resizeSidebar")}
        onPointerDown={(e) => {
          if (!collapsed) startResize(e);
        }}
      />

      {ctx && <ChatContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={closeCtx} />}

      {renameTarget && (
        <RenameDialog
          session={renameTarget}
          onSubmit={(title) => onRenameSession(renameTarget.id, title)}
          onClose={() => setRenameId(null)}
        />
      )}
      {editorProject !== undefined && (
        <ProjectEditorDialog
          project={editorProject ?? undefined}
          onSave={onSaveProject}
          onDelete={onDeleteProject}
          onClose={() => setEditorProject(undefined)}
        />
      )}
    </aside>
  );
}

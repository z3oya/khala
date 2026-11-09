/*
 * Sidebar: project zone (grouped by working directory) + standalone chats,
 * a context menu on every entity, drag-resizable right edge.
 */
import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AppWindow, ChevronDown, ChevronRight, Folder, Plus, Puzzle, Settings, Workflow } from "lucide-react";
import type { Session } from "./types";
import { relTime, useI18n } from "./i18n";
import { ChatContextMenu, type CtxItem } from "./ChatContextMenu";
import { useSidebarResize } from "./useSidebarResize";

interface Props {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewProject: (dir: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onOpenApps: () => void;
  width: number;
  collapsed: boolean;
  dragging: boolean;
  onWidth: (width: number) => void;
  onDragging: (dragging: boolean) => void;
}

function StatusMarker({ session }: { session: Session }) {
  const { lang } = useI18n();
  if (session.status === "streaming") return <span className="dot dot-live" />;
  if (session.status === "error") return <span className="dot dot-err" />;
  if (session.status === "unread") return <span className="dot dot-unread" />;
  return <span className="sb-time">{relTime(session.updatedAtMs, lang)}</span>;
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onNewProject,
  onDeleteSession,
  onOpenSettings,
  onOpenApps,
  width,
  collapsed,
  dragging,
  onWidth,
  onDragging,
}: Props) {
  const { t } = useI18n();
  const [closedProjects, setClosedProjects] = useState<Set<string>>(new Set());
  const [closedZones, setClosedZones] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const startResize = useSidebarResize({ width, onWidth, onDragging });
  const closeCtx = useCallback(() => setCtx(null), []);

  // stopPropagation: chat-root suppresses native menus; entities opt into theirs.
  const openCtx = (e: ReactMouseEvent, items: CtxItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  const zoneOpen = (key: string) => !closedZones.has(key);
  const toggleZone = (key: string) => {
    setClosedZones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const projects = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (s.kind !== "project" || !s.dir) continue;
      const list = map.get(s.dir) ?? [];
      list.push(s);
      map.set(s.dir, list);
    }
    return [...map.entries()];
  }, [sessions]);

  const recentChats = useMemo(
    () =>
      sessions
        .filter((s) => s.kind === "chat")
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    [sessions],
  );

  const toggleProject = (dir: string) => {
    setClosedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const sessionCtx = (session: Session): CtxItem[] => [
    { key: "open", label: t("open"), action: () => onSelect(session.id) },
    { key: "rename", label: t("rename"), disabled: true },
    { key: "delete", label: t("delete"), danger: true, action: () => onDeleteSession(session.id) },
  ];

  const renderItem = (session: Session, nested: boolean) => {
    const active = session.id === activeId;
    return (
      <button
        key={session.id}
        type="button"
        className={`sb-item${active ? " active" : ""}${nested ? " nested" : ""}`}
        data-testid="chat-session-item"
        data-id={session.id}
        data-kind={session.kind}
        data-status={session.status}
        data-active={active}
        onClick={() => onSelect(session.id)}
        onContextMenu={(e) => openCtx(e, sessionCtx(session))}
      >
        <span className="sb-item-title" title={session.title}>
          {session.title}
        </span>
        <StatusMarker session={session} />
      </button>
    );
  };

  return (
    <aside
      className={`chat-sidebar${dragging ? " dragging" : ""}`}
      style={{ width: collapsed ? 0 : width }}
      data-testid="chat-sidebar"
      data-session-count={sessions.length}
      data-width={Math.round(collapsed ? 0 : width)}
    >
      <div className="chat-sidebar-inner">
        <div className="sb-action-col" data-testid="chat-action-col">
          <button
            type="button"
            className="sb-action"
            data-testid="chat-new-session"
            onClick={onNew}
          >
            <Plus size={14} />
            {t("newSession")}
          </button>
          <button
            type="button"
            className="sb-action"
            data-testid="chat-new-automation"
            title={`${t("automation")} (mock)`}
          >
            <Workflow size={13} />
            {t("automation")}
          </button>
          <button
            type="button"
            className="sb-action"
            data-testid="chat-new-app"
            title={t("apps")}
            onClick={onOpenApps}
          >
            <AppWindow size={13} />
            {t("apps")}
          </button>
          <button
            type="button"
            className="sb-action"
            data-testid="chat-new-plugin"
            title={`${t("plugins")} (mock)`}
          >
            <Puzzle size={13} />
            {t("plugins")}
          </button>
        </div>

        <div className="sb-scroll">
          <div
            className="sb-zone"
            data-testid="chat-project-zone"
            data-open={zoneOpen("project")}
          >
            <button
              type="button"
              className="sb-zone-label"
              data-testid="chat-project-zone-toggle"
              onClick={() => toggleZone("project")}
              onContextMenu={(e) =>
                openCtx(e, [
                  {
                    key: "expand-all",
                    label: t("expandAllProjects"),
                    action: () => setClosedProjects(new Set()),
                  },
                  {
                    key: "collapse-all",
                    label: t("collapseAllProjects"),
                    action: () => setClosedProjects(new Set(projects.map(([dir]) => dir))),
                  },
                ])
              }
              aria-expanded={zoneOpen("project")}
            >
              <span className="sb-zone-name">
                <ChevronRight size={11} className={`chev${zoneOpen("project") ? " open" : ""}`} />
                {t("projects")}
              </span>
              <span className="sb-zone-tag">{projects.length}</span>
            </button>
            {zoneOpen("project") &&
              projects.map(([dir, items]) => {
                const open = !closedProjects.has(dir);
                return (
                  <div
                    key={dir}
                    className="sb-project"
                    data-testid="chat-project-item"
                    data-dir={dir}
                    data-open={open}
                  >
                    <div className="sb-project-row">
                      <button
                        type="button"
                        className="sb-project-head"
                        data-testid="chat-project-toggle"
                        onClick={() => toggleProject(dir)}
                        onContextMenu={(e) =>
                          openCtx(e, [
                            { key: "new-in-project", label: t("newInProject"), action: () => onNewProject(dir) },
                            { key: "rename", label: t("rename"), disabled: true },
                            {
                              key: "toggle",
                              label: open ? t("collapseProject") : t("expandProject"),
                              action: () => toggleProject(dir),
                            },
                          ])
                        }
                        aria-expanded={open}
                      >
                        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Folder size={12} />
                        <span className="sb-project-dir" title={dir}>
                          {dir}
                        </span>
                        <span className="sb-project-count">{items.length}</span>
                      </button>
                      <button
                        type="button"
                        className="sb-project-new"
                        data-testid="chat-project-new"
                        data-dir={dir}
                        title={t("newInProjectTitle")}
                        aria-label={`${t("newInProjectTitle")}: ${dir}`}
                        onClick={() => onNewProject(dir)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    {open && items.map((s) => renderItem(s, true))}
                  </div>
                );
              })}
          </div>

          <div
            className="sb-zone"
            data-testid="chat-session-zone"
            data-open={zoneOpen("chat")}
          >
            <button
              type="button"
              className="sb-zone-label"
              data-testid="chat-session-zone-toggle"
              onClick={() => toggleZone("chat")}
              onContextMenu={(e) =>
                openCtx(e, [{ key: "new-chat", label: t("newChat"), action: onNew }])
              }
              aria-expanded={zoneOpen("chat")}
            >
              <span className="sb-zone-name">
                <ChevronRight size={11} className={`chev${zoneOpen("chat") ? " open" : ""}`} />
                {t("chats")}
              </span>
              <span className="sb-zone-tag">{recentChats.length}</span>
            </button>
            {zoneOpen("chat") && recentChats.map((s) => renderItem(s, false))}
          </div>
        </div>

        <div className="sb-footer">
          <button
            type="button"
            className="sb-settings"
            data-testid="chat-settings"
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
    </aside>
  );
}

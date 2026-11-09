/* Session rows are div[role=button] (no nested buttons); collapses keep
 * content mounted behind grid-rows + inert. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  AppWindow,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Puzzle,
  Rows3,
  Settings,
  Trash2,
  Workflow,
} from "lucide-react";
import type { Session } from "./types";
import { relTime, useI18n } from "./i18n";
import { ChatContextMenu, type CtxItem } from "./ChatContextMenu";
import { useSidebarResize } from "./useSidebarResize";
import { useSidebarPrefs } from "./useSidebarPrefs";

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

const DAY = 86_400_000;

function compareSessions(a: Session, b: Session): number {
  return createdAtMs(b) - createdAtMs(a);
}

function createdAtMs(s: Session): number {
  return s.messages[0]?.atMs ?? s.updatedAtMs;
}

type ScrollMask = "none" | "top" | "bottom" | "both";

function useScrollMask(ref: RefObject<HTMLDivElement | null>): ScrollMask {
  const [mask, setMask] = useState<ScrollMask>("none");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const scrollable = el.scrollHeight > el.clientHeight + 1;
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMask(!scrollable ? "none" : top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "none");
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
  return mask;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ms: number, today: number): string {
  const day = startOfDay(ms);
  if (day === today) return "today";
  if (day === today - DAY) return "yesterday";
  if (day > today - 7 * DAY) return `d${Math.round((today - day) / DAY)}`;
  return "earlier";
}

interface RowProps {
  session: Session;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCtx: (e: ReactMouseEvent, items: CtxItem[]) => void;
  ctxItems: CtxItem[];
}

function SessionRow({ session, active, onSelect, onDelete, onCtx, ctxItems }: RowProps) {
  const { t, lang } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const disarm = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setConfirming(false);
  }, []);

  const startDelete = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (confirming) {
      disarm();
      onDelete(session.id);
      return;
    }
    setConfirming(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConfirming(false), 3000);
  };

  const dotClass = session.status === "streaming" ? "dot-live" : session.status === "error" ? "dot-err" : "dot-unread";
  const label = confirming ? t("clickAgainToDelete") : t("delete");

  return (
    <div
      role="button"
      tabIndex={0}
      className={`sb-item${active ? " active" : ""}`}
      data-testid="chat-session-item"
      data-id={session.id}
      data-kind={session.kind}
      data-status={session.status}
      data-active={active}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
      onContextMenu={(e) => onCtx(e, ctxItems)}
      onBlur={disarm}
    >
      <span className="sb-indicator" aria-hidden>
        {session.status !== "idle" && <span className={`dot ${dotClass}`} />}
      </span>
      <span className="sb-item-title" title={session.title}>
        {session.title}
      </span>
      <span className="sb-item-meta">{relTime(session.updatedAtMs, lang)}</span>
      <button
        type="button"
        className="sb-row-del"
        data-testid="chat-session-delete"
        data-confirming={confirming || undefined}
        aria-label={label}
        title={label}
        onClick={startDelete}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
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
  const { prefs, update, setZone, setExpanded, setChatView } = useSidebarPrefs();
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const startResize = useSidebarResize({ width, onWidth, onDragging });
  const closeCtx = useCallback(() => setCtx(null), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mask = useScrollMask(scrollRef);

  // stopPropagation: chat-root suppresses native menus; entities opt into theirs.
  const openCtx = (e: ReactMouseEvent, items: CtxItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  const projectItems = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (s.kind !== "project" || !s.dir) continue;
      const list = map.get(s.dir) ?? [];
      list.push(s);
      map.set(s.dir, list);
    }
    return map;
  }, [sessions]);

  /* Project order: persisted first-seen; children never reshuffle it. */
  const dirs = useMemo(() => {
    const seen: string[] = [];
    for (const s of sessions) {
      if (s.kind !== "project" || !s.dir) continue;
      if (!seen.includes(s.dir)) seen.push(s.dir);
    }
    return seen;
  }, [sessions]);

  const orderedDirs = useMemo(() => {
    const saved = prefs.order.filter((d) => dirs.includes(d));
    return [...saved, ...dirs.filter((d) => !saved.includes(d))];
  }, [dirs, prefs.order]);

  useEffect(() => {
    if (orderedDirs.join("\n") !== prefs.order.join("\n")) update({ order: orderedDirs });
  }, [orderedDirs, prefs.order, update]);

  const recentChats = useMemo(
    () => sessions.filter((s) => s.kind === "chat").sort(compareSessions),
    [sessions],
  );

  const sessionCtx = (session: Session): CtxItem[] => [
    { key: "open", label: t("open"), action: () => onSelect(session.id) },
    { key: "rename", label: t("rename"), disabled: true },
    { key: "delete", label: t("delete"), danger: true, action: () => onDeleteSession(session.id) },
  ];

  const renderSession = (session: Session) => (
    <SessionRow
      key={session.id}
      session={session}
      active={session.id === activeId}
      onSelect={onSelect}
      onDelete={onDeleteSession}
      onCtx={openCtx}
      ctxItems={sessionCtx(session)}
    />
  );

  const dayHeading = (key: string) => {
    if (key === "today") return t("timeToday");
    if (key === "yesterday") return t("timeYesterday");
    if (key === "earlier") return t("timeEarlier");
    return t("daysAgo").replace("{n}", key.slice(1));
  };

  const allDirs = orderedDirs;

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
          <button type="button" className="sb-action" data-testid="chat-new-session" onClick={onNew}>
            <Plus size={14} />
            {t("newSession")}
          </button>
          <button type="button" className="sb-action" data-testid="chat-new-automation" title={`${t("automation")} (mock)`}>
            <Workflow size={13} />
            {t("automation")}
          </button>
          <button type="button" className="sb-action" data-testid="chat-new-app" title={t("apps")} onClick={onOpenApps}>
            <AppWindow size={13} />
            {t("apps")}
          </button>
          <button type="button" className="sb-action" data-testid="chat-new-plugin" title={`${t("plugins")} (mock)`}>
            <Puzzle size={13} />
            {t("plugins")}
          </button>
        </div>

        <div className="sb-scroll" ref={scrollRef} data-scroll-mask={mask}>
          <div className="sb-zone" data-testid="chat-project-zone" data-open={prefs.zones.project}>
            <button
              type="button"
              className="sb-zone-label"
              data-testid="chat-project-zone-toggle"
              onClick={() => setZone("project", !prefs.zones.project)}
              onContextMenu={(e) =>
                openCtx(e, [
                  {
                    key: "expand-all",
                    label: t("expandAllProjects"),
                    action: () =>
                      update({ expanded: Object.fromEntries(allDirs.map((d) => [d, true])) }),
                  },
                  {
                    key: "collapse-all",
                    label: t("collapseAllProjects"),
                    action: () =>
                      update({ expanded: Object.fromEntries(allDirs.map((d) => [d, false])) }),
                  },
                ])
              }
              aria-expanded={prefs.zones.project}
            >
              <span className="sb-zone-name">
                <ChevronRight size={11} className={`chev${prefs.zones.project ? " open" : ""}`} />
                {t("projects")}
              </span>
              <span className="sb-zone-tag">{orderedDirs.length}</span>
            </button>

            <div
              className="sb-collapse"
              data-open={prefs.zones.project}
              inert={prefs.zones.project ? undefined : true}
              aria-hidden={!prefs.zones.project}
            >
              <div className="sb-collapse-inner">
                {orderedDirs.map((dir) => {
                  const items = projectItems.get(dir) ?? [];
                  const open = prefs.expanded[dir] !== false;
                  const sorted = items.slice().sort(compareSessions);
                  return (
                    <div key={dir} className="sb-project" data-testid="chat-project-item" data-dir={dir} data-open={open}>
                      <div className="sb-project-row">
                        <button
                          type="button"
                          className="sb-project-head"
                          data-testid="chat-project-toggle"
                          onClick={() => setExpanded(dir, !open)}
                          onContextMenu={(e) =>
                            openCtx(e, [
                              { key: "new-in-project", label: t("newInProject"), action: () => onNewProject(dir) },
                              { key: "rename", label: t("rename"), disabled: true },
                              {
                                key: "toggle",
                                label: open ? t("collapseProject") : t("expandProject"),
                                action: () => setExpanded(dir, !open),
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
                      <div
                        className="sb-collapse"
                        data-open={open}
                        inert={open ? undefined : true}
                        aria-hidden={!open}
                      >
                        <div className="sb-project-tasks">{sorted.map(renderSession)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sb-zone" data-testid="chat-session-zone" data-open={prefs.zones.chat}>
            <div className="sb-zone-head">
              <button
                type="button"
                className="sb-zone-label"
                data-testid="chat-session-zone-toggle"
                onClick={() => setZone("chat", !prefs.zones.chat)}
                onContextMenu={(e) => openCtx(e, [{ key: "new-chat", label: t("newChat"), action: onNew }])}
                aria-expanded={prefs.zones.chat}
              >
                <span className="sb-zone-name">
                  <ChevronRight size={11} className={`chev${prefs.zones.chat ? " open" : ""}`} />
                  {t("chats")}
                </span>
                <span className="sb-zone-tag">{recentChats.length}</span>
              </button>
              <button
                type="button"
                className="sb-zone-view-toggle"
                data-testid="chat-zone-view-toggle"
                title={prefs.chatView === "recent" ? t("viewDaily") : t("viewRecent")}
                aria-label={prefs.chatView === "recent" ? t("viewDaily") : t("viewRecent")}
                aria-pressed={prefs.chatView === "daily"}
                onClick={() => setChatView(prefs.chatView === "recent" ? "daily" : "recent")}
              >
                {prefs.chatView === "recent" ? <CalendarDays size={12} /> : <Rows3 size={12} />}
              </button>
            </div>

            <div
              className="sb-collapse"
              data-open={prefs.zones.chat}
              inert={prefs.zones.chat ? undefined : true}
              aria-hidden={!prefs.zones.chat}
            >
              <div className="sb-collapse-inner">
                {prefs.chatView === "daily"
                  ? dayGroups(recentChats).map(([key, items]) => (
                      <div key={key} className="sb-day-group">
                        <div className="sb-day-heading" data-testid="chat-date-heading">
                          {dayHeading(key)}
                        </div>
                        {items.map(renderSession)}
                      </div>
                    ))
                  : recentChats.map(renderSession)}
              </div>
            </div>
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

function dayGroups(sessions: Session[]): [string, Session[]][] {
  const today = startOfDay(Date.now());
  const buckets = new Map<string, Session[]>();
  const order: string[] = [];
  for (const s of sessions) {
    const key = dayKey(s.updatedAtMs, today);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(s);
  }
  return order.map((key) => [key, buckets.get(key)!] as [string, Session[]]);
}

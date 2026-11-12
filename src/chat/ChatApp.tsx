/* Chat shell; root data-* attributes are agent assertion anchors. */
import { useEffect, useMemo, useState } from "react";
import { Bot, Puzzle, Settings, Workflow } from "lucide-react";
import { useMockChat } from "./useMockChat";
import { I18nProvider, useI18n } from "./i18n";
import { TaskSidebar } from "./sidebar/TaskSidebar";
import { useTaskSidebarPrefs } from "./sidebar/useTaskSidebarPrefs";
import { MIN_SIDEBAR_WIDTH } from "./useSidebarResize";
import { useTheme } from "./useTheme";
import { TopBar } from "./TopBar";
import { SETTINGS_SECTION_IDS, SettingsSidebar, SettingsPanel } from "./SettingsView";
import { AppsView } from "./apps/AppsView";
import { LogoToggle } from "./LogoToggle";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { PlaceholderView } from "./PlaceholderView";
import type { PlaceholderPage, View } from "./types";
import "./tokens.css";
import "./chat.css";

/* URL params, read once at module load
 * (?shot=1 static mode, ?settings=<section> deep link). */
const PARAMS = new URLSearchParams(window.location.search);
const SHOT = PARAMS.get("shot") === "1";
const SETTINGS_DEEPLINK = PARAMS.get("settings");
const INITIAL_VIEW: View = SETTINGS_DEEPLINK ? "settings" : "chat";
const INITIAL_SECTION =
  SETTINGS_DEEPLINK && SETTINGS_SECTION_IDS.includes(SETTINGS_DEEPLINK) ? SETTINGS_DEEPLINK : "general";

const DEFAULT_SIDEBAR_WIDTH = 396;
/* Holds must outlast the st-*-out / st-return-in durations in chat.css. */
const SETTINGS_EXIT_MS = 180;
const CHAT_RETURN_MS = 240;

const PLACEHOLDERS: Record<PlaceholderPage, { icon: typeof Workflow; key: "automation" | "plugins" | "assistant" }> = {
  automation: { icon: Workflow, key: "automation" },
  plugins: { icon: Puzzle, key: "plugins" },
  assistant: { icon: Bot, key: "assistant" },
};

export function ChatApp() {
  return (
    <I18nProvider>
      <ChatShell />
    </I18nProvider>
  );
}

function ChatShell() {
  const { t } = useI18n();
  const {
    sessions,
    projects,
    groups,
    archivedSessions,
    draft,
    activeSession,
    streaming,
    queued,
    queuePaused,
    send,
    stop,
    removeQueued,
    resumeQueue,
    newTask,
    updateDraftText,
    deleteSession,
    selectSession,
    resolvePermission,
    togglePin,
    setArchived,
    renameSession,
    markUnread,
    saveProject,
    deleteProject,
    toggleProjectPin,
  } = useMockChat();
  const { prefs, update, setView: setSidebarView, setExpanded, toggleGroupCollapsed } = useTaskSidebarPrefs();
  const theme = useTheme();
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [settingsSection, setSettingsSection] = useState(INITIAL_SECTION);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [input, setInput] = useState("");

  useEffect(() => {
    const clamp = () =>
      setSidebarWidth((w) => {
        const max = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth / 2));
        return Math.min(Math.max(w, MIN_SIDEBAR_WIDTH), max);
      });
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const isDraft = activeSession === null;
  const isEmpty = isDraft || activeSession.messages.length === 0;
  const suggestions = t("suggestions");

  const composerValue = isDraft ? (draft?.text ?? "") : input;
  const setComposerValue = (v: string) => (isDraft ? updateDraftText(v) : setInput(v));
  /* # panel candidates: lightweight projection keeps the array reference stable. */
  const sessionRefs = useMemo(
    () => sessions.map((s) => ({ id: s.id, title: s.title })),
    [sessions],
  );

  const doSend = () => {
    send(composerValue);
    setInput("");
  };

  const pickSuggestion = (text: string) => {
    setComposerValue(text);
  };

  const [settingsJustClosed, setSettingsJustClosed] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  /* null = no spin on first render */
  const [gearSpin, setGearSpin] = useState<"on" | "off" | null>(null);
  const openSettings = () => {
    setSettingsClosing(false);
    setSettingsJustClosed(false);
    setGearSpin("on");
    setView("settings");
  };
  const closeSettings = () => {
    if (settingsClosing) return;
    setGearSpin("off");
    if (SHOT || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setView("chat");
      return;
    }
    setSettingsClosing(true);
    window.setTimeout(() => {
      setSettingsClosing(false);
      setSettingsJustClosed(true);
      setView("chat");
      window.setTimeout(() => setSettingsJustClosed(false), CHAT_RETURN_MS);
    }, SETTINGS_EXIT_MS);
  };
  const buildInChat = () => {
    setView("chat");
    setComposerValue(t("appsBuildPrompt"));
  };

  /* Ctrl/Cmd+N starts (or returns to) the draft. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newTask();
        setView("chat");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newTask]);

  const sidebarProps = {
    sessions,
    projects,
    groups,
    draft,
    activeId: activeSession?.id ?? null,
    prefs,
    onPrefsChange: update,
    setView: setSidebarView,
    setExpanded,
    toggleGroupCollapsed,
    onSelect: (id: string, unreadAtMs?: number) => {
      selectSession(id, unreadAtMs);
      setView("chat");
    },
    onSelectDraft: () => setView("chat"),
    onNewTask: (projectId?: string, groupId?: string) => {
      newTask(projectId, groupId);
      setInput("");
      setView("chat");
    },
    onDeleteSession: deleteSession,
    onTogglePin: togglePin,
    onArchive: (id: string) => setArchived(id, true),
    onRenameSession: renameSession,
    onMarkUnread: markUnread,
    onSaveProject: saveProject,
    onDeleteProject: deleteProject,
    onToggleProjectPin: toggleProjectPin,
    onOpenApps: () => setView("apps"),
    onOpenPage: (page: PlaceholderPage) => setView(page),
    page: view,
    width: sidebarWidth,
    collapsed: sidebarCollapsed,
    dragging: sidebarDragging,
    onWidth: setSidebarWidth,
    onDragging: setSidebarDragging,
  };

  const placeholderPage = view in PLACEHOLDERS ? (view as PlaceholderPage) : null;

  const headerTitle =
    view === "apps"
      ? t("apps")
      : view === "settings"
        ? t("stTitle")
        : placeholderPage
          ? t(PLACEHOLDERS[placeholderPage].key)
          : isDraft
            ? t("newTask")
            : activeSession.title;

  return (
    <div
      className={`chat-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-testid="chat-root"
      data-theme={theme.resolved}
      data-shot={SHOT || undefined}
      data-view={view}
      data-settings-closing={settingsClosing || undefined}
      data-just-closed={settingsJustClosed || undefined}
      data-sidebar={sidebarCollapsed ? "collapsed" : "open"}
      data-sidebar-width={sidebarCollapsed ? 0 : Math.round(sidebarWidth)}
      data-sidebar-view={prefs.view}
      data-streaming={streaming ? "true" : "false"}
      data-active-session={activeSession?.id ?? ""}
      data-message-count={activeSession?.messages.length ?? 0}
      data-queue-count={queued.length}
      /* Desktop-app behavior: no native context menu; custom-menu entities
       * stopPropagation before this handler runs. */
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* DOM order matches visual position (top-left). */}
      <div className="top-overlay">
        <LogoToggle sidebarCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      </div>

      {/* Persistent gear: must stay mounted across view switches. */}
      <button
        type="button"
        className="sb-settings sb-settings-floating"
        data-testid="chat-settings"
        data-open={view === "settings" || undefined}
        data-spin={gearSpin ?? undefined}
        title={view === "settings" ? t("backToWorkspace") : t("openSettings")}
        aria-label={view === "settings" ? t("backToWorkspace") : t("openSettings")}
        onClick={() => (view === "settings" ? closeSettings() : openSettings())}
      >
        <Settings size={16} />
      </button>

      {view === "settings" ? (
        <SettingsSidebar
          activeId={settingsSection}
          onSelect={setSettingsSection}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          closing={settingsClosing}
        />
      ) : (
        <TaskSidebar {...sidebarProps} />
      )}

      <div className="main-card">
        <TopBar view={view} title={headerTitle} />
        <div className="card-body">
          {view === "settings" ? (
            <SettingsPanel
              activeId={settingsSection}
              closing={settingsClosing}
              theme={theme}
              archived={archivedSessions}
              onRestoreArchive={(id) => setArchived(id, false)}
              onDeleteArchive={deleteSession}
            />
          ) : view === "apps" ? (
            <AppsView onBuildInChat={buildInChat} />
          ) : placeholderPage ? (
            <PlaceholderView
              page={placeholderPage}
              icon={PLACEHOLDERS[placeholderPage].icon}
              title={t(PLACEHOLDERS[placeholderPage].key)}
            />
          ) : (
            <main className="chat-main">
              {isEmpty ? (
                <div className="chat-empty-region">
                  <EmptyState
                    composer={
                      <Composer
                        value={composerValue}
                        onChange={setComposerValue}
                        onSend={doSend}
                        onStop={stop}
                        streaming={streaming}
                        centered
                        historyKey={activeSession?.id ?? "draft"}
                        sessions={sessionRefs}
                      />
                    }
                    onPick={pickSuggestion}
                    suggestions={suggestions}
                  />
                </div>
              ) : (
                activeSession !== null && (
                  <>
                    <MessageList
                      session={activeSession}
                      onResolvePermission={(messageId, blockId, decision) =>
                        resolvePermission(activeSession.id, messageId, blockId, decision)
                      }
                    />
                    <div className="chat-footer">
                      <Composer
                        value={composerValue}
                        onChange={setComposerValue}
                        onSend={doSend}
                        onStop={stop}
                        streaming={streaming}
                        historyKey={activeSession.id}
                        sessions={sessionRefs}
                        queue={queued}
                        onRemoveQueued={(i) => removeQueued(activeSession.id, i)}
                        queuePaused={queuePaused}
                        onResumeQueue={() => resumeQueue(activeSession.id)}
                      />
                    </div>
                  </>
                )
              )}
            </main>
          )}
        </div>
      </div>

      <span className="visually-hidden" role="status" data-testid="chat-status">
        {streaming ? t("generating") : ""}
      </span>
    </div>
  );
}

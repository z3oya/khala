/* Chat shell; root data-* attributes are agent assertion anchors. */
import { useEffect, useState } from "react";
import { useMockChat } from "./useMockChat";
import { I18nProvider, useI18n } from "./i18n";
import { TaskSidebar } from "./sidebar/TaskSidebar";
import { useTaskSidebarPrefs } from "./sidebar/useTaskSidebarPrefs";
import { MIN_SIDEBAR_WIDTH } from "./useSidebarResize";
import { TopBar } from "./TopBar";
import { SettingsSidebar, SettingsPanel } from "./SettingsView";
import { AppsView } from "./apps/AppsView";
import { LogoToggle } from "./LogoToggle";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import type { View } from "./types";
import "./tokens.css";
import "./chat.css";

const DEFAULT_SIDEBAR_WIDTH = 396;
/* Holds must outlast the st-*-out / st-return-in durations in chat.css. */
const SETTINGS_EXIT_MS = 180;
const CHAT_RETURN_MS = 240;

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
  const [view, setView] = useState<View>("chat");
  const [settingsSection, setSettingsSection] = useState("general");
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

  const doSend = () => {
    send(composerValue);
    setInput("");
  };

  const pickSuggestion = (text: string) => {
    setComposerValue(text);
  };

  /* Sidebar 'Apps' entry toggles workspace <-> apps page. */
  const toggleApps = () => setView((v) => (v === "apps" ? "chat" : "apps"));
  /* Settings is one-way per button: workspace entry opens, settings footer returns. */
  const [settingsJustClosed, setSettingsJustClosed] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const openSettings = () => setView("settings");
  const closeSettings = () => {
    if (settingsClosing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    onOpenSettings: openSettings,
    onOpenApps: toggleApps,
    settingsJustClosed,
    width: sidebarWidth,
    collapsed: sidebarCollapsed,
    dragging: sidebarDragging,
    onWidth: setSidebarWidth,
    onDragging: setSidebarDragging,
  };

  const headerTitle = view === "apps" ? t("apps") : view === "settings" ? t("stTitle") : isDraft ? t("newTask") : activeSession.title;

  return (
    <div
      className={`chat-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-testid="chat-root"
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

      {view === "settings" ? (
        <SettingsSidebar
          activeId={settingsSection}
          onSelect={setSettingsSection}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          closing={settingsClosing}
          onBack={closeSettings}
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
              archived={archivedSessions}
              onRestoreArchive={(id) => setArchived(id, false)}
              onDeleteArchive={deleteSession}
            />
          ) : view === "apps" ? (
            <AppsView onBuildInChat={buildInChat} />
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

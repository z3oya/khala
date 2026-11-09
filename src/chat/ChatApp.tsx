/* Chat shell; root data-* attributes are agent assertion anchors. */
import { useEffect, useState } from "react";
import { useMockChat } from "./useMockChat";
import { I18nProvider, useI18n } from "./i18n";
import { Sidebar } from "./Sidebar";
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

const DEFAULT_SIDEBAR_WIDTH = 320;

export function ChatApp() {
  return (
    <I18nProvider>
      <ChatShell />
    </I18nProvider>
  );
}

function ChatShell() {
  const { t } = useI18n();
  const { sessions, activeSession, streaming, send, stop, newSession, deleteSession, selectSession, resolvePermission } =
    useMockChat();
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

  const isEmpty = activeSession.messages.length === 0;
  const suggestions = t("suggestions");

  const doSend = () => {
    send(input);
    setInput("");
  };

  const pickSuggestion = (text: string) => {
    setInput(text);
  };

  /* Sidebar 'Apps' entry toggles workspace <-> apps page. */
  const toggleApps = () => setView((v) => (v === "apps" ? "chat" : "apps"));
  /* Settings is one-way per button: workspace entry opens, settings footer returns. */
  const openSettings = () => setView("settings");
  const closeSettings = () => setView("chat");
  const buildInChat = () => {
    setView("chat");
    setInput(t("appsBuildPrompt"));
  };

  const sidebarProps = {
    sessions,
    activeId: activeSession.id,
    onSelect: (id: string) => {
      selectSession(id);
      setView("chat");
    },
    onNew: () => {
      newSession();
      setInput("");
      setView("chat");
    },
    onNewProject: (dir: string) => {
      newSession(dir);
      setInput("");
      setView("chat");
    },
    onDeleteSession: deleteSession,
    onOpenSettings: openSettings,
    onOpenApps: toggleApps,
    width: sidebarWidth,
    collapsed: sidebarCollapsed,
    dragging: sidebarDragging,
    onWidth: setSidebarWidth,
    onDragging: setSidebarDragging,
  };

  const headerTitle = view === "apps" ? t("apps") : view === "settings" ? t("stTitle") : activeSession.title;

  return (
    <div
      className={`chat-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-testid="chat-root"
      data-view={view}
      data-sidebar={sidebarCollapsed ? "collapsed" : "open"}
      data-sidebar-width={sidebarCollapsed ? 0 : Math.round(sidebarWidth)}
      data-streaming={streaming ? "true" : "false"}
      data-active-session={activeSession.id}
      data-message-count={activeSession.messages.length}
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
          onBack={closeSettings}
        />
      ) : (
        <Sidebar {...sidebarProps} />
      )}

      <div className="main-card">
        <TopBar view={view} title={headerTitle} />
        <div className="card-body">
          {view === "settings" ? (
            <SettingsPanel activeId={settingsSection} />
          ) : view === "apps" ? (
            <AppsView onBuildInChat={buildInChat} />
          ) : (
            <main className="chat-main">
              {isEmpty ? (
                <div className="chat-empty-region">
                  <EmptyState
                    composer={
                      <Composer
                        value={input}
                        onChange={setInput}
                        onSend={doSend}
                        onStop={stop}
                        streaming={streaming}
                        centered
                      />
                    }
                    onPick={pickSuggestion}
                    suggestions={suggestions}
                  />
                </div>
              ) : (
                <>
                  <MessageList
                    session={activeSession}
                    onResolvePermission={(messageId, blockId, decision) =>
                      resolvePermission(activeSession.id, messageId, blockId, decision)
                    }
                  />
                  <div className="chat-footer">
                    <Composer
                      value={input}
                      onChange={setInput}
                      onSend={doSend}
                      onStop={stop}
                      streaming={streaming}
                    />
                  </div>
                </>
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

/* Chat shell; root data-* attributes are agent assertion anchors. */
import { useEffect, useState } from "react";
import { useMockChat } from "./useMockChat";
import { I18nProvider, useI18n } from "./i18n";
import { Sidebar } from "./Sidebar";
import { MIN_SIDEBAR_WIDTH } from "./useSidebarResize";
import { TopBar } from "./TopBar";
import { SettingsView } from "./SettingsView";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import "./tokens.css";
import "./chat.css";

const DEFAULT_SIDEBAR_WIDTH = 264;

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
  const [view, setView] = useState<"chat" | "settings">("chat");
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
      {view === "settings" ? (
        <SettingsView
          sidebarWidth={sidebarWidth}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          onBack={() => setView("chat")}
        />
      ) : (
        <TopBar
          title={activeSession.title}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />
      )}

      {view === "chat" && (
        <div className="chat-body">
          <Sidebar
            sessions={sessions}
            activeId={activeSession.id}
            onSelect={selectSession}
            onNew={() => {
              newSession();
              setInput("");
            }}
            onNewProject={(dir) => {
              newSession(dir);
              setInput("");
            }}
            onOpenSettings={() => setView("settings")}
            onDeleteSession={deleteSession}
            width={sidebarWidth}
            collapsed={sidebarCollapsed}
            dragging={sidebarDragging}
            onWidth={setSidebarWidth}
            onDragging={setSidebarDragging}
          />

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
        </div>
      )}

      <span className="visually-hidden" role="status" data-testid="chat-status">
        {streaming ? t("generating") : ""}
      </span>
    </div>
  );
}

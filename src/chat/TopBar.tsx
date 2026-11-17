/* In-card header; chips are chat-view only. The sidebar toggle floats top-left. */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Minus, Shield, ShieldCheck, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "./i18n";
import type { View } from "./types";

const MODELS = ["GLM-5.3", "GLM-5.3-Air", "GLM-5.3-Flash"];
const CTX_USAGE = 38;

/* Web dev (vite only) has no Tauri runtime; controls and drag region stay inert. */
const IS_TAURI = "__TAURI_INTERNALS__" in window;

const TITLE_TESTID: Record<View, string> = {
  chat: "chat-session-title",
  apps: "chat-apps-title",
  settings: "chat-settings-title",
  automation: "chat-page-title",
  plugins: "chat-page-title",
  assistant: "chat-page-title",
};

interface Props {
  view: View;
  title: string;
}

/** Frameless-window controls (- □ X); mounted only inside the Tauri shell. */
function WindowControls() {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    const sync = () => win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  const minimize = () => getCurrentWindow().minimize().catch(() => {});
  const toggleMaximize = () => getCurrentWindow().toggleMaximize().catch(() => {});
  const close = () => getCurrentWindow().close().catch(() => {});

  return (
    <div className="topbar-wincontrols" data-testid="chat-wincontrols">
      <button
        type="button"
        className="win-btn"
        data-testid="chat-win-minimize"
        title={t("winMinimize")}
        aria-label={t("winMinimize")}
        onClick={minimize}
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        className="win-btn"
        data-testid="chat-win-maximize"
        data-maximized={maximized || undefined}
        title={maximized ? t("winRestore") : t("winMaximize")}
        aria-label={maximized ? t("winRestore") : t("winMaximize")}
        onClick={toggleMaximize}
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button
        type="button"
        className="win-btn win-btn-close"
        data-testid="chat-win-close"
        title={t("winClose")}
        aria-label={t("winClose")}
        onClick={close}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TopBar({ view, title }: Props) {
  const { t } = useI18n();
  const showChips = view === "chat";
  const [model, setModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modelOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModelOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      setModel((cur) => {
        const i = MODELS.indexOf(cur);
        const step = e.key === "ArrowDown" ? 1 : MODELS.length - 1;
        return MODELS[(i + step) % MODELS.length];
      });
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("wheel", close, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("wheel", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelOpen]);

  return (
    <header className="chat-topbar" data-testid="chat-topbar" data-tauri-drag-region>
      <span className="topbar-title" data-testid={TITLE_TESTID[view]} title={title} data-tauri-drag-region>
        {title}
      </span>

      {showChips && (
        <div className="topbar-right" data-tauri-drag-region>
          <div className="model-select" ref={menuRef}>
            <button
              type="button"
              className="chip chip-btn"
              data-testid="chat-model-chip"
              data-model={model}
              onClick={() => setModelOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={modelOpen}
            >
              {model}
              <ChevronDown size={12} />
            </button>
            {modelOpen && (
              <div className="chip-menu" data-testid="chat-model-menu" role="listbox">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`chip-menu-item${m === model ? " active" : ""}`}
                    data-testid="chat-model-option"
                    data-model={m}
                    role="option"
                    aria-selected={m === model}
                    onClick={() => {
                      setModel(m);
                      setModelOpen(false);
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="ctx-meter"
            data-testid="chat-context-meter"
            data-percent={CTX_USAGE}
            title={t("contextUsage").replace("{n}", String(CTX_USAGE))}
          >
            <span className="ctx-track">
              <span className="ctx-fill" style={{ width: `${CTX_USAGE}%` }} />
            </span>
            <span className="ctx-label">{CTX_USAGE}%</span>
          </div>

          <button
            type="button"
            className="chip chip-btn"
            data-testid="chat-perm-mode"
            data-mode={autoApprove ? "auto" : "ask"}
            onClick={() => setAutoApprove((v) => !v)}
            title={t("permModeTitle")}
          >
            {autoApprove ? <ShieldCheck size={12} /> : <Shield size={12} />}
            {autoApprove ? t("permModeAuto") : t("permModeAsk")}
          </button>
        </div>
      )}

      {IS_TAURI && <WindowControls />}
    </header>
  );
}

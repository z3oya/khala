import { useEffect, useRef, useState } from "react";
import { ChevronDown, Shield, ShieldCheck } from "lucide-react";
import { LogoToggle } from "./LogoToggle";
import { useI18n } from "./i18n";

const MODELS = ["GLM-5.3", "GLM-5.3-Air", "GLM-5.3-Flash"];
const CTX_USAGE = 38;

interface Props {
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({ title, sidebarCollapsed, onToggleSidebar }: Props) {
  const { t } = useI18n();
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
    <header className="chat-topbar" data-testid="chat-topbar">
      <LogoToggle sidebarCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      <span className="topbar-title" data-testid="chat-session-title" title={title}>
        {title}
      </span>

      <div className="topbar-right">
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
    </header>
  );
}

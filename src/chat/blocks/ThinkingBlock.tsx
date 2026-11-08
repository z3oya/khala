import { useEffect, useState } from "react";
import { Brain, ChevronRight } from "lucide-react";
import type { ThinkingBlock as ThinkingBlockModel } from "../types";
import { useI18n } from "../i18n";

interface Props {
  block: ThinkingBlockModel;
}

function seconds(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

export function ThinkingBlockView({ block }: Props) {
  const { t } = useI18n();
  const live = block.durationMs === undefined;
  const [open, setOpen] = useState(live);
  const [elapsed, setElapsed] = useState(
    live ? Math.max(0, Date.now() - block.startedAtMs) : block.durationMs ?? 0,
  );

  useEffect(() => {
    if (!live) {
      setOpen(false);
      setElapsed(block.durationMs ?? 0);
      return;
    }
    const timer = window.setInterval(() => setElapsed(Date.now() - block.startedAtMs), 500);
    return () => window.clearInterval(timer);
  }, [live, block.durationMs, block.startedAtMs]);

  return (
    <div
      className={`think-block${open ? " open" : ""}${live ? " live" : ""}`}
      data-testid="chat-thinking"
      data-state={live ? "live" : "done"}
      data-open={open}
    >
      <button
        type="button"
        className="think-head"
        data-testid="chat-thinking-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Brain size={13} className="think-icon" />
        <span className="think-label">{live ? t("thinkingLive") : t("thinking")}</span>
        <span className="think-duration" data-testid="chat-thinking-duration">
          {seconds(elapsed)}
        </span>
        <ChevronRight size={12} className={`chev${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="think-body" data-testid="chat-thinking-body">
          {block.text}
        </div>
      )}
    </div>
  );
}

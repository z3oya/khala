/* Tool-call card: running starts expanded, auto-collapses on completion. */
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Circle,
  FilePenLine,
  FilePlus2,
  FileText,
  Files,
  Globe,
  ListChecks,
  LoaderCircle,
  Search,
  Terminal,
  X,
} from "lucide-react";
import { diffStats, type ToolCallBlock, type ToolDetail } from "../types";
import { DiffView } from "./DiffView";
import { useI18n } from "../i18n";

const TOOL_ICONS = {
  bash: Terminal,
  read: FileText,
  grep: Search,
  glob: Files,
  write: FilePlus2,
  edit: FilePenLine,
  todo: ListChecks,
  webFetch: Globe,
} as const satisfies Record<ToolDetail["tool"], unknown>;

function StatusIcon({ status }: { status: ToolCallBlock["status"] }) {
  if (status === "running") return <LoaderCircle size={13} className="spin" />;
  if (status === "done") return <Check size={13} />;
  return <X size={13} />;
}

function renderDetail(detail: ToolDetail, t: ReturnType<typeof useI18n>["t"]): ReactNode {
  switch (detail.tool) {
    case "bash":
      return (
        <>
          <div className="tool-cmd">$ {detail.command}</div>
          {detail.outputLines.length > 0 ? (
            <div className="tool-output">
              {detail.outputLines.map((line, i) => (
                <div
                  key={i}
                  className={`tool-line${detail.exitCode !== 0 && i >= detail.outputLines.length - 2 ? " is-err" : ""}`}
                >
                  {line || "\u00a0"}
                </div>
              ))}
              {detail.hiddenLines !== undefined && detail.hiddenLines > 0 && (
                <div className="tool-more">... {t("moreLines").replace("{n}", String(detail.hiddenLines))}</div>
              )}
            </div>
          ) : (
            <div className="tool-running-hint">{t("toolRunning")}</div>
          )}
        </>
      );
    case "read":
      return (
        <>
          <div className="tool-path-row">
            <span className="tool-path">{detail.path}</span>
            <span className="tool-count">{detail.lineCount} {t("lines")}</span>
          </div>
          {detail.preview && detail.preview.length > 0 && (
            <div className="tool-output">
              {detail.preview.map((line, i) => (
                <div key={i} className="tool-line">
                  {line}
                </div>
              ))}
            </div>
          )}
        </>
      );
    case "grep":
    case "glob":
      return (
        <>
          <div className="tool-path-row">
            <span className="tool-path">{detail.pattern}</span>
            <span className="tool-count">{detail.matchCount} {t("matches")}</span>
          </div>
          {detail.files.length > 0 && (
            <div className="tool-output">
              {detail.files.map((f) => (
                <div key={f} className="tool-line">
                  {f}
                </div>
              ))}
            </div>
          )}
        </>
      );
    case "write":
    case "edit":
      return (
        <>
          <div className="tool-path-row">
            <span className="tool-path">{detail.path}</span>
          </div>
          <DiffView hunks={detail.hunks} />
        </>
      );
    case "todo":
      return (
        <ul className="tool-todo">
          {detail.items.map((item, i) => (
            <li key={i} className={`todo-${item.state}`}>
              <span className="todo-state-icon">
                {item.state === "done" ? (
                  <Check size={13} />
                ) : item.state === "inProgress" ? (
                  <LoaderCircle size={13} className="spin" />
                ) : (
                  <Circle size={13} />
                )}
              </span>
              <span className="todo-text">{item.text}</span>
            </li>
          ))}
        </ul>
      );
    case "webFetch":
      // non-http(s) degrades to a plain row (untrusted input)
      if (!/^https?:\/\//i.test(detail.url)) {
        return (
          <div className="tool-link">
            <Globe size={13} />
            <span className="tool-link-title">{detail.title}</span>
            <span className="tool-link-url">{detail.url}</span>
          </div>
        );
      }
      return (
        <a className="tool-link" href={detail.url} target="_blank" rel="noreferrer">
          <Globe size={13} />
          <span className="tool-link-title">{detail.title}</span>
          <span className="tool-link-url">{detail.url}</span>
        </a>
      );
  }
}

export function ToolCardView({ block }: { block: ToolCallBlock }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(block.status === "running");
  useEffect(() => {
    if (block.status !== "running") setOpen(false);
  }, [block.status]);

  const Icon = TOOL_ICONS[block.detail.tool];
  const stats =
    block.detail.tool === "edit" || block.detail.tool === "write"
      ? diffStats(block.detail.hunks)
      : null;

  return (
    <div
      className={`tool-card${open ? " open" : ""}`}
      data-testid="chat-tool-card"
      data-tool={block.detail.tool}
      data-status={block.status}
      data-open={open}
    >
      <button
        type="button"
        className="tool-head"
        data-testid="chat-tool-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="tool-icon">
          <Icon size={14} />
        </span>
        <span className="tool-name">{block.name}</span>
        {block.summary && (
          <span className="tool-summary" title={block.summary}>
            {block.summary}
          </span>
        )}
        {stats && (
          <span className="tool-stats">
            <span className="is-add">+{stats.add}</span>
            <span className="is-del">-{stats.del}</span>
          </span>
        )}
        <span className={`tool-status st-${block.status}`}>
          <StatusIcon status={block.status} />
        </span>
        <ChevronRight size={12} className={`chev${open ? " open" : ""}`} />
      </button>
      {open && <div className="tool-body">{renderDetail(block.detail, t)}</div>}
    </div>
  );
}

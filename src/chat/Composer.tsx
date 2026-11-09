import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Play, Square, X } from "lucide-react";
import { useI18n } from "./i18n";

const HISTORY_KEY = "khala-composer-history";
const HISTORY_MAX = 50;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  centered?: boolean; // rendered inside the empty state
  historyKey: string; // session id
  queue?: string[];
  onRemoveQueued?: (index: number) => void;
  queuePaused?: boolean;
  onResumeQueue?: () => void;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  centered = false,
  historyKey,
  queue = [],
  onRemoveQueued,
  queuePaused = false,
  onResumeQueue,
}: Props) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Safari fires the committing Enter's keydown after compositionend with
  // isComposing already false; the fresh-timestamp guard closes that gap.
  const compositionEndedAt = useRef(0);

  /* ↑/↓ history browse index; -1 = not browsing. */
  const historyRef = useRef<string[]>([]);
  const historyDraftRef = useRef("");
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    let map: Record<string, string[]> = {};
    try {
      map = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}") as Record<string, string[]>;
    } catch {
      map = {};
    }
    historyRef.current = map[historyKey] ?? [];
    historyDraftRef.current = "";
    setHistoryIndex(-1);
  }, [historyKey]);

  const recordHistory = (text: string) => {
    const list = historyRef.current;
    setHistoryIndex(-1);
    if (list[list.length - 1] === text) return;
    const next = [...list, text].slice(-HISTORY_MAX);
    historyRef.current = next;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      map[historyKey] = next;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(map));
    } catch {
      /* storage unavailable */
    }
  };

  const browseHistory = (dir: -1 | 1) => {
    const list = historyRef.current;
    if (list.length === 0) return;
    if (historyIndex === -1 && dir === -1) historyDraftRef.current = value;
    let next: number;
    if (dir === -1) {
      // Entering browse starts at the newest entry, not one past it.
      next = historyIndex === -1 ? list.length - 1 : historyIndex - 1;
    } else {
      next = historyIndex + 1;
      if (next >= list.length) {
        setHistoryIndex(-1);
        onChange(historyDraftRef.current);
        return;
      }
    }
    if (next < 0) {
      setHistoryIndex(-1);
      onChange(historyDraftRef.current);
      return;
    }
    setHistoryIndex(next);
    onChange(list[next]);
  };

  const handleInput = (next: string) => {
    if (historyIndex !== -1 && next !== historyRef.current[historyIndex]) setHistoryIndex(-1);
    onChange(next);
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const { scrollTop } = el; // keep the view anchored across the height reset
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    el.scrollTop = scrollTop;
  }, [value]);

  /* Streaming routes submit into the send queue (useMockChat.send). */
  const submit = () => {
    const text = value.trim();
    if (text === "") return;
    recordHistory(text);
    onSend();
  };

  const insertTrigger = (trigger: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const sep = before.length > 0 && !/\s$/.test(before) ? " " : "";
    onChange(before + sep + trigger + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const caret = (before + sep + trigger).length;
      el.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      if (e.shiftKey) return;
      if (Date.now() - compositionEndedAt.current < 30) return;
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      if (!streaming) return;
      // open menus consume Esc via their own document-level handlers
      if (document.querySelector('[data-testid="chat-context-menu"], [data-testid="chat-model-menu"]')) return;
      e.preventDefault();
      onStop();
      return;
    }
    const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (e.key === "ArrowUp" && plain && (value === "" || historyIndex !== -1)) {
      e.preventDefault();
      browseHistory(-1);
      return;
    }
    if (e.key === "ArrowDown" && plain && historyIndex !== -1) {
      e.preventDefault();
      browseHistory(1);
    }
  };

  const placeholder = streaming
    ? t("composerPlaceholderStreaming")
    : centered
      ? t("composerPlaceholder")
      : t("composerPlaceholderFollowUp");

  return (
    <div className={`composer-wrap${centered ? " centered" : ""}`}>
      {queue.length > 0 && onRemoveQueued && (
        <div className="composer-queue" data-testid="chat-queue" data-count={queue.length}>
          {queue.map((q, i) => (
            <span key={`${i}-${q}`} className="queue-chip" data-testid="chat-queue-item" data-index={i} title={q}>
              <span className="queue-chip-text">{q}</span>
              <button
                type="button"
                className="queue-chip-x"
                data-testid="chat-queue-remove"
                data-index={i}
                aria-label={t("queueRemove")}
                title={t("queueRemove")}
                onClick={() => onRemoveQueued(i)}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {queuePaused && onResumeQueue && (
            <button
              type="button"
              className="chip chip-btn queue-resume"
              data-testid="chat-queue-resume"
              title={t("queueResume")}
              onClick={onResumeQueue}
            >
              <Play size={11} />
              {t("queueResume")}
            </button>
          )}
        </div>
      )}
      <div className="composer" data-testid="chat-composer">
        <textarea
          ref={textareaRef}
          className="composer-input"
          data-testid="chat-input"
          rows={1}
          autoFocus
          value={value}
          onChange={(e) => handleInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onCompositionEnd={() => {
            compositionEndedAt.current = Date.now();
          }}
          placeholder={placeholder}
          aria-label={t("messageInput")}
        />
        <div className="composer-bar">
          <div className="composer-hints">
            <button
              type="button"
              className="icon-btn"
              data-testid="chat-attach"
              title={t("attachTitle")}
              aria-label={t("attachTitle")}
            >
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              className="chip chip-btn"
              data-testid="chat-hint-slash"
              title={t("slashHint")}
              onClick={() => insertTrigger("/")}
            >
              {t("slashHint")}
            </button>
            <button
              type="button"
              className="chip chip-btn"
              data-testid="chat-hint-mention"
              title={t("mentionHint")}
              onClick={() => insertTrigger("@")}
            >
              {t("mentionHint")}
            </button>
          </div>
          {streaming && value.trim() === "" ? (
            <button
              type="button"
              className="send-btn"
              data-testid="chat-stop"
              onClick={onStop}
              aria-label={t("stop")}
              title={t("stop")}
            >
              <span key="stop" className="send-icon">
                <Square size={12} fill="currentColor" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              data-testid="chat-send"
              onClick={submit}
              disabled={value.trim() === ""}
              aria-label={streaming ? t("queueSend") : t("send")}
              title={streaming ? t("queueSend") : t("send")}
            >
              <span key={streaming ? "queue" : "send"} className="send-icon">
                <ArrowUp size={14} />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

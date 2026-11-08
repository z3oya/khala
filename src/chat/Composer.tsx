import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { useI18n } from "./i18n";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  centered?: boolean; // rendered inside the empty state
}

export function Composer({ value, onChange, onSend, onStop, streaming, centered = false }: Props) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Safari fires the committing Enter's keydown after compositionend with
  // isComposing already false; the fresh-timestamp guard closes that gap.
  const compositionEndedAt = useRef(0);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    if (streaming || value.trim() === "") return;
    onSend();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (Date.now() - compositionEndedAt.current < 30) return;
    e.preventDefault();
    submit();
  };

  return (
    <div className={`composer-wrap${centered ? " centered" : ""}`}>
      <div className="composer" data-testid="chat-composer">
        <textarea
          ref={textareaRef}
          className="composer-input"
          data-testid="chat-input"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onCompositionEnd={() => {
            compositionEndedAt.current = Date.now();
          }}
          placeholder={t("composerPlaceholder")}
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
            <span className="chip" data-testid="chat-hint-slash">
              {t("slashHint")}
            </span>
            <span className="chip" data-testid="chat-hint-mention">
              {t("mentionHint")}
            </span>
          </div>
          {streaming ? (
            <button
              type="button"
              className="send-btn"
              data-testid="chat-stop"
              onClick={onStop}
              aria-label={t("stop")}
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              data-testid="chat-send"
              onClick={submit}
              disabled={value.trim() === ""}
              aria-label={t("send")}
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

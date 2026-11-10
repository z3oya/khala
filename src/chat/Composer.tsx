import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Paperclip, Play, Square, X } from "lucide-react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useI18n } from "./i18n";
import { MentionPlugin } from "./mentions/MentionPlugin";
import { PromptClipboardPlugin } from "./mentions/PromptClipboardPlugin";
import { $getPromptMarkdown } from "./mentions/promptSerialization";
import { INLINE_MENTION_TOKEN_PATTERN } from "./mentions/mentionMarkdown";
import {
  $createPromptMentionNode,
  PromptMentionNode,
} from "./mentions/nodes/PromptMentionNode";
import { PROGRAMMATIC_UPDATE_TAG } from "./mentions/editorUpdateTags";
import type { SessionRef } from "./mentions/mentionCatalog";
import type { PromptInputTrigger } from "./mentions/promptInputTriggers";

const HISTORY_KEY = "khala-composer-history";
const HISTORY_MAX = 50;

/** Panels are detectable in the document, independent of Lexical command registration order. */
const OPEN_PANEL_SELECTOR =
  '[data-testid="chat-mention-panel"], [data-testid="chat-context-menu"], [data-testid="chat-model-menu"]';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  centered?: boolean; // rendered inside the empty state
  historyKey: string; // session id
  sessions?: SessionRef[]; // # panel candidates
  queue?: string[];
  onRemoveQueued?: (index: number) => void;
  queuePaused?: boolean;
  onResumeQueue?: () => void;
}

/* Backfill revives inline tokens only ($skill, /command); link paths don't rebuild
 * reliably from plain text. */
function replaceEditorText(editor: LexicalEditor, text: string) {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();

      // $getPromptMarkdown separates paragraphs with \n\n; split symmetrically.
      for (const line of text.split("\n\n")) {
        const paragraph = $createParagraphNode();
        let cursor = 0;
        INLINE_MENTION_TOKEN_PATTERN.lastIndex = 0;
        for (const match of line.matchAll(INLINE_MENTION_TOKEN_PATTERN)) {
          const prefix = match[1] ?? "";
          const token = match[2] ?? "";
          if (!token) continue;
          const start = (match.index ?? 0) + prefix.length;
          if (start > cursor) paragraph.append($createTextNode(line.slice(cursor, start)));
          const category = token.startsWith("$") ? "skills" : "commands";
          paragraph.append(
            $createPromptMentionNode({
              id: `${category}:${token.slice(1)}`,
              category,
              label: token.slice(1),
              value: token.slice(1),
              markdown: token,
            }),
          );
          cursor = start + token.length;
        }
        if (cursor < line.length || paragraph.getChildrenSize() === 0) {
          paragraph.append($createTextNode(line.slice(cursor)));
        }
        root.append(paragraph);
      }

      root.getLastChild()?.selectEnd();
    },
    { tag: PROGRAMMATIC_UPDATE_TAG },
  );
}

/** One-way editor → parent emission. */
function MarkdownSyncPlugin({
  onMarkdownChange,
}: {
  onMarkdownChange: (markdown: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const changeRef = useRef(onMarkdownChange);
  changeRef.current = onMarkdownChange;

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        let markdown = "";
        editorState.read(() => {
          markdown = $getPromptMarkdown();
        });
        changeRef.current(markdown);
      }),
    [editor],
  );
  return null;
}

interface KeyboardHandlers {
  onSubmit: () => void;
  onStop: () => void;
  onHistory: (dir: -1 | 1) => void;
  canBrowseHistory: () => boolean;
  isBrowsing: () => boolean;
  streaming: () => boolean;
}

/** Keyboard dispatch; yields to the mention panel while it is open (see OPEN_PANEL_SELECTOR). */
function ComposerKeyboardPlugin({
  handlers,
  compositionEndedAtRef,
}: {
  handlers: KeyboardHandlers;
  compositionEndedAtRef: React.RefObject<number>;
}) {
  const [editor] = useLexicalComposerContext();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) return false; // Shift+Enter falls through to a newline
        if (document.querySelector(OPEN_PANEL_SELECTOR)) return false;
        if (event?.isComposing) return false;
        if (event?.keyCode === 229) return false;
        // Safari: the committing Enter's keydown arrives after compositionend with
        // isComposing already false; the 30ms window closes that gap.
        if (Date.now() - compositionEndedAtRef.current < 30) return false;
        event?.preventDefault();
        handlersRef.current.onSubmit();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (document.querySelector(OPEN_PANEL_SELECTOR)) return false;
        if (!handlersRef.current.streaming()) return false;
        event?.preventDefault();
        handlersRef.current.onStop();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (document.querySelector(OPEN_PANEL_SELECTOR)) return false;
        if (event?.shiftKey || event?.altKey || event?.ctrlKey || event?.metaKey) return false;
        if (!handlersRef.current.canBrowseHistory()) return false;
        event?.preventDefault();
        handlersRef.current.onHistory(-1);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (document.querySelector(OPEN_PANEL_SELECTOR)) return false;
        if (event?.shiftKey || event?.altKey || event?.ctrlKey || event?.metaKey) return false;
        if (!handlersRef.current.isBrowsing()) return false;
        event?.preventDefault();
        handlersRef.current.onHistory(1);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      unregisterEnter();
      unregisterEscape();
      unregisterUp();
      unregisterDown();
    };
  }, [compositionEndedAtRef, editor]);

  return null;
}

/** Exposes the editor instance to the Composer host (backfill, trigger insert, focus). */
function EditorHandlePlugin({ editorRef }: { editorRef: React.RefObject<LexicalEditor | null> }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);
  return null;
}

/** Stable reference: PlainTextPlugin's ErrorBoundary is a component type. */
function ComposerErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  centered = false,
  historyKey,
  sessions = [],
  queue = [],
  onRemoveQueued,
  queuePaused = false,
  onResumeQueue,
}: Props) {
  const { t } = useI18n();
  const editorRef = useRef<LexicalEditor | null>(null);
  /* One-way flow guard: latest editor-emitted markdown; a differing value = external write. */
  const lastEmittedMarkdownRef = useRef<string | null>(null);
  const compositionEndedAtRef = useRef(0);

  /* ↑/↓ history browse index; -1 = not browsing. */
  const historyRef = useRef<string[]>([]);
  const historyDraftRef = useRef("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

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

  const recordHistory = useCallback(
    (text: string) => {
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
    },
    [historyKey],
  );

  const browseHistory = useCallback(
    (dir: -1 | 1) => {
      const list = historyRef.current;
      if (list.length === 0) return;
      const current = historyIndexRef.current;
      if (current === -1 && dir === -1) {
        historyDraftRef.current = lastEmittedMarkdownRef.current ?? "";
      }
      let next: number;
      if (dir === -1) {
        // Entering browse starts at the newest entry, not one past it.
        next = current === -1 ? list.length - 1 : current - 1;
      } else {
        next = current + 1;
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
      onChange(list[next]!);
    },
    [onChange],
  );

  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      if (markdown === lastEmittedMarkdownRef.current) return;
      lastEmittedMarkdownRef.current = markdown;
      if (historyIndexRef.current !== -1) setHistoryIndex(-1);
      onChange(markdown);
    },
    [onChange],
  );

  /* Parent → editor: rebuild only for external writes (history, suggestions, session switch). */
  useEffect(() => {
    if (value === lastEmittedMarkdownRef.current) return;
    lastEmittedMarkdownRef.current = value;
    const editor = editorRef.current;
    if (!editor) return;
    replaceEditorText(editor, value);
  }, [value]);

  /* Streaming routes submit into the send queue (useMockChat.send). */
  const submit = useCallback(() => {
    const text = (lastEmittedMarkdownRef.current ?? value).trim();
    if (text === "") return;
    recordHistory(text);
    onSend();
    // The post-send clear must not be undoable: Ctrl+Z would resurrect the sent text
    // into parent state and re-arm the send button.
    requestAnimationFrame(() => {
      editorRef.current?.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    });
  }, [onSend, recordHistory, value]);

  const insertTrigger = useCallback((trigger: PromptInputTrigger) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      let prefix: string = trigger;
      const anchor = selection.anchor;
      if (anchor.type === "text") {
        const text = anchor.getNode().getTextContent();
        const before = text.slice(0, anchor.offset);
        if (before.length > 0 && !/\s$/.test(before)) prefix = ` ${trigger}`;
      }
      selection.insertText(prefix);
    });
    requestAnimationFrame(() => {
      editor.focus();
    });
  }, []);

  const keyboardHandlers = useMemo<KeyboardHandlers>(
    () => ({
      onSubmit: submit,
      onStop,
      onHistory: browseHistory,
      canBrowseHistory: () =>
        (lastEmittedMarkdownRef.current ?? "") === "" || historyIndexRef.current !== -1,
      isBrowsing: () => historyIndexRef.current !== -1,
      streaming: () => streaming,
    }),
    [browseHistory, streaming, submit, onStop],
  );

  const initialConfig = useMemo(
    () => ({
      namespace: "KhalaComposer",
      theme: { paragraph: "composer-paragraph" },
      nodes: [PromptMentionNode],
      onError: (error: Error) => {
        console.error("[Composer] editor error:", error);
      },
    }),
    [],
  );

  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(null);

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
            <span
              key={`${i}-${q}`}
              className="queue-chip"
              data-testid="chat-queue-item"
              data-index={i}
              title={q}
            >
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
        <div className="composer-editor-wrap">
          <LexicalComposer initialConfig={initialConfig}>
            <EditorHandlePlugin editorRef={editorRef} />
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  className="composer-input"
                  data-testid="chat-input"
                  aria-label={t("messageInput")}
                  aria-placeholder={placeholder}
                  placeholder={<div className="composer-placeholder">{placeholder}</div>}
                  onCompositionEnd={() => {
                    compositionEndedAtRef.current = Date.now();
                  }}
                />
              }
              placeholder={null}
              ErrorBoundary={ComposerErrorBoundary}
            />
            <HistoryPlugin />
            <PromptClipboardPlugin />
            <MarkdownSyncPlugin onMarkdownChange={handleMarkdownChange} />
            <ComposerKeyboardPlugin
              handlers={keyboardHandlers}
              compositionEndedAtRef={compositionEndedAtRef}
            />
            <MentionPlugin sessions={sessions} container={panelContainer} />
          </LexicalComposer>
          <div
            ref={setPanelContainer}
            className="mention-panel-anchor"
            data-testid="chat-mention-anchor"
          />
        </div>
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
              data-testid="chat-hint-skill"
              title={t("skillHint")}
              onClick={() => insertTrigger("$")}
            >
              {t("skillHint")}
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
            <button
              type="button"
              className="chip chip-btn"
              data-testid="chat-hint-session"
              title={t("sessionHint")}
              onClick={() => insertTrigger("#")}
            >
              {t("sessionHint")}
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

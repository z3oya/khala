import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { createPortal } from "react-dom";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from "lexical";
import { useI18n, type StringKey } from "../i18n";
import { PROGRAMMATIC_UPDATE_TAG } from "./editorUpdateTags";
import {
  buildCommandItems,
  buildFileItems,
  buildSessionItems,
  buildSkillItems,
  type SessionRef,
} from "./mentionCatalog";
import {
  extractActivePromptInputTrigger,
  filterPromptInputSuggestions,
  getActivePromptInputTokenTailLength,
  getPromptInputTriggerSignature,
  type ActivePromptInputTrigger,
  type PromptInputTrigger,
} from "./promptInputTriggers";
import { $createPromptMentionNode } from "./nodes/PromptMentionNode";
import { MentionPanel } from "./MentionPanel";
import type { MentionCategory, MentionItem } from "./mentionTypes";

interface MentionPluginProps {
  sessions: SessionRef[];
  container: HTMLElement | null;
}

/** Single routing table: trigger → category + panel strings. */
const TRIGGER_INFO: Record<
  PromptInputTrigger,
  { category: MentionCategory; titleKey: StringKey; emptyKey: StringKey; footerKey: StringKey }
> = {
  "@": {
    category: "files",
    titleKey: "mentionFilesTitle",
    emptyKey: "mentionFilesEmpty",
    footerKey: "mentionFooterFiles",
  },
  "/": {
    category: "commands",
    titleKey: "mentionCommandsTitle",
    emptyKey: "mentionCommandsEmpty",
    footerKey: "mentionFooterCommands",
  },
  $: {
    category: "skills",
    titleKey: "mentionSkillsTitle",
    emptyKey: "mentionSkillsEmpty",
    footerKey: "mentionFooterSkills",
  },
  "#": {
    category: "sessions",
    titleKey: "mentionSessionsTitle",
    emptyKey: "mentionSessionsEmpty",
    footerKey: "mentionFooterSessions",
  },
};

const TRIGGER_ORDER: readonly PromptInputTrigger[] = ["@", "/", "$", "#"];

function getCurrentTextNodeSelection() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchor = selection.anchor;
  if (anchor.type !== "text") {
    return null;
  }

  const node = anchor.getNode();
  if (!$isTextNode(node)) {
    return null;
  }

  const text = node.getTextContent();
  return {
    selection,
    node,
    cursorOffset: anchor.offset,
    text,
    textAfterCursor: text.slice(anchor.offset),
    textBeforeCursor: text.slice(0, anchor.offset),
  };
}

export function MentionPlugin({ sessions, container }: MentionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const { t } = useI18n();
  const [activeTrigger, setActiveTrigger] = useState<ActivePromptInputTrigger | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dismissedSignatureRef = useRef<string | null>(null);
  const activeSignatureRef = useRef<string | null>(null);

  const tStr = useCallback((key: StringKey) => t(key), [t]);
  const commandItems = useMemo(() => buildCommandItems(tStr), [tStr]);
  const skillItems = useMemo(() => buildSkillItems(tStr), [tStr]);
  const fileItems = useMemo(() => buildFileItems(), []);
  const sessionItems = useMemo(() => buildSessionItems(sessions), [sessions]);

  const itemsByTrigger = useMemo<Record<PromptInputTrigger, MentionItem[]>>(
    () => ({
      "@": fileItems,
      "/": commandItems,
      $: skillItems,
      "#": sessionItems,
    }),
    [commandItems, fileItems, sessionItems, skillItems],
  );

  const isOpen = activeTrigger !== null;
  const activeQuery = activeTrigger?.query ?? "";
  // Deferred query keeps typing responsive while candidate filtering converges.
  const deferredActiveQuery = useDeferredValue(activeQuery);
  const hasActiveQuery = deferredActiveQuery.trim().length > 0;
  const activeSignature = useMemo(
    () => getPromptInputTriggerSignature(activeTrigger),
    [activeTrigger],
  );

  const flatItems = useMemo<MentionItem[]>(() => {
    if (!activeTrigger) return [];
    return filterPromptInputSuggestions(
      itemsByTrigger[activeTrigger.trigger],
      deferredActiveQuery,
    );
  }, [activeTrigger, deferredActiveQuery, itemsByTrigger]);

  useEffect(() => {
    activeSignatureRef.current = activeSignature;
  }, [activeSignature]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [activeSignature]);

  const insertMentionItem = useCallback(
    (item: MentionItem) => {
      editor.update(() => {
        const selectionState = getCurrentTextNodeSelection();
        if (!selectionState) {
          return;
        }

        const activeMentionTrigger = extractActivePromptInputTrigger(
          selectionState.textBeforeCursor,
        );
        if (
          !activeMentionTrigger ||
          TRIGGER_INFO[activeMentionTrigger.trigger].category !== item.category
        ) {
          return;
        }

        const tokenStart = selectionState.cursorOffset - activeMentionTrigger.query.length - 1;
        const tokenEnd =
          selectionState.cursorOffset +
          getActivePromptInputTokenTailLength(activeMentionTrigger, selectionState.textAfterCursor, [
            item.label,
            item.value,
            item.markdown,
          ]);
        selectionState.selection.setTextNodeRange(
          selectionState.node,
          tokenStart,
          selectionState.node,
          tokenEnd,
        );
        const trailingWhitespace = $createTextNode(" ");
        selectionState.selection.insertNodes([
          $createPromptMentionNode({
            id: item.id,
            category: item.category,
            label: item.label,
            value: item.value,
            markdown: item.markdown,
            data: item.data,
          }),
          trailingWhitespace,
        ]);
        trailingWhitespace.selectEnd();
      });

      dismissedSignatureRef.current = null;
      setActiveTrigger(null);
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        editor.focus();
      });
    },
    [editor],
  );

  const selectOption = useCallback(
    (index: number) => {
      const nextItem = flatItems[index];
      if (!nextItem) {
        return false;
      }
      insertMentionItem(nextItem);
      return true;
    },
    [flatItems, insertMentionItem],
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      // Programmatic backfill is not user input; skip trigger detection (see editorUpdateTags.ts).
      if (tags.has(PROGRAMMATIC_UPDATE_TAG)) {
        return;
      }
      // Freeze recalc while composing: pre-commit letters would filter one frame as a
      // bogus query; Lexical dispatches a final update after compositionend anyway.
      if (editor.isComposing()) {
        return;
      }
      editorState.read(() => {
        const selectionState = getCurrentTextNodeSelection();
        if (!selectionState) {
          dismissedSignatureRef.current = null;
          setActiveTrigger(null);
          return;
        }

        const nextActiveToken = extractActivePromptInputTrigger(selectionState.textBeforeCursor);
        if (!nextActiveToken) {
          dismissedSignatureRef.current = null;
          setActiveTrigger(null);
          return;
        }

        const nextSignature = getPromptInputTriggerSignature(nextActiveToken);
        if (
          dismissedSignatureRef.current !== null &&
          dismissedSignatureRef.current !== nextSignature
        ) {
          dismissedSignatureRef.current = null;
        }
        if (dismissedSignatureRef.current === nextSignature) {
          setActiveTrigger(null);
          return;
        }

        setActiveTrigger((current) =>
          current?.trigger === nextActiveToken.trigger && current.query === nextActiveToken.query
            ? current
            : { trigger: nextActiveToken.trigger, query: nextActiveToken.query },
        );
      });
    });
  }, [editor]);

  /* Commands register once per panel-open; the latest-ref avoids re-registering per keystroke. */
  const latestRef = useRef({ flatItems, selectedIndex, selectOption });
  latestRef.current = { flatItems, selectedIndex, selectOption };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const unregisterDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        const { flatItems } = latestRef.current;
        if (flatItems.length === 0) {
          return false;
        }
        event?.preventDefault();
        event?.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % flatItems.length);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        const { flatItems } = latestRef.current;
        if (flatItems.length === 0) {
          return false;
        }
        event?.preventDefault();
        event?.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const { selectedIndex, selectOption } = latestRef.current;
        if (!selectOption(selectedIndex)) {
          return false;
        }
        event?.preventDefault();
        event?.stopPropagation();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        const { selectedIndex, selectOption } = latestRef.current;
        if (!selectOption(selectedIndex)) {
          return false;
        }
        event?.preventDefault();
        event?.stopPropagation();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        dismissedSignatureRef.current = activeSignatureRef.current;
        setActiveTrigger(null);
        setSelectedIndex(0);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterBlur = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        dismissedSignatureRef.current = null;
        setActiveTrigger(null);
        setSelectedIndex(0);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unregisterDown();
      unregisterUp();
      unregisterEnter();
      unregisterTab();
      unregisterEscape();
      unregisterBlur();
    };
  }, [editor, isOpen]);

  if (!isOpen || !container) {
    return null;
  }

  const info = TRIGGER_INFO[activeTrigger.trigger];

  return createPortal(
    <MentionPanel
      title={t("mentionPanelTitle")}
      trigger={activeTrigger.trigger}
      sectionTitle={t(info.titleKey)}
      items={flatItems}
      emptyText={hasActiveQuery ? t("mentionEmptyResults") : t(info.emptyKey)}
      selectedIndex={selectedIndex}
      hasQuery={hasActiveQuery}
      footer={
        <div className="mention-panel-footer" data-testid="chat-mention-footer">
          {TRIGGER_ORDER.map((trigger) => (
            <span key={trigger} className="mention-panel-footer-item">
              <kbd>{trigger}</kbd>
              {t(TRIGGER_INFO[trigger].footerKey)}
            </span>
          ))}
        </div>
      }
      onSelect={selectOption}
    />,
    container,
  );
}

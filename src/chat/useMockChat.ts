/*
 * Mock chat state machine: sessions + a scripted reply with typewriter
 * streaming. `?mock=instant` collapses every delay for deterministic E2E.
 * Each streaming session owns a CancelToken and a permission-waiter map;
 * aborting resolves the waiters with null so the script coroutine unwinds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { initialSessions } from "./mockData";
import { isPlaceholderTitle, placeholderTitle, useI18n } from "./i18n";
import type {
  ChatMessage,
  ContentBlock,
  PermissionDecision,
  Session,
  ToolCallBlock,
} from "./types";

const INSTANT = new URLSearchParams(window.location.search).get("mock") === "instant";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, INSTANT ? 0 : ms));
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/* Script pacing (ms). */
const THINK_MS = 500;
const THINK_GAP_MS = 400;
const TOOL_RUN_MS = 700;
const EDIT_RUN_MS = 800;
const TEST_RUN_MS = 900;
const OUTPUT_LINE_MS = 90;
const TYPE_TICK_MS = 26;
const TYPE_CHARS_PER_TICK = 3;

interface CancelToken {
  cancelled: boolean;
}

function mostRecentSession(sessions: Session[]): Session {
  return sessions.reduce((a, b) => (b.updatedAtMs > a.updatedAtMs ? b : a));
}

export function useMockChat() {
  const { lang } = useI18n();
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeId, setActiveId] = useState(initialSessions[0].id);
  // Session.status mirrors "streaming" for the sidebar markers; the two are
  // written together only via send/closeStream.
  const [streamingIds, setStreamingIds] = useState<ReadonlySet<string>>(new Set());

  const tokensRef = useRef(new Map<string, CancelToken>());
  const waitersRef = useRef(new Map<string, Map<string, (d: PermissionDecision | null) => void>>());
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(
    () => () => {
      for (const token of tokensRef.current.values()) token.cancelled = true;
      for (const waiters of waitersRef.current.values()) {
        for (const resolve of waiters.values()) resolve(null);
      }
    },
    [],
  );

  const closeStream = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          status: "idle",
          messages: s.messages.map((m) =>
            m.streaming
              ? {
                  ...m,
                  streaming: false,
                  blocks: m.blocks.map((b) =>
                    b.kind === "tool" && b.status === "running" ? { ...b, status: "done" as const } : b,
                  ),
                }
              : m,
          ),
        };
      }),
    );
    setStreamingIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  /** Cancel the token, resolve waiters (coroutines see !live() and return),
   * close the stream visuals. */
  const abortStream = useCallback(
    (sessionId: string) => {
      const token = tokensRef.current.get(sessionId);
      if (token) token.cancelled = true;
      tokensRef.current.delete(sessionId);
      const waiters = waitersRef.current.get(sessionId);
      if (waiters) {
        for (const resolve of waiters.values()) resolve(null);
        waitersRef.current.delete(sessionId);
      }
      closeStream(sessionId);
    },
    [closeStream],
  );

  const patchBlocks = useCallback(
    (sessionId: string, messageId: string, fn: (blocks: ContentBlock[]) => ContentBlock[]) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m) => (m.id === messageId ? { ...m, blocks: fn(m.blocks) } : m)),
              }
            : s,
        ),
      );
    },
    [],
  );

  const patchBlock = useCallback(
    (sessionId: string, messageId: string, blockId: string, fn: (b: ContentBlock) => ContentBlock) => {
      patchBlocks(sessionId, messageId, (blocks) => blocks.map((b) => (b.id === blockId ? fn(b) : b)));
    },
    [patchBlocks],
  );

  /** Typewriter into a text/thinking block; always ends on the full text
   * (the step loop alone can stop short of the tail characters). */
  const typeInto = useCallback(
    async (token: CancelToken, sessionId: string, messageId: string, blockId: string, full: string) => {
      const write = (slice: string) => {
        patchBlock(sessionId, messageId, blockId, (b) => {
          if (b.kind === "text") return { ...b, markdown: slice };
          if (b.kind === "thinking") return { ...b, text: slice };
          return b;
        });
      };
      if (INSTANT) {
        write(full);
        return;
      }
      for (let i = 0; i < full.length; i += TYPE_CHARS_PER_TICK) {
        if (token.cancelled) return;
        write(full.slice(0, i));
        await sleep(TYPE_TICK_MS);
      }
      if (token.cancelled) return;
      write(full);
    },
    [patchBlock],
  );

  const appendOutput = useCallback(
    (sessionId: string, messageId: string, blockId: string, line: string) => {
      patchBlock(sessionId, messageId, blockId, (b) => {
        if (b.kind === "tool" && b.detail.tool === "bash") {
          return {
            ...b,
            detail: { ...b.detail, outputLines: [...b.detail.outputLines, line] },
          };
        }
        return b;
      });
    },
    [patchBlock],
  );

  const patchTool = useCallback(
    (sessionId: string, messageId: string, blockId: string, patch: Partial<ToolCallBlock>) => {
      patchBlock(sessionId, messageId, blockId, (b) => (b.kind === "tool" ? { ...b, ...patch } : b));
    },
    [patchBlock],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const sessionId = activeIdRef.current;
      if (!sessionId) return;
      if (tokensRef.current.has(sessionId)) abortStream(sessionId);

      const userMsg: ChatMessage = {
        id: uid("m"),
        role: "user",
        atMs: Date.now(),
        blocks: [{ kind: "text", id: uid("b"), markdown: text }],
      };
      const replyId = uid("m");
      const replyMsg: ChatMessage = {
        id: replyId,
        role: "assistant",
        atMs: Date.now(),
        blocks: [],
        streaming: true,
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const titled = isPlaceholderTitle(s.title) ? text.slice(0, 16) : s.title;
          return { ...s, title: titled, status: "streaming", updatedAtMs: Date.now(), messages: [...s.messages, userMsg, replyMsg] };
        }),
      );
      setStreamingIds((prev) => {
        if (prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });

      const token: CancelToken = { cancelled: false };
      tokensRef.current.set(sessionId, token);
      waitersRef.current.set(sessionId, new Map());

      void runScriptedReply(token, sessionId, replyId);
    },
    [abortStream],
  );

  const stop = useCallback(() => {
    abortStream(activeIdRef.current);
  }, [abortStream]);

  const resolvePermission = useCallback(
    (sessionId: string, messageId: string, blockId: string, decision: PermissionDecision) => {
      patchBlock(sessionId, messageId, blockId, (b) =>
        b.kind === "permission" ? { ...b, decision } : b,
      );
      const waiter = waitersRef.current.get(sessionId)?.get(blockId);
      if (waiter) {
        waitersRef.current.get(sessionId)?.delete(blockId);
        waiter(decision);
      }
    },
    [patchBlock],
  );

  /** New session (project when dir given); reuses an equivalent empty
   * placeholder instead of stacking. */
  const newSession = useCallback(
    (dir?: string) => {
      const existing = sessions.find(
        (s) =>
          isPlaceholderTitle(s.title) &&
          s.messages.length === 0 &&
          (dir ? s.kind === "project" && s.dir === dir : s.kind === "chat"),
      );
      if (existing) {
        setActiveId(existing.id);
        return existing.id;
      }
      const id = uid("s");
      setSessions((prev) => {
        let n = 0;
        for (const s of prev) {
          const m = /^(?:新会话|New session)(?: (\d+))?$/.exec(s.title);
          if (m) n = Math.max(n, m[1] ? Number(m[1]) : 1);
        }
        const s: Session = {
          id,
          title: placeholderTitle(n + 1, lang),
          kind: dir ? "project" : "chat",
          ...(dir ? { dir } : {}),
          status: "idle",
          updatedAtMs: Date.now(),
          messages: [],
        };
        return [s, ...prev];
      });
      setActiveId(id);
      return id;
    },
    [sessions, lang],
  );

  /** Remove a session; a deleted active one falls back to the most recently
   * updated remaining session, or a fresh empty chat when none is left. */
  const deleteSession = useCallback(
    (id: string) => {
      abortStream(id);
      const remaining = sessionsRef.current.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh: Session = {
          id: uid("s"),
          title: placeholderTitle(1, lang),
          kind: "chat",
          status: "idle",
          updatedAtMs: Date.now(),
          messages: [],
        };
        setSessions([fresh]);
        setActiveId(fresh.id);
        return;
      }
      setSessions(remaining);
      if (activeIdRef.current === id) setActiveId(mostRecentSession(remaining).id);
    },
    [abortStream, lang],
  );

  const selectSession = useCallback((id: string) => {
    setActiveId(id);
    setSessions((prev) => prev.map((s) => (s.id === id && s.status === "unread" ? { ...s, status: "idle" } : s)));
  }, []);

  const activeSession = sessions.find((s) => s.id === activeId) ?? mostRecentSession(sessions);

  return {
    sessions,
    activeSession,
    streaming: streamingIds.has(activeSession.id),
    send,
    stop,
    newSession,
    deleteSession,
    selectSession,
    resolvePermission,
  };

  /* ------------------------------------------------------------------ */

  async function runScriptedReply(token: CancelToken, sessionId: string, replyId: string) {
    const live = () => !token.cancelled;
    const P = <T extends ContentBlock>(block: T) => {
      patchBlocks(sessionId, replyId, (blocks) => [...blocks, block]);
      return block.id;
    };

    await sleep(THINK_MS);
    if (!live()) return;

    const thinkId = uid("b");
    P({ kind: "thinking", id: thinkId, startedAtMs: Date.now(), text: "" });
    await typeInto(
      token,
      sessionId,
      replyId,
      thinkId,
      "先确认现状再动手:看一眼现有组件与 testid,确定改动面最小的一条路径,工具卡跑完再总结。",
    );
    await sleep(THINK_GAP_MS);
    if (!live()) return;
    patchBlock(sessionId, replyId, thinkId, (b) =>
      b.kind === "thinking" ? { ...b, durationMs: Date.now() - b.startedAtMs } : b,
    );

    const textId = uid("b");
    P({ kind: "text", id: textId, markdown: "" });
    await typeInto(token, sessionId, replyId, textId, "收到。我先扫一遍当前实现,确认改动面:");
    if (!live()) return;

    const bashId = uid("b");
    P({
      kind: "tool",
      id: bashId,
      name: "Bash",
      status: "running",
      summary: 'rg -n "chat-" src/chat',
      detail: { tool: "bash", command: 'rg -n "chat-" src/chat', outputLines: [] },
    });
    await sleep(TOOL_RUN_MS);
    const lines = [
      "src/chat/Sidebar.tsx:34:  data-testid=\"chat-session-item\"",
      "src/chat/Composer.tsx:52:  data-testid=\"chat-send\"",
      "src/chat/ChatApp.tsx:18:  data-testid=\"chat-root\"",
      "src/chat/blocks/ToolCard.tsx:40:  data-testid=\"chat-tool-card\"",
    ];
    for (const line of lines) {
      if (!live()) return;
      appendOutput(sessionId, replyId, bashId, line);
      await sleep(OUTPUT_LINE_MS);
    }
    patchTool(sessionId, replyId, bashId, { status: "done", summary: 'rg -n "chat-" src/chat (4 处)' });

    const editId = uid("b");
    P({
      kind: "tool",
      id: editId,
      name: "Edit",
      status: "running",
      summary: "src/chat/Sidebar.tsx",
      detail: {
        tool: "edit",
        path: "src/chat/Sidebar.tsx",
        hunks: [
          {
            header: "@@ -58,6 +58,11 @@ export function Sidebar() {",
            lines: [
              { kind: "equal", oldLine: 58, newLine: 58, text: "  return (" },
              { kind: "del", oldLine: 59, text: "    <nav data-testid=\"chat-sidebar\">" },
              { kind: "add", newLine: 59, text: "    <nav" },
              { kind: "add", newLine: 60, text: "      data-testid=\"chat-sidebar\"" },
              { kind: "add", newLine: 61, text: "      data-session-count={sessions.length}" },
              { kind: "add", newLine: 62, text: "      aria-label=\"会话侧栏\"" },
              { kind: "add", newLine: 63, text: "    >" },
              { kind: "equal", oldLine: 60, newLine: 64, text: "      <SectionLabel>会话</SectionLabel>" },
            ],
          },
        ],
      },
    });
    await sleep(EDIT_RUN_MS);
    if (!live()) return;
    patchTool(sessionId, replyId, editId, { status: "done" });

    const text2Id = uid("b");
    P({ kind: "text", id: text2Id, markdown: "" });
    await typeInto(token, sessionId, replyId, text2Id, "改完了:侧栏现在向 ego-browser 暴露 `data-session-count`,断言不用数 DOM 节点。改动可以测试了:");
    if (!live()) return;

    const permId = uid("b");
    P({
      kind: "permission",
      id: permId,
      toolName: "Bash",
      summary: "cargo test --workspace",
      command: "cargo test --workspace",
    });
    let waiters = waitersRef.current.get(sessionId);
    if (!waiters) {
      waiters = new Map();
      waitersRef.current.set(sessionId, waiters);
    }
    const decision = await new Promise<PermissionDecision | null>((resolve) => {
      waiters.set(permId, resolve);
    });
    waiters.delete(permId);
    if (!live()) return;

    const text3Id = uid("b");
    P({ kind: "text", id: text3Id, markdown: "" });
    if (decision === "deny") {
      await typeInto(token, sessionId, replyId, text3Id, "好的,跳过测试。改动已完成,需要时可以手动跑。");
    } else {
      const testId = uid("b");
      P({
        kind: "tool",
        id: testId,
        name: "Bash",
        status: "running",
        summary: "cargo test --workspace",
        detail: { tool: "bash", command: "cargo test --workspace", outputLines: [] },
      });
      await sleep(TEST_RUN_MS);
      if (!live()) return;
      for (const line of [
        "running 6 tests",
        "test rpc::greet_returns_greeting ... ok",
        "test rpc::info_returns_version ... ok",
        "test result: ok. 6 passed; 0 failed;",
      ]) {
        appendOutput(sessionId, replyId, testId, line);
        await sleep(OUTPUT_LINE_MS);
      }
      patchTool(sessionId, replyId, testId, { status: "done" });
      await typeInto(token, sessionId, replyId, text3Id, "测试通过:6 passed。这轮改动收尾了。");
    }

    if (!live()) return;
    closeStream(sessionId);
  }
}

/*
 * Mock chat state machine: sessions + a scripted reply with typewriter
 * streaming. `?mock=instant` collapses every delay; `?mock=showcase` seeds the
 * all-block-types session (comma-combinable, e.g. ?mock=instant,showcase).
 * Each streaming session owns a CancelToken and a permission-waiter map;
 * aborting resolves the waiters with null so the script coroutine unwinds.
 *
 * newTask() drafts become sessions only on first send.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { initialGroups, initialProjects, initialSessions, SHOWCASE_SESSION } from "./mockData";
import type {
  ChatMessage,
  ContentBlock,
  Draft,
  PermissionDecision,
  Project,
  Session,
  TaskGroup,
  ToolCallBlock,
} from "./types";
import { diffStats } from "./types";

const MOCK = (new URLSearchParams(window.location.search).get("mock") ?? "")
  .split(",")
  .map((v) => v.trim());
const INSTANT = MOCK.includes("instant");
const SHOWCASE = MOCK.includes("showcase");
const SEED_SESSIONS = SHOWCASE ? [SHOWCASE_SESSION, ...initialSessions] : initialSessions;

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

const EMPTY_QUEUE: string[] = [];

function mostRecentSession(sessions: Session[]): Session | undefined {
  return sessions.reduce<Session | undefined>((a, b) => (!a || b.updatedAtMs > a.updatedAtMs ? b : a), undefined);
}

export function useMockChat() {
  const [sessions, setSessions] = useState<Session[]>(SEED_SESSIONS);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  /* activeId === null implies draft !== null. */
  const [activeId, setActiveId] = useState<string | null>(SEED_SESSIONS[0].id);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Session.status mirrors "streaming" for the sidebar markers; the two are
  // written together only via send/closeStream.
  const [streamingIds, setStreamingIds] = useState<ReadonlySet<string>>(
    () => (SHOWCASE ? new Set([SHOWCASE_SESSION.id]) : new Set()),
  );
  /* messages sent while streaming, dispatched head-first on idle */
  const [queues, setQueues] = useState<Record<string, string[]>>(() =>
    SHOWCASE ? { [SHOWCASE_SESSION.id]: ["再列一下剩余风险"] } : {},
  );
  /* Showcase tableau: queue seeded paused so stop() stays a bounded wrap-up;
   * chat-queue-resume (after stop) is the lever into the live flow. */
  const [queuePaused, setQueuePaused] = useState<ReadonlySet<string>>(
    () => (SHOWCASE ? new Set([SHOWCASE_SESSION.id]) : new Set()),
  );

  /* Dead token keeps the seeded stream routable like a live one: direct sends
   * queue instead of starting a concurrent reply. */
  const tokensRef = useRef(
    new Map<string, CancelToken>(SHOWCASE ? [[SHOWCASE_SESSION.id, { cancelled: true }]] : []),
  );
  const waitersRef = useRef(new Map<string, Map<string, (d: PermissionDecision | null) => void>>());
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /** activeId === null must imply draft !== null. */
  const activateDraft = useCallback((seed?: Draft) => {
    setDraft((prev) => prev ?? seed ?? { text: "" });
    setActiveId(null);
  }, []);

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
    // drop the defunct token so a later send() starts a fresh run
    tokensRef.current.delete(sessionId);
    // Background completions land as an unread timestamp.
    const backgrounded = sessionId !== activeIdRef.current;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          status: "idle",
          ...(backgrounded && !s.archived ? { unreadAtMs: Date.now() } : {}),
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

  /** First send on a draft commits it as a session (ZCodium draft lifecycle);
   * the title comes from the message text like every first reply. */
  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    // Any explicit send resumes the queue drain (undoes a stop-pause).
    const targetId = activeIdRef.current;
    if (targetId !== null) {
      setQueuePaused((prev) => {
        if (!prev.has(targetId)) return prev;
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      if (tokensRef.current.has(targetId)) {
        setQueues((prev) => ({ ...prev, [targetId]: [...(prev[targetId] ?? []), text] }));
        return;
      }
    }

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

    let sessionId = targetId;
    if (sessionId === null) {
      const d = draftRef.current;
      if (!d) return;
      const created: Session = {
        id: uid("s"),
        title: text.slice(0, 16),
        pinned: false,
        archived: false,
        status: "streaming",
        updatedAtMs: Date.now(),
        messages: [userMsg, replyMsg],
        ...(d.projectId ? { projectId: d.projectId } : {}),
        ...(d.groupId ? { groupId: d.groupId } : {}),
      };
      sessionId = created.id;
      setSessions((prev) => [created, ...prev]);
      setDraft(null);
      setActiveId(created.id);
    } else {
      const id = sessionId;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status: "streaming", updatedAtMs: Date.now(), messages: [...s.messages, userMsg, replyMsg] }
            : s,
        ),
      );
    }
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
  }, []);

  /** Stop aborts the run and pauses the queue drain. */
  const stop = useCallback(() => {
    const sessionId = activeIdRef.current;
    if (!sessionId) return;
    abortStream(sessionId);
    setQueuePaused((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
  }, [abortStream]);

  const removeQueued = useCallback((sessionId: string, index: number) => {
    setQueues((prev) => {
      const list = prev[sessionId];
      if (!list || index < 0 || index >= list.length) return prev;
      const next = list.filter((_, i) => i !== index);
      const rest = { ...prev };
      if (next.length === 0) delete rest[sessionId];
      else rest[sessionId] = next;
      return rest;
    });
  }, []);

  const resumeQueue = useCallback((sessionId: string) => {
    setQueuePaused((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

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

  /** Start (or return to) the draft. The draft keeps its original project /
   * group context; per-target args only seed a fresh draft. */
  const newTask = useCallback(
    (projectId?: string, groupId?: string) => {
      activateDraft(projectId || groupId ? { text: "", projectId, groupId } : undefined);
    },
    [activateDraft],
  );

  const updateDraftText = useCallback((text: string) => {
    setDraft((prev) => (prev ? { ...prev, text } : prev));
  }, []);

  /** Remove a session; a deleted active one falls back to the most recently
   * updated remaining session, or the draft when none is left. */
  const deleteSession = useCallback(
    (id: string) => {
      abortStream(id);
      setQueues((prev) => {
        if (!(id in prev)) return prev;
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
      setQueuePaused((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const remaining = sessionsRef.current.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        setSessions(remaining);
        activateDraft();
        return;
      }
      setSessions(remaining);
      if (activeIdRef.current === id) {
        const next = mostRecentSession(remaining);
        if (next) setActiveId(next.id);
      }
    },
    [abortStream, activateDraft],
  );

  /** Select; clear unread only when it still matches the rendered value. */
  const selectSession = useCallback((id: string, expectedUnreadAtMs?: number) => {
    setActiveId(id);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id && s.unreadAtMs !== undefined && (expectedUnreadAtMs === undefined || s.unreadAtMs === expectedUnreadAtMs)
          ? { ...s, unreadAtMs: undefined }
          : s,
      ),
    );
  }, []);

  const togglePin = useCallback((id: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
  }, []);

  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, archived } : s)));
      if (archived && activeIdRef.current === id) {
        const next = mostRecentSession(sessionsRef.current.filter((s) => s.id !== id && !s.archived));
        if (next) {
          setActiveId(next.id);
          return;
        }
        activateDraft();
      }
    },
    [activateDraft],
  );

  const renameSession = useCallback((id: string, title: string) => {
    const name = title.trim();
    if (!name) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: name, titleOverridden: true } : s)));
  }, []);

  const markUnread = useCallback((id: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, unreadAtMs: Date.now() } : s)));
  }, []);

  const moveToProject = useCallback((id: string, projectId?: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? projectId
            ? { ...s, projectId }
            : { ...s, projectId: undefined }
          : s,
      ),
    );
  }, []);

  const saveProject = useCallback((input: { id?: string; name: string }) => {
    const name = input.name.trim();
    if (!name) return;
    if (input.id) {
      setProjects((prev) => prev.map((p) => (p.id === input.id ? { ...p, name } : p)));
      return;
    }
    setProjects((prev) => [...prev, { id: uid("p"), name, pinned: false, createdAtMs: Date.now() }]);
  }, []);

  /** Delete detaches member sessions (they fall back to the unfiled list). */
  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSessions((prev) =>
      prev.map((s) => (s.projectId === id ? { ...s, projectId: undefined } : s)),
    );
  }, []);

  const toggleProjectPin = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)));
  }, []);

  const activeSession = activeId === null ? null : (sessions.find((s) => s.id === activeId) ?? null);
  const streaming = activeSession !== null && streamingIds.has(activeSession.id);
  const queued = activeSession !== null ? (queues[activeSession.id] ?? EMPTY_QUEUE) : EMPTY_QUEUE;

  /* Drain: dispatch the head on each idle edge; stop pauses, send or the
   * resume button un-pauses. */
  useEffect(() => {
    if (activeSession === null || streaming || queuePaused.has(activeSession.id) || queued.length === 0) return;
    const next = queued[0];
    const activeKey = activeSession.id;
    setQueues((prev) => {
      const rest = (prev[activeKey] ?? []).slice(1);
      const later = { ...prev };
      if (rest.length === 0) delete later[activeKey];
      else later[activeKey] = rest;
      return later;
    });
    send(next);
  }, [streaming, queued, queuePaused, activeSession, send]);

  const archivedSessions = sessions.filter((s) => s.archived);

  const groups: TaskGroup[] = initialGroups;

  return {
    sessions,
    projects,
    groups,
    archivedSessions,
    draft,
    activeSession,
    streaming,
    queued,
    queuePaused: activeSession !== null && queuePaused.has(activeSession.id),
    send,
    stop,
    removeQueued,
    resumeQueue,
    newTask,
    updateDraftText,
    deleteSession,
    selectSession,
    resolvePermission,
    togglePin,
    setArchived,
    renameSession,
    markUnread,
    moveToProject,
    saveProject,
    deleteProject,
    toggleProjectPin,
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
    const editHunk = {
      header: "@@ -58,6 +58,11 @@ export function TaskSidebar() {",
      lines: [
        { kind: "equal" as const, oldLine: 58, newLine: 58, text: "  return (" },
        { kind: "del" as const, oldLine: 59, text: "    <nav data-testid=\"chat-sidebar\">" },
        { kind: "add" as const, newLine: 59, text: "    <nav" },
        { kind: "add" as const, newLine: 60, text: "      data-testid=\"chat-sidebar\"" },
        { kind: "add" as const, newLine: 61, text: "      data-session-count={sessions.length}" },
        { kind: "add" as const, newLine: 62, text: "      aria-label=\"会话侧栏\"" },
        { kind: "add" as const, newLine: 63, text: "    >" },
        { kind: "equal" as const, oldLine: 60, newLine: 64, text: "      <SectionLabel>会话</SectionLabel>" },
      ],
    };
    P({
      kind: "tool",
      id: editId,
      name: "Edit",
      status: "running",
      summary: "src/chat/sidebar/TaskSidebar.tsx",
      detail: { tool: "edit", path: "src/chat/sidebar/TaskSidebar.tsx", hunks: [editHunk] },
    });
    await sleep(EDIT_RUN_MS);
    if (!live()) return;
    patchTool(sessionId, replyId, editId, { status: "done" });
    const stats = diffStats([editHunk]);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, changeSummary: { fileCount: 1, added: stats.add, removed: stats.del } } : s,
      ),
    );

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

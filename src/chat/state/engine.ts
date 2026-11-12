/* Run engine: mock flags, pacing, the run registry (tokens + permission
 * waiters), and the script ctx. Mechanism only — the scripted content lives
 * in mockScript.ts; a real transport would reuse this layer. */
import type { ContentBlock, PermissionDecision } from "../types";
import { mockScript } from "./mockScript";
import type { SessionStore } from "./store";
import type { Action } from "./types";

// Comma-combinable ?mock modes (instant, showcase).
const MOCK = (new URLSearchParams(window.location.search).get("mock") ?? "")
  .split(",")
  .map((v) => v.trim());
const INSTANT = MOCK.includes("instant");
export const SHOWCASE = MOCK.includes("showcase");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, INSTANT ? 0 : ms));
export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

const TYPE_TICK_MS = 26;
const TYPE_CHARS_PER_TICK = 3;

interface CancelToken {
  cancelled: boolean;
}

export interface RunRegistry {
  /** Register a fresh live run, overwriting any previous entry. */
  start(sessionId: string): CancelToken;
  /** Cancel + unregister; pending waiters resolve null so the coroutine
   * unwinds. A miss is a no-op, which is exactly the seed-run semantics. */
  cancel(sessionId: string): void;
  cancelAll(): void;
  waitFor(sessionId: string, blockId: string): Promise<PermissionDecision | null>;
  resolve(sessionId: string, blockId: string, decision: PermissionDecision): void;
}

export function createRunRegistry(): RunRegistry {
  const tokens = new Map<string, CancelToken>();
  const waiters = new Map<string, Map<string, (d: PermissionDecision | null) => void>>();

  const resolveAll = (sessionId: string) => {
    const map = waiters.get(sessionId);
    if (!map) return;
    for (const resolve of map.values()) resolve(null);
    waiters.delete(sessionId);
  };

  return {
    start(sessionId) {
      // Defensive: a replaced live coroutine must not outlive its token.
      const prev = tokens.get(sessionId);
      if (prev) prev.cancelled = true;
      const token: CancelToken = { cancelled: false };
      tokens.set(sessionId, token);
      waiters.set(sessionId, new Map());
      return token;
    },
    cancel(sessionId) {
      const token = tokens.get(sessionId);
      if (token) token.cancelled = true;
      tokens.delete(sessionId);
      resolveAll(sessionId);
    },
    cancelAll() {
      for (const token of tokens.values()) token.cancelled = true;
      tokens.clear();
      for (const sessionId of [...waiters.keys()]) resolveAll(sessionId);
    },
    waitFor(sessionId, blockId) {
      let map = waiters.get(sessionId);
      if (!map) {
        map = new Map();
        waiters.set(sessionId, map);
      }
      return new Promise((resolve) => {
        map.set(blockId, resolve);
      });
    },
    resolve(sessionId, blockId, decision) {
      const map = waiters.get(sessionId);
      map?.get(blockId)?.(decision);
      map?.delete(blockId);
    },
  };
}

/** What a scripted reply may do; mockScript consumes this and a real
 * StreamChunk handler would emit the same actions. */
export interface ScriptCtx {
  sessionId: string;
  isLive(): boolean;
  sleep(ms: number): Promise<void>;
  uid(prefix: string): string;
  /** Raw action escape hatch (e.g. session/patchMeta for changeSummary). */
  emit(action: Action): void;
  append(block: ContentBlock): void;
  patchBlock(blockId: string, patch: (b: ContentBlock) => ContentBlock): void;
  /** Typewriter into a text/thinking block; always ends on the full text. */
  typeInto(blockId: string, full: string): Promise<void>;
  /** Append a permission block and await the decision (null on abort). */
  askPermission(block: Extract<ContentBlock, { kind: "permission" }>): Promise<PermissionDecision | null>;
  /** Close the run (normal path). */
  finish(outcome?: "done" | "error"): void;
}

/** Launch the script coroutine. Must run in the same tick as the
 * run-starting dispatch — the send gate never sees a half-started run. */
export function startScript(store: SessionStore, registry: RunRegistry, sessionId: string, replyId: string): void {
  const token = registry.start(sessionId);
  const ctx: ScriptCtx = {
    sessionId,
    isLive: () => !token.cancelled,
    sleep,
    uid,
    emit: (action) => store.dispatch(action),
    append: (block) => store.dispatch({ type: "block/append", sessionId, messageId: replyId, block }),
    patchBlock: (blockId, patch) =>
      store.dispatch({ type: "block/patch", sessionId, messageId: replyId, blockId, patch }),
    async typeInto(blockId, full) {
      const write = (slice: string) =>
        ctx.patchBlock(blockId, (b) => {
          if (b.kind === "text") return { ...b, markdown: slice };
          if (b.kind === "thinking") return { ...b, text: slice };
          return b;
        });
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
    askPermission(block) {
      ctx.append(block);
      return registry.waitFor(sessionId, block.id);
    },
    finish(outcome) {
      registry.cancel(sessionId);
      store.dispatch({ type: "run/finish", sessionId, outcome: outcome ?? "done" });
    },
  };
  void mockScript(ctx);
}

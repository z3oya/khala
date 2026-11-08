/*
 * Mock domain types. camelCase mirrors the khala-core DTO conventions
 * (AGENTS.md) so these shapes can become real Rust DTOs; contentBlocks
 * follows claudian's StreamChunk contract.
 */

export type ToolStatus = "running" | "done" | "error";
export type SessionStatus = "idle" | "streaming" | "error" | "unread";
export type PermissionDecision = "allowOnce" | "alwaysAllow" | "deny";

export interface DiffLine {
  kind: "equal" | "add" | "del";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface DiffHunk {
  header: string; // e.g. "@@ -12,7 +12,9 @@"
  lines: DiffLine[];
}

export interface TodoItem {
  text: string;
  state: "done" | "inProgress" | "pending";
}

export type ToolDetail =
  | { tool: "bash"; command: string; outputLines: string[]; exitCode?: number; hiddenLines?: number }
  | { tool: "read"; path: string; lineCount: number; preview?: string[] }
  | { tool: "grep"; pattern: string; matchCount: number; files: string[] }
  | { tool: "glob"; pattern: string; matchCount: number; files: string[] }
  | { tool: "write"; path: string; hunks: DiffHunk[] }
  | { tool: "edit"; path: string; hunks: DiffHunk[] }
  | { tool: "todo"; items: TodoItem[] }
  | { tool: "webFetch"; url: string; title: string };

export interface ToolCallBlock {
  kind: "tool";
  id: string;
  name: string; // display name, e.g. "Bash"
  status: ToolStatus;
  summary: string;
  detail: ToolDetail;
}

export interface ThinkingBlock {
  kind: "thinking";
  id: string;
  startedAtMs: number;
  durationMs?: number; // undefined → live, timer still counting
  text: string;
}

export interface TextBlock {
  kind: "text";
  id: string;
  markdown: string;
}

export interface PermissionBlock {
  kind: "permission";
  id: string;
  toolName: string;
  summary: string;
  command?: string;
  decision?: PermissionDecision; // undefined → pending
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | PermissionBlock;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  atMs: number;
  blocks: ContentBlock[];
  streaming?: boolean;
}

export type SessionKind = "chat" | "project";

export interface Session {
  id: string;
  title: string;
  kind: SessionKind;
  /** project sessions only; mirror (kind, dir) as a tagged enum in khala-core. */
  dir?: string;
  status: SessionStatus;
  updatedAtMs: number;
  messages: ChatMessage[];
}

export function diffStats(hunks: DiffHunk[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.kind === "add") add += 1;
      else if (l.kind === "del") del += 1;
    }
  }
  return { add, del };
}

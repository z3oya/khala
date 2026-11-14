/* Canned scripted reply; a real transport replaces this file with a
 * StreamChunk handler emitting the same actions. */
import { diffStats, type PermissionDecision } from "../types";
import type { ScriptCtx } from "./engine";

const THINK_MS = 500;
const THINK_GAP_MS = 400;
const TOOL_RUN_MS = 700;
const EDIT_RUN_MS = 800;
const TEST_RUN_MS = 900;
const OUTPUT_LINE_MS = 90;

export async function mockScript(ctx: ScriptCtx): Promise<void> {
  const live = ctx.isLive;
  const { append } = ctx;

  await ctx.sleep(THINK_MS);
  if (!live()) return;

  const thinkId = ctx.uid("b");
  append({ kind: "thinking", id: thinkId, startedAtMs: Date.now(), text: "" });
  await ctx.typeInto(
    thinkId,
    "先确认现状再动手:看一眼现有组件与 testid,确定改动面最小的一条路径,工具卡跑完再总结。",
  );
  await ctx.sleep(THINK_GAP_MS);
  if (!live()) return;
  ctx.patchBlock(thinkId, (b) =>
    b.kind === "thinking" ? { ...b, durationMs: Date.now() - b.startedAtMs } : b,
  );

  const textId = ctx.uid("b");
  append({ kind: "text", id: textId, markdown: "" });
  await ctx.typeInto(textId, "收到。我先扫一遍当前实现,确认改动面:");
  if (!live()) return;

  const bashId = ctx.uid("b");
  append({
    kind: "tool",
    id: bashId,
    name: "Bash",
    status: "running",
    summary: 'rg -n "chat-" src/chat',
    detail: { tool: "bash", command: 'rg -n "chat-" src/chat', outputLines: [] },
  });
  await ctx.sleep(TOOL_RUN_MS);
  const lines = [
    'src/chat/Sidebar.tsx:34:  data-testid="chat-session-item"',
    'src/chat/Composer.tsx:52:  data-testid="chat-send"',
    'src/chat/ChatApp.tsx:18:  data-testid="chat-root"',
    'src/chat/blocks/ToolCard.tsx:40:  data-testid="chat-tool-card"',
  ];
  for (const line of lines) {
    if (!live()) return;
    ctx.patchBlock(bashId, (b) =>
      b.kind === "tool" && b.detail.tool === "bash"
        ? { ...b, detail: { ...b.detail, outputLines: [...b.detail.outputLines, line] } }
        : b,
    );
    await ctx.sleep(OUTPUT_LINE_MS);
  }
  ctx.patchBlock(bashId, (b) =>
    b.kind === "tool" ? { ...b, status: "done", summary: 'rg -n "chat-" src/chat (4 处)' } : b,
  );

  const editId = ctx.uid("b");
  const editHunk = {
    header: "@@ -58,6 +58,11 @@ export function TaskSidebar() {",
    lines: [
      { kind: "equal" as const, oldLine: 58, newLine: 58, text: "  return (" },
      { kind: "del" as const, oldLine: 59, text: '    <nav data-testid="chat-sidebar">' },
      { kind: "add" as const, newLine: 59, text: "    <nav" },
      { kind: "add" as const, newLine: 60, text: "      data-testid=\"chat-sidebar\"" },
      { kind: "add" as const, newLine: 61, text: "      data-session-count={sessions.length}" },
      { kind: "add" as const, newLine: 62, text: "      aria-label=\"会话侧栏\"" },
      { kind: "add" as const, newLine: 63, text: "    >" },
      { kind: "equal" as const, oldLine: 60, newLine: 64, text: "      <SectionLabel>会话</SectionLabel>" },
    ],
  };
  append({
    kind: "tool",
    id: editId,
    name: "Edit",
    status: "running",
    summary: "src/chat/sidebar/TaskSidebar.tsx",
    detail: { tool: "edit", path: "src/chat/sidebar/TaskSidebar.tsx", hunks: [editHunk] },
  });
  await ctx.sleep(EDIT_RUN_MS);
  if (!live()) return;
  ctx.patchBlock(editId, (b) => (b.kind === "tool" ? { ...b, status: "done" } : b));
  const stats = diffStats([editHunk]);
  ctx.emit({
    type: "session/patchMeta",
    id: ctx.sessionId,
    patch: { changeSummary: { fileCount: 1, added: stats.add, removed: stats.del } },
  });

  const text2Id = ctx.uid("b");
  append({ kind: "text", id: text2Id, markdown: "" });
  await ctx.typeInto(text2Id, "改完了:侧栏现在向 ego-browser 暴露 `data-session-count`,断言不用数 DOM 节点。改动可以测试了:");
  if (!live()) return;

  const permId = ctx.uid("b");
  const decision: PermissionDecision | null = await ctx.askPermission({
    kind: "permission",
    id: permId,
    toolName: "Bash",
    summary: "cargo test --workspace",
    command: "cargo test --workspace",
  });
  if (!live()) return;

  const text3Id = ctx.uid("b");
  append({ kind: "text", id: text3Id, markdown: "" });
  if (decision === "deny") {
    await ctx.typeInto(text3Id, "好的,跳过测试。改动已完成,需要时可以手动跑。");
  } else {
    const testId = ctx.uid("b");
    append({
      kind: "tool",
      id: testId,
      name: "Bash",
      status: "running",
      summary: "cargo test --workspace",
      detail: { tool: "bash", command: "cargo test --workspace", outputLines: [] },
    });
    await ctx.sleep(TEST_RUN_MS);
    if (!live()) return;
    for (const line of [
      "running 6 tests",
      "test rpc::greet_returns_greeting ... ok",
      "test rpc::info_returns_version ... ok",
      "test result: ok. 6 passed; 0 failed;",
    ]) {
      ctx.patchBlock(testId, (b) =>
        b.kind === "tool" && b.detail.tool === "bash"
          ? { ...b, detail: { ...b.detail, outputLines: [...b.detail.outputLines, line] } }
          : b,
      );
      await ctx.sleep(OUTPUT_LINE_MS);
    }
    ctx.patchBlock(testId, (b) => (b.kind === "tool" ? { ...b, status: "done" } : b));
    await ctx.typeInto(text3Id, "测试通过:6 passed。这轮改动收尾了。");
    if (!live()) return;

    /* Streams a mermaid fence: unclosed renders as code, the closing fence
     * flips it to a diagram. */
    const text4Id = ctx.uid("b");
    append({ kind: "text", id: text4Id, markdown: "" });
    await ctx.typeInto(
      text4Id,
      "mermaid 画出一张这轮链路:\n\n```mermaid\nflowchart LR\n  C[Composer] --> E[engine]\n  E --> T[工具卡]\n  T --> S[总结文本]\n```",
    );
  }

  if (!live()) return;
  ctx.finish("done");
}

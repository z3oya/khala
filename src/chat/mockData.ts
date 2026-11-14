/* Static demo data; times relative to load. Covers every sidebar row state. */
import type { Project, Session, TaskGroup } from "./types";

const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;
const now = Date.now();

export const initialProjects: Project[] = [
  { id: "p-khala", name: "khala", path: "~/lab/khala", pinned: true, createdAtMs: now - 30 * day },
  { id: "p-goose", name: "goose", path: "~/lab/goose", pinned: false, createdAtMs: now - 20 * day },
  { id: "p-blog", name: "blog", path: "~/space/blog", pinned: false, createdAtMs: now - 9 * day },
];

export const initialGroups: TaskGroup[] = [
  { id: "g-hot", name: "本周焦点", color: "red" },
  { id: "g-research", name: "调研", color: "blue" },
];

const user = (id: string, atMs: number, markdown: string) => ({
  id,
  role: "user" as const,
  atMs,
  blocks: [{ kind: "text" as const, id: `${id}-b`, markdown }],
});

const reply = (id: string, atMs: number, markdown: string) => ({
  id,
  role: "assistant" as const,
  atMs,
  blocks: [
    { kind: "text" as const, id: `${id}-b`, markdown },
  ] as Session["messages"][number]["blocks"],
});

export const initialSessions: Session[] = [
  {
    id: "s-ui-first",
    title: "UI 首版 · 灰阶设计",
    titleOverridden: false,
    createdAtMs: now - 95 * min,
    projectId: "p-khala",
    pinned: true,
    archived: false,
    status: "idle",
    updatedAtMs: now - 38 * min,
    changeSummary: { fileCount: 3, added: 24, removed: 11 },
    messages: [
      {
        id: "m1",
        role: "user",
        atMs: now - 95 * min,
        blocks: [
          {
            kind: "text",
            id: "m1-b1",
            markdown:
              "参考 goose 的侧栏结构,给 khala 出一版纯前端的 coding-agent 界面。主配色白、渐进灰、渐进黑,圆角收敛,别像 goose 那样满屏胶囊。",
          },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        atMs: now - 94 * min,
        blocks: [
          {
            kind: "thinking",
            id: "m2-b1",
            startedAtMs: now - 94 * min,
            durationMs: 14_000,
            text:
              "需求要点:左侧栏 + 按目录分组的会话列表;灰阶要拉开层级,不能糊成一片浅灰;圆角收敛到 4/6/8 三档。goose 的胶囊导航和 12-16px 卡片圆角是它的品牌感来源,但与收敛目标冲突——侧栏改用通高面板 + 1px 边框,更利落。黑只放在层级终点:用户气泡、主按钮、激活态,黑白反转。",
          },
          {
            kind: "text",
            id: "m2-b2",
            markdown:
              "方案定了,先说结论:\n\n- **布局**:左侧通栏 sidebar(264px,可折叠到 0),主区自上而下是顶栏 / 消息流 / composer\n- **色阶**:暖白 `#FBFBFC` 画布,经灰阶部件,到深灰 `#17171C` 作为用户气泡与主按钮的层级终点,全程不用纯黑纯白\n- **圆角**:只保留 4 / 6 / 8 三档,胶囊只留给状态点\n\n工具卡、diff、命令输出全部等宽字体,向终端质感看齐:\n\n```css\n.chat-app {\n  --ink: #17171c;\n  --r-sm: 4px;\n  --r-md: 6px;\n  --r-lg: 8px;\n}\n```\n\n接下来按这套规范落 tokens 和组件。",
          },
          {
            kind: "tool",
            id: "m2-b3",
            name: "TodoWrite",
            status: "done",
            summary: "4 项计划",
            detail: {
              tool: "todo",
              items: [
                { text: "确定侧栏结构与信息层级", state: "done" },
                { text: "设计令牌:色阶 / 圆角 / 字号", state: "done" },
                { text: "工具卡与 diff 组件", state: "inProgress" },
                { text: "浏览器走查与截图自查", state: "pending" },
              ],
            },
          },
          {
            kind: "tool",
            id: "m2-b4",
            name: "Read",
            status: "done",
            summary: "src/App.tsx",
            detail: {
              tool: "read",
              path: "src/App.tsx",
              lineCount: 112,
              preview: [
                "function App() {",
                '  const [name, setName] = useState("");',
                "  const [greeting, setGreeting] = useState<string | null>(null);",
                "  const [history, setHistory] = useState<GreetRecord[]>([]);",
                "  const [error, setError] = useState<string | null>(null);",
              ],
            },
          },
          {
            kind: "tool",
            id: "m2-b5",
            name: "Edit",
            status: "done",
            summary: "src/chat/tokens.css",
            detail: {
              tool: "edit",
              path: "src/chat/tokens.css",
              hunks: [
                {
                  header: "@@ -1,3 +1,19 @@",
                  lines: [
                    { kind: "equal", oldLine: 1, newLine: 1, text: "/* design tokens */" },
                    { kind: "del", oldLine: 2, text: ":root {" },
                    { kind: "del", oldLine: 3, text: "  --accent: #396cd8;" },
                    { kind: "add", newLine: 2, text: ".chat-app {" },
                    { kind: "add", newLine: 3, text: "  --ink: #17171c;" },
                    { kind: "add", newLine: 4, text: "  --surface: #fafafa;" },
                    { kind: "add", newLine: 5, text: "  --surface-2: #f4f4f5;" },
                    { kind: "add", newLine: 6, text: "  --r-sm: 4px;" },
                    { kind: "add", newLine: 7, text: "  --r-md: 6px;" },
                    { kind: "add", newLine: 8, text: "  --r-lg: 8px;" },
                    { kind: "equal", oldLine: 4, newLine: 9, text: "}" },
                  ],
                },
              ],
            },
          },
          {
            kind: "tool",
            id: "m2-b6",
            name: "Bash",
            status: "done",
            summary: 'rg -n "data-testid" src',
            detail: {
              tool: "bash",
              command: 'rg -n "data-testid" src',
              outputLines: [
                "src/App.tsx:47:      <h1 data-testid=\"app-title\">khala</h1>",
                "src/App.tsx:49:      <form className=\"greet-form\" data-testid=\"greet-form\" onSubmit={submit}>",
                "src/App.tsx:51:          data-testid=\"greet-input\"",
                "src/chat/SettingsView.tsx:232:    <div className=\"st-rows\" data-testid=\"chat-settings-about\">",
                "src/chat/Sidebar.tsx:61:  <button data-testid=\"chat-new-session\"",
              ],
              hiddenLines: 6,
            },
          },
          {
            kind: "tool",
            id: "m2-b7",
            name: "Bash",
            status: "error",
            summary: "cargo clippy --workspace",
            detail: {
              tool: "bash",
              command: "cargo clippy --workspace",
              outputLines: [
                "    Checking khala-core v0.1.0",
                "error: unused variable: `ctx`",
                "  --> crates/khala-core/src/greet.rs:42:9",
                "   |",
                "42 |     let ctx = state.context();",
                "   |         ^^ help: prefix with an underscore: `_ctx`",
                "error: aborting due to 1 previous error",
              ],
              exitCode: 101,
            },
          },
          {
            kind: "permission",
            id: "m2-b8",
            toolName: "Bash",
            summary: "pnpm build",
            command: "pnpm build",
            decision: "allowOnce",
          },
          {
            kind: "text",
            id: "m2-b9",
            markdown:
              "构建通过。灰阶规范已落到 `tokens.css`,组件全部走语义 token。\n\n顺带一提:有一条 clippy 告警在 `greet.rs`,与本次 UI 改动无关,留到下一个会话处理。",
          },
        ],
      },
      {
        id: "m3",
        role: "user",
        atMs: now - 40 * min,
        blocks: [
          {
            kind: "text",
            id: "m3-b1",
            markdown: "侧栏的 streaming 状态点要能一眼看出来,加个脉冲。",
          },
        ],
      },
      {
        id: "m4",
        role: "assistant",
        atMs: now - 39 * min,
        blocks: [
          {
            kind: "thinking",
            id: "m4-b1",
            startedAtMs: now - 39 * min,
            durationMs: 6_000,
            text: "脉冲动画要克制:2s 周期的透明度呼吸,振幅不要太大。reduced-motion 下降级为常亮点,保证截图与可访问性。",
          },
          {
            kind: "text",
            id: "m4-b2",
            markdown:
              "已加:`--dot-live` 用 2s 透明度脉冲,`prefers-reduced-motion` 下降级为常亮。侧栏会话行与顶栏两处同步生效。",
          },
        ],
      },
    ],
  },
  {
    id: "s-e2e",
    title: "E2E 双传输联调",
    titleOverridden: false,
    createdAtMs: now - 8 * min,
    projectId: "p-khala",
    groupId: "g-hot",
    pinned: false,
    archived: false,
    status: "streaming",
    updatedAtMs: now - 3 * min,
    messages: [
      {
        id: "m5",
        role: "user",
        atMs: now - 8 * min,
        blocks: [
          {
            kind: "text",
            id: "m5-b1",
            markdown: "把 dev-web 的链路跑通:vite 起前端,khala-server 占 14034,代理 /api。",
          },
        ],
      },
      {
        id: "m6",
        role: "assistant",
        atMs: now - 7 * min,
        blocks: [
          {
            kind: "thinking",
            id: "m6-b1",
            startedAtMs: now - 7 * min,
            durationMs: 9_000,
            text: "vite proxy 的 target 要读 KHALA_PORT 环境变量,默认 14034。先确认 server 起来了,再看代理与 RTT。",
          },
          {
            kind: "text",
            id: "m6-b2",
            markdown: "代理已经通了,`api.info()` 返回 200。现在盯 RTT 和 DebugHud 的状态点:",
          },
          {
            kind: "tool",
            id: "m6-b3",
            name: "Bash",
            status: "running",
            summary: "pnpm dev",
            detail: {
              tool: "bash",
              command: "pnpm dev",
              outputLines: [
                "VITE v8.0.16  ready in 412 ms",
                "",
                "  >  Local:   http://localhost:14033/",
                "  >  Network: use --host to expose",
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "s-perm",
    title: "权限卡交互走查",
    titleOverridden: false,
    createdAtMs: now - 13 * min,
    projectId: "p-khala",
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 12 * min,
    messages: [
      user("m-perm-u", now - 13 * min, "演示一下权限确认卡在会话里长什么样。"),
      {
        id: "m-perm-r",
        role: "assistant",
        atMs: now - 12 * min,
        blocks: [
          {
            kind: "text",
            id: "m-perm-b1",
            markdown: "下一步要跑测试,等你确认:",
          },
          {
            kind: "permission",
            id: "m-perm-b2",
            toolName: "Bash",
            summary: "cargo test --workspace",
            command: "cargo test --workspace",
            /* decision undefined → pending → row shows the waiting badge */
          },
        ],
      },
    ],
  },
  {
    id: "s-clippy",
    title: "clippy 告警清理",
    titleOverridden: false,
    createdAtMs: now - 80 * min,
    projectId: "p-khala",
    pinned: false,
    archived: false,
    status: "error",
    updatedAtMs: now - 75 * min,
    messages: [
      user("m-clip-u", now - 80 * min, "把 greet.rs 里那条 unused variable 告警处理掉。"),
      reply("m-clip-r", now - 75 * min, "改到一半工具链断在了 rustfmt 组件缺失,稍后重试。"),
    ],
  },
  {
    id: "s-goose",
    title: "goose 侧栏结构调研",
    titleOverridden: false,
    createdAtMs: now - 26 * hour - 5 * min,
    projectId: "p-goose",
    pinned: true,
    archived: false,
    unreadAtMs: now - 26 * hour,
    status: "idle",
    updatedAtMs: now - 26 * hour,
    messages: [
      {
        id: "m7",
        role: "user",
        atMs: now - 26 * hour - 5 * min,
        blocks: [
          {
            kind: "text",
            id: "m7-b1",
            markdown: "goose 桌面端的侧栏具体分几块?折叠行为是什么?",
          },
        ],
      },
      {
        id: "m8",
        role: "assistant",
        atMs: now - 26 * hour,
        blocks: [
          {
            kind: "text",
            id: "m8-b1",
            markdown:
              "四块:\n\n1. 主导航(New Chat / Recipes / Skills / Scheduler / Extensions / History)\n2. **CHATS** 区,按工作目录分组,支持组内折叠与内联重命名\n3. 底部固定的 Settings\n4. 宽度可拖拽,默认 240px;折叠是宽度动画到 0,不是收成图标条\n\n侧栏本体是一块 `rounded-xl` 浮动卡片,漂在共享白画布上。khala 收敛圆角后改为通高面板 + 1px 右边框。",
          },
        ],
      },
    ],
  },
  {
    id: "s-dnd",
    title: "dnd-kit 拖拽排序预研",
    titleOverridden: false,
    createdAtMs: now - 3 * day - 4 * min,
    projectId: "p-goose",
    groupId: "g-research",
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 3 * day,
    messages: [
      user("m-dnd-u", now - 3 * day - 4 * min, "dnd-kit 的 sortable 约束够不够做项目行排序?"),
      reply("m-dnd-r", now - 3 * day, "够:vertical 策略 + closestCenter + PointerSensor distance 6 就能对齐 ZCodium 的手感。"),
    ],
  },
  {
    id: "s-migrate",
    title: "博客迁移脚本",
    titleOverridden: false,
    createdAtMs: now - 6 * day - 2 * min,
    projectId: "p-blog",
    pinned: false,
    archived: true,
    status: "idle",
    updatedAtMs: now - 6 * day,
    messages: [
      user("s-mig-u", now - 6 * day - 2 * min, "把 hexo 的文章 frontmatter 批量转成新格式。"),
      reply("s-mig-r", now - 6 * day, "脚本已交付:`scripts/migrate.mjs`,42 篇全部转换通过。"),
    ],
  },
  {
    id: "s-theme",
    title: "暗色主题配色草案",
    titleOverridden: false,
    createdAtMs: now - 8 * day - 3 * min,
    projectId: "p-blog",
    pinned: false,
    archived: true,
    status: "idle",
    updatedAtMs: now - 8 * day,
    messages: [
      user("s-theme-u", now - 8 * day - 3 * min, "出一版博客暗色配色。"),
      reply("s-theme-r", now - 8 * day, "底 #161616 / 面 #1e1e1e / 字 #d4d4d4,先试一周再定。"),
    ],
  },
  {
    id: "c-models",
    title: "GLM 与本地模型选型",
    titleOverridden: false,
    createdAtMs: now - 2 * hour - 3 * min,
    groupId: "g-research",
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 2 * hour,
    messages: [
      {
        id: "m9",
        role: "user",
        atMs: now - 2 * hour - 3 * min,
        blocks: [
          {
            kind: "text",
            id: "m9-b1",
            markdown: "本地推理和 API 直连,日常 coding 分别怎么选?",
          },
        ],
      },
      {
        id: "m10",
        role: "assistant",
        atMs: now - 2 * hour,
        blocks: [
          {
            kind: "text",
            id: "m10-b1",
            markdown:
              "看两件事:上下文长度和工具调用稳定性。\n\n- **API 直连**:上下文长、免运维,适合当主力\n- **本地**:数据不出机,适合离线与批量小任务\n\n混合用最划算:大模型走 API,小模型本地兜底。",
          },
        ],
      },
    ],
  },
  {
    id: "c-regex",
    title: "正则速查",
    titleOverridden: false,
    createdAtMs: now - 5 * hour - 2 * min,
    pinned: false,
    archived: false,
    unreadAtMs: now - 5 * hour,
    status: "idle",
    updatedAtMs: now - 5 * hour,
    messages: [
      {
        id: "m11",
        role: "user",
        atMs: now - 5 * hour - 2 * min,
        blocks: [
          {
            kind: "text",
            id: "m11-b1",
            markdown: "给我一个匹配 Windows 路径的正则。",
          },
        ],
      },
      {
        id: "m12",
        role: "assistant",
        atMs: now - 5 * hour,
        blocks: [
          {
            kind: "text",
            id: "m12-b1",
            markdown:
              "驱动器号开头,反斜杠分隔,段内排除非法字符:\n\n```text\n^[A-Za-z]:\\\\(?:[^\\\\/:*?\"<>|\\r\\n]+\\\\)*[^\\\\/:*?\"<>|\\r\\n]*$\n```\n\n注意在 JS 字符串里每个反斜杠要再写一遍。",
          },
        ],
      },
    ],
  },
  {
    id: "c-toolcards",
    title: "工具卡分型样例",
    titleOverridden: false,
    createdAtMs: now - 51 * min,
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 50 * min,
    messages: [
      {
        id: "m13",
        role: "user",
        atMs: now - 51 * min,
        blocks: [
          {
            kind: "text",
            id: "m13-b1",
            markdown: "把 Grep / Glob / Write / WebFetch 的卡片体各展示一遍。",
          },
        ],
      },
      {
        id: "m14",
        role: "assistant",
        atMs: now - 50 * min,
        blocks: [
          {
            kind: "tool",
            id: "m14-b1",
            name: "Grep",
            status: "done",
            summary: '"useMockChat" in src/chat',
            detail: {
              tool: "grep",
              pattern: "useMockChat",
              matchCount: 3,
              files: ["src/chat/ChatApp.tsx", "src/chat/Sidebar.tsx", "src/chat/TopBar.tsx"],
            },
          },
          {
            kind: "tool",
            id: "m14-b2",
            name: "Glob",
            status: "done",
            summary: "src/chat/**/*.tsx",
            detail: {
              tool: "glob",
              pattern: "src/chat/**/*.tsx",
              matchCount: 4,
              files: [
                "src/chat/ChatApp.tsx",
                "src/chat/Composer.tsx",
                "src/chat/Sidebar.tsx",
                "src/chat/blocks/ToolCard.tsx",
              ],
            },
          },
          {
            kind: "tool",
            id: "m14-b3",
            name: "Write",
            status: "done",
            summary: "docs/e2e-notes.md",
            detail: {
              tool: "write",
              path: "docs/e2e-notes.md",
              hunks: [
                {
                  header: "@@ -0,0 +1,4 @@",
                  lines: [
                    { kind: "add", newLine: 1, text: "# E2E notes" },
                    { kind: "add", newLine: 2, text: "" },
                    { kind: "add", newLine: 3, text: "- instant 回放:?mock=instant" },
                    { kind: "add", newLine: 4, text: "- 断言走 testid,不数 DOM" },
                  ],
                },
              ],
            },
          },
          {
            kind: "tool",
            id: "m14-b4",
            name: "WebFetch",
            status: "done",
            summary: "docs.rs/tauri",
            detail: {
              tool: "webFetch",
              url: "https://docs.rs/tauri/latest/tauri/",
              title: "tauri - Rust",
            },
          },
        ],
      },
    ],
  },
  {
    id: "c-mermaid",
    title: "架构梳理 · mermaid 渲染",
    titleOverridden: false,
    createdAtMs: now - 42 * min,
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 40 * min,
    messages: [
      user(
        "m-mer-u",
        now - 42 * min,
        "用 mermaid 把新的渲染扩展架构画出来,flowchart、时序、占比各一张。",
      ),
      reply(
        "m-mer-r",
        now - 40 * min,
        "三张图讲清这套扩展机制。\n\n**组件关系**:\n\n```mermaid\nflowchart TD\n  A[ChatApp] --> S[TaskSidebar]\n  A --> M[MessageList]\n  A --> C[Composer]\n  M --> MD[Markdown]\n  MD --> EB[ExtensionBlock]\n  EB --> REG[extensions 注册表]\n  REG -.-> P[mermaid provider]\n```\n\n**渲染时序**:\n\n```mermaid\nsequenceDiagram\n  participant U as 用户\n  participant MD as Markdown\n  participant REG as 注册表\n  participant P as mermaid\n  U->>MD: 含 mermaid 代码块的回复\n  MD->>REG: lookup(lang)\n  REG-->>MD: 命中 provider\n  MD->>P: render(code, theme)\n  P-->>MD: svg\n  MD-->>U: 图表上屏\n```\n\n**代码构成**:\n\n```mermaid\npie title khala 前端代码构成\n  \"React 组件\" : 45\n  \"状态与 mock\" : 30\n  \"样式\" : 15\n  \"测试\" : 10\n```\n\n扩展是可拔插的:删掉 provider 文件与依赖后,上面三块自动退回纯文本代码块展示。",
      ),
    ],
  },
  {
    id: "c-collapsible",
    title: "折叠动画性能调优",
    titleOverridden: false,
    createdAtMs: now - 20 * hour - 2 * min,
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 20 * hour,
    messages: [
      user("m-col-u", now - 20 * hour - 2 * min, "0fr/1fr 折叠在低端机上掉帧吗?"),
      reply("m-col-r", now - 20 * hour, "内容层加 overflow:hidden 后稳定 60fps;再快就减 opacity 过渡。"),
    ],
  },
  {
    id: "c-prefs",
    title: "侧栏偏好持久化方案",
    titleOverridden: false,
    createdAtMs: now - 2 * day - 6 * hour,
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 2 * day - 5 * hour,
    messages: [
      user("m-pref-u", now - 2 * day - 6 * hour, "视图/展开/顺序放 localStorage 还是等 Host?"),
      reply("m-pref-r", now - 2 * day - 5 * hour, "客户端偏好全放 localStorage,跨窗口走 storage 事件;Host 只管事实层。"),
    ],
  },
  {
    id: "c-marquee",
    title: "标题跑马灯的降级策略与遮罩细节复核",
    titleOverridden: false,
    createdAtMs: now - 9 * day - 2 * min,
    pinned: false,
    archived: false,
    status: "idle",
    updatedAtMs: now - 9 * day,
    messages: [
      user("m-mar-u", now - 9 * day - 2 * min, "跑马灯在 reduced-motion 下怎么降级?"),
      reply("m-mar-r", now - 9 * day, "不启动动画,退化为右缘渐隐遮罩 + title 提示,两端渐隐保留。"),
    ],
  },
];

/*
 * ?mock=showcase seed. Last block must stay text — the caret only renders
 * on a trailing text block (MessageList). No projectId → unfiled zone.
 */
const SHOWCASE_SESSION: Session = {
  id: "s-showcase",
  title: "全块型样例",
  titleOverridden: false,
  createdAtMs: now - 30_000,
  pinned: false,
  archived: false,
  status: "streaming",
  updatedAtMs: now,
  messages: [
    user("m-show-u", now - 30_000, "把每种消息块各来一份,做成一条可断言的样例线程。"),
    {
      id: "m-show-r",
      role: "assistant",
      streaming: true,
      atMs: now - 29_000,
      blocks: [
        {
          kind: "text",
          id: "m-show-b1",
          markdown:
            "好的,这条线程按块型清单逐一来。行内码如 `useMockChat` 走 `md-code-inline`,下面是围栏块:",
        },
        {
          kind: "thinking",
          id: "m-show-b2",
          startedAtMs: now - 29_000,
          durationMs: 4_200,
          text: "样例线程要一次覆盖:文本/行内码/围栏码、thinking、工具卡三种状态、含 hunk 的 diff、权限卡待决与已决。块序保持可读,收尾必须是 text 块,caret 才会渲染。",
        },
        {
          kind: "text",
          id: "m-show-b3",
          markdown:
            "围栏代码块(带语言标签与复制按钮):\n\n```ts\nexport function useTheme() {\n  const [setting, setSettingState] = useState<ThemeSetting>(readSetting);\n  return { setting, resolved, setSetting };\n}\n```",
        },
        {
          kind: "tool",
          id: "m-show-b4",
          name: "Bash",
          status: "running",
          summary: 'rg -n "data-blocks" src',
          detail: {
            tool: "bash",
            command: 'rg -n "data-blocks" src',
            outputLines: ["src/chat/sidebar/TaskRow.tsx:118:  data-blocks={blockTokens(session)}"],
          },
        },
        {
          kind: "tool",
          id: "m-show-b5",
          name: "Bash",
          status: "done",
          summary: "pnpm build",
          detail: {
            tool: "bash",
            command: "pnpm build",
            outputLines: [
              "$ tsc && vite build",
              "✓ 2146 modules transformed.",
              "dist/assets/index-CbKSJckn.js  577.66 kB │ gzip: 183.35 kB",
              "✓ built in 490ms",
            ],
            hiddenLines: 12,
          },
        },
        {
          kind: "tool",
          id: "m-show-b6",
          name: "Bash",
          status: "error",
          summary: "cargo clippy --workspace",
          detail: {
            tool: "bash",
            command: "cargo clippy --workspace",
            outputLines: [
              "error: unused variable: `ctx`",
              "  --> crates/khala-core/src/greet.rs:42:9",
              "error: aborting due to 1 previous error",
            ],
            exitCode: 101,
          },
        },
        {
          kind: "tool",
          id: "m-show-b7",
          name: "Edit",
          status: "done",
          summary: "src/chat/sidebar/TaskRow.tsx",
          detail: {
            tool: "edit",
            path: "src/chat/sidebar/TaskRow.tsx",
            hunks: [
              {
                header: "@@ -110,6 +110,7 @@",
                lines: [
                  { kind: "equal", oldLine: 110, newLine: 110, text: "      data-testid={testid}" },
                  { kind: "equal", oldLine: 111, newLine: 111, text: "      data-id={session.id}" },
                  { kind: "add", newLine: 112, text: "      data-blocks={blockTokens(session)}" },
                  { kind: "equal", oldLine: 112, newLine: 113, text: "      data-status={session.status}" },
                  { kind: "del", oldLine: 113, text: "      data-unread={session.unreadAtMs !== undefined || undefined}" },
                  { kind: "add", newLine: 114, text: "      data-unread={session.unreadAtMs !== undefined || undefined}" },
                  { kind: "equal", oldLine: 114, newLine: 115, text: "      data-waiting={waiting || undefined}" },
                ],
              },
            ],
          },
        },
        {
          kind: "permission",
          id: "m-show-b8",
          toolName: "Bash",
          summary: "cargo test --workspace",
          command: "cargo test --workspace",
          /* resolvable; no script waits on it */
        },
        {
          kind: "permission",
          id: "m-show-b9",
          toolName: "Bash",
          summary: "pnpm build",
          command: "pnpm build",
          decision: "allowOnce",
        },
        {
          kind: "text",
          id: "m-show-b10",
          markdown:
            "块型清单到此覆盖完毕:文本×3(含围栏码)、thinking、工具卡 running/done/error、含 hunk 的 Edit diff、权限卡待决与已决。队列里还压了一条 paused 消息,点恢复即转入真实脚本回复。",
        },
      ],
    },
  ],
};

/** ?mock=showcase seed: the session plus its seeded paused queue (the lever
 * into the live flow). */
export const SHOWCASE_SEED: { session: Session; queue: string[]; queuePaused: boolean } = {
  session: SHOWCASE_SESSION,
  queue: ["再列一下剩余风险"],
  queuePaused: true,
};

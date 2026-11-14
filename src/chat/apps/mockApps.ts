/* Static demo apps; times are relative to load so timestamps stay sensible. */
import { Braces, Clock, GitCommitHorizontal, Regex, Waypoints } from "lucide-react";
import type { KhalaApp } from "./types";
import { RegexCookbook } from "./samples/RegexCookbook";
import { CommitComposer } from "./samples/CommitComposer";
import { JsonFormatter } from "./samples/JsonFormatter";
import { ClockApp } from "./samples/ClockApp";
import { MermaidPlayground } from "./samples/MermaidPlayground";

const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;
const now = Date.now();

export const initialApps: KhalaApp[] = [
  {
    id: "a-clock",
    name: "时钟",
    description: "瑞士铁路风格挂钟,秒针平滑扫动并在整点停顿跳分(镜像 goose 内置 clock 应用)。",
    source: "built",
    icon: Clock,
    updatedAtMs: now - 12 * min,
    size: { width: 380, height: 420 },
    sample: ClockApp,
  },
  {
    id: "a-regex",
    name: "正则速查",
    description: "输入模式与测试文本,实时高亮匹配;内置 Windows 路径等常用预设。",
    source: "built",
    icon: Regex,
    updatedAtMs: now - 38 * min,
    size: { width: 560, height: 430 },
    sample: RegexCookbook,
  },
  {
    id: "a-mermaid",
    name: "Mermaid 画板",
    description: "mermaid 源码实时成图,内置流程图/时序/饼图/类图预设;拔掉渲染扩展后显示未启用提示。",
    source: "built",
    icon: Waypoints,
    updatedAtMs: now - 55 * min,
    size: { width: 620, height: 560 },
    sample: MermaidPlayground,
  },
  {
    id: "a-commit",
    name: "提交信息生成",
    description: "按 Conventional Commits 拼装提交信息,实时预览并一键复制。",
    source: "built",
    icon: GitCommitHorizontal,
    updatedAtMs: now - 26 * hour,
    size: { width: 540, height: 560 },
    sample: CommitComposer,
  },
  {
    id: "a-json",
    name: "JSON 格式化",
    description: "格式化、压缩与校验 JSON,错误定位到行:列。",
    source: "built",
    icon: Braces,
    updatedAtMs: now - 3 * day,
    size: { width: 620, height: 620 },
    sample: JsonFormatter,
  },
];

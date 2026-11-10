/* Mock catalogs; swapping in a real filesystem/CLI provider only touches this file. */

import type { StringKey } from "../i18n";
import { buildMentionMarkdown } from "./mentionMarkdown";
import type { MentionItem } from "./mentionTypes";

export interface SessionRef {
  id: string;
  title: string;
}

interface CatalogEntry {
  value: string;
  descKey: StringKey;
  /** Both zh and en aliases — scoring is a per-character subsequence match. */
  keywords: string[];
}

const COMMAND_CATALOG: CatalogEntry[] = [
  { value: "init", descKey: "cmdInitDesc", keywords: ["初始化", "项目", "analyze", "project"] },
  { value: "goal", descKey: "cmdGoalDesc", keywords: ["目标", "会话目标", "objective", "target"] },
  {
    value: "compact",
    descKey: "cmdCompactDesc",
    keywords: ["压缩", "上下文", "历史", "history", "summarize"],
  },
  { value: "clear", descKey: "cmdClearDesc", keywords: ["清空", "重置", "reset", "clean"] },
  { value: "help", descKey: "cmdHelpDesc", keywords: ["帮助", "说明", "usage", "manual"] },
];

const SKILL_CATALOG: CatalogEntry[] = [
  {
    value: "browser",
    descKey: "skillBrowserDesc",
    keywords: ["浏览器", "网页", "自动化", "web", "automation", "navigate"],
  },
  { value: "docx", descKey: "skillDocxDesc", keywords: ["文档", "word", "word 文档", "doc"] },
  { value: "pdf", descKey: "skillPdfDesc", keywords: ["pdf 文档", "便携文档"] },
  { value: "pptx", descKey: "skillPptxDesc", keywords: ["演示", "幻灯片", "slides", "deck"] },
  { value: "xlsx", descKey: "skillXlsxDesc", keywords: ["表格", "电子表格", "excel", "sheet"] },
];

const FILE_CATALOG: Array<{ relativePath: string; kind: "file" | "directory" }> = [
  { relativePath: "src/chat/Composer.tsx", kind: "file" },
  { relativePath: "src/chat/MessageList.tsx", kind: "file" },
  { relativePath: "src/chat/chat.css", kind: "file" },
  { relativePath: "src/chat/tokens.css", kind: "file" },
  { relativePath: "src/chat/mentions/", kind: "directory" },
  { relativePath: "src/chat/blocks/", kind: "directory" },
  { relativePath: "src-tauri/tauri.conf.json", kind: "file" },
  { relativePath: "package.json", kind: "file" },
  { relativePath: "justfile", kind: "file" },
  { relativePath: "README.md", kind: "file" },
];

function baseName(relativePath: string): string {
  const trimmed = relativePath.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? trimmed;
}

export function buildCommandItems(t: (key: StringKey) => string): MentionItem[] {
  return COMMAND_CATALOG.map((entry) => ({
    id: `command:${entry.value}`,
    category: "commands" as const,
    label: entry.value,
    value: entry.value,
    description: t(entry.descKey),
    markdown: buildMentionMarkdown({
      category: "commands",
      label: entry.value,
      value: entry.value,
    }),
    keywords: entry.keywords,
  }));
}

export function buildSkillItems(t: (key: StringKey) => string): MentionItem[] {
  return SKILL_CATALOG.map((entry) => {
    const path = `./skills/${entry.value}/SKILL.md`;
    return {
      id: `skill:${entry.value}`,
      category: "skills" as const,
      label: entry.value,
      value: entry.value,
      description: t(entry.descKey),
      markdown: buildMentionMarkdown({
        category: "skills",
        label: entry.value,
        value: entry.value,
        data: { path },
      }),
      keywords: ["skill", "技能", ...entry.keywords],
      data: { path },
    };
  });
}

export function buildFileItems(): MentionItem[] {
  return FILE_CATALOG.map((entry) => {
    const name = baseName(entry.relativePath);
    return {
      id: `file:${entry.relativePath}`,
      category: "files" as const,
      label: name,
      value: entry.relativePath,
      description: entry.relativePath,
      markdown: buildMentionMarkdown({
        category: "files",
        label: name,
        value: entry.relativePath,
        data: { relativePath: entry.relativePath, kind: entry.kind },
      }),
      keywords:
        entry.kind === "directory" ? ["目录", "folder", "directory"] : ["文件", "file"],
      data: { relativePath: entry.relativePath, kind: entry.kind },
    };
  });
}

export function buildSessionItems(sessions: SessionRef[]): MentionItem[] {
  return sessions.map((session) => ({
    id: `session:${session.id}`,
    category: "sessions" as const,
    label: session.title,
    value: session.id,
    description: session.id,
    markdown: buildMentionMarkdown({
      category: "sessions",
      label: session.title,
      value: session.id,
    }),
    keywords: ["会话", "session", "历史", "history"],
  }));
}

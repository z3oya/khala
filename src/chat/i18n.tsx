/* Minimal zh/en i18n: flat typed dictionaries, localStorage-persisted. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "zh" | "en";

const zh = {
  newSession: "新建会话",
  automation: "自动化",
  apps: "应用",
  plugins: "插件",
  projects: "项目",
  chats: "聊天",
  openSettings: "设置",
  backToWorkspace: "返回工作区",
  newChat: "新建聊天",
  newInProject: "在此新建会话",
  rename: "重命名",
  delete: "删除",
  open: "打开",
  collapseProject: "折叠项目",
  expandProject: "展开项目",
  expandAllProjects: "展开全部项目",
  collapseAllProjects: "折叠全部项目",
  newInProjectTitle: "在该项目下新建会话",
  collapseSidebar: "折叠侧栏",
  expandSidebar: "展开侧栏",
  resizeSidebar: "调整侧栏宽度",
  thinking: "思考",
  thinkingLive: "思考中",
  lines: "行",
  matches: "个匹配",
  moreLines: "还有 {n} 行",
  permissionSuffix: "权限确认",
  deny: "拒绝",
  allowOnce: "允许一次",
  alwaysAllow: "总是允许",
  decidedDeny: "已拒绝",
  decidedAllowOnce: "已允许 (一次性)",
  decidedAlwaysAllow: "已允许 (本会话总是)",
  permModeAsk: "编辑前询问",
  permModeAuto: "自动执行",
  permModeTitle: "权限模式",
  contextUsage: "上下文用量 {n}%",
  composerPlaceholder: "给 khala 发送消息... (Enter 发送, Shift+Enter 换行)",
  slashHint: "/ 命令",
  mentionHint: "@ 提及",
  attachTitle: "附件 (本版占位)",
  send: "发送",
  stop: "停止生成",
  messageInput: "消息输入框",
  copy: "复制",
  copied: "已复制",
  copyCodeAria: "复制代码",
  toolRunning: "运行中…",
  greetingLateNight: "夜深了",
  greetingMorning: "早上好",
  greetingAfternoon: "下午好",
  greetingEvening: "晚上好",
  emptySub: "今天要让 khala 做什么?",
  suggestions: ["分析这个仓库的结构", "为 src/chat 补充单元测试", "解释 dual-transport 的设计", "跑一遍 pnpm build 并修复告警"],
  justNow: "刚刚",
  minutesAgo: "{n} 分钟前",
  hoursAgo: "{n} 小时前",
  daysAgo: "{n} 天前",
  generating: "正在生成回复",
  // apps page
  appsBuildInChat: "在聊天中构建",
  appsBuildPrompt: "帮我构建一个应用:",
  appsImport: "导入应用",
  appsImportTitle: "导入 .html 应用文件",
  appsLaunch: "启动",
  appsClose: "关闭",
  appsEmptyTitle: "暂无应用",
  appsEmptyDesc: "在聊天中让 khala 构建一个应用,它会出现在这里;或导入他人分享的 .html 应用文件。",
  appsSourceBuilt: "khala 构建",
  appsSourceImported: "导入",
  // settings
  stTitle: "设置",
  stNav: "设置分区",
  stGeneral: "常规",
  stGeneralDesc: "启动行为与基础偏好",
  stModels: "模型",
  stModelsDesc: "默认模型与推理参数",
  stAppearance: "外观",
  stAppearanceDesc: "主题与布局",
  stPermissions: "权限",
  stPermissionsDesc: "工具执行的审批策略",
  stShortcuts: "快捷键",
  stShortcutsDesc: "全局与输入快捷方式",
  stAbout: "关于",
  stAboutDesc: "版本与传输信息",
  rowDefaultView: "默认视图",
  rowLanguage: "界面语言",
  rowFontSize: "字体大小",
  rowDefaultModel: "默认模型",
  rowEffort: "推理力度",
  rowContextWindow: "上下文窗口",
  rowTheme: "主题",
  rowSidebarWidth: "侧栏宽度",
  rowMotion: "动效",
  rowPermMode: "默认模式",
  rowAlwaysAllowed: "总是允许的记录",
  rowSend: "发送消息",
  rowNewline: "换行",
  rowStop: "停止生成",
  rowVersion: "版本",
  rowTransport: "传输",
  valChat: "聊天",
  valStandard: "标准",
  valHigh: "高",
  valLight: "浅色",
  valInherit: "继承聊天窗口",
  valOn: "开启",
  valRecords: "{n} 条",
  valStopButton: "停止按钮",
  valMock: "mock (纯前端)",
};

type Dict = typeof zh;

const en: Dict = {
  newSession: "New session",
  automation: "Automation",
  apps: "Apps",
  plugins: "Plugins",
  projects: "Projects",
  chats: "Chats",
  openSettings: "Settings",
  backToWorkspace: "Back to workspace",
  newChat: "New chat",
  newInProject: "New session here",
  rename: "Rename",
  delete: "Delete",
  open: "Open",
  collapseProject: "Collapse project",
  expandProject: "Expand project",
  expandAllProjects: "Expand all projects",
  collapseAllProjects: "Collapse all projects",
  newInProjectTitle: "New session in this project",
  collapseSidebar: "Collapse sidebar",
  expandSidebar: "Expand sidebar",
  resizeSidebar: "Resize sidebar",
  thinking: "Thoughts",
  thinkingLive: "Thinking",
  lines: "lines",
  matches: "matches",
  moreLines: "{n} more lines",
  permissionSuffix: "permission required",
  deny: "Deny",
  allowOnce: "Allow once",
  alwaysAllow: "Always allow",
  decidedDeny: "Denied",
  decidedAllowOnce: "Allowed (once)",
  decidedAlwaysAllow: "Allowed (always this session)",
  permModeAsk: "Ask before edits",
  permModeAuto: "Auto-run",
  permModeTitle: "Permission mode",
  contextUsage: "Context usage {n}%",
  composerPlaceholder: "Message khala... (Enter to send, Shift+Enter for newline)",
  slashHint: "/ commands",
  mentionHint: "@ mentions",
  attachTitle: "Attach (placeholder)",
  send: "Send",
  stop: "Stop generating",
  messageInput: "Message input",
  copy: "Copy",
  copied: "Copied",
  copyCodeAria: "Copy code",
  toolRunning: "Running...",
  greetingLateNight: "Working late",
  greetingMorning: "Good morning",
  greetingAfternoon: "Good afternoon",
  greetingEvening: "Good evening",
  emptySub: "What shall khala do for you today?",
  suggestions: [
    "Analyze this repository structure",
    "Add unit tests for src/chat",
    "Explain the dual-transport design",
    "Run pnpm build and fix warnings",
  ],
  justNow: "just now",
  minutesAgo: "{n}m ago",
  hoursAgo: "{n}h ago",
  daysAgo: "{n}d ago",
  generating: "Generating reply",
  appsBuildInChat: "Build in chat",
  appsBuildPrompt: "Build me an app: ",
  appsImport: "Import app",
  appsImportTitle: "Import an .html app file",
  appsLaunch: "Launch",
  appsClose: "Close",
  appsEmptyTitle: "No apps yet",
  appsEmptyDesc: "Ask khala in chat to build one and it will show up here, or import a shared .html app file.",
  appsSourceBuilt: "Built by khala",
  appsSourceImported: "Imported",
  stTitle: "Settings",
  stNav: "Settings sections",
  stGeneral: "General",
  stGeneralDesc: "Startup behavior and basic preferences",
  stModels: "Models",
  stModelsDesc: "Default model and reasoning parameters",
  stAppearance: "Appearance",
  stAppearanceDesc: "Theme and layout",
  stPermissions: "Permissions",
  stPermissionsDesc: "Tool approval policy",
  stShortcuts: "Shortcuts",
  stShortcutsDesc: "Global and input shortcuts",
  stAbout: "About",
  stAboutDesc: "Version and transport",
  rowDefaultView: "Default view",
  rowLanguage: "Interface language",
  rowFontSize: "Font size",
  rowDefaultModel: "Default model",
  rowEffort: "Reasoning effort",
  rowContextWindow: "Context window",
  rowTheme: "Theme",
  rowSidebarWidth: "Sidebar width",
  rowMotion: "Motion",
  rowPermMode: "Default mode",
  rowAlwaysAllowed: "Always-allowed records",
  rowSend: "Send message",
  rowNewline: "Newline",
  rowStop: "Stop generating",
  rowVersion: "Version",
  rowTransport: "Transport",
  valChat: "Chat",
  valStandard: "Standard",
  valHigh: "High",
  valLight: "Light",
  valInherit: "Inherits chat window",
  valOn: "On",
  valRecords: "{n} records",
  valStopButton: "Stop button",
  valMock: "mock (frontend only)",
};

export type MsgKey = keyof Dict;
/** Keys whose dictionary values are plain strings (excludes arrays). */
export type StringKey = { [K in MsgKey]: Dict[K] extends string ? K : never }[MsgKey];

const DICTS: Record<Lang, Dict> = { zh, en };

const STORAGE_KEY = "khala-lang";

export function detectLang(): Lang {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: <K extends MsgKey>(key: K) => Dict[K];
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);
  const t = useCallback(<K extends MsgKey>(key: K): Dict[K] => DICTS[lang][key], [lang]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Locale-aware relative time. */
export function relTime(ms: number, lang: Lang): string {
  const dict = DICTS[lang];
  const diff = Date.now() - ms;
  if (diff < 60_000) return dict.justNow;
  if (diff < 3_600_000) return dict.minutesAgo.replace("{n}", String(Math.floor(diff / 60_000)));
  if (diff < 86_400_000) return dict.hoursAgo.replace("{n}", String(Math.floor(diff / 3_600_000)));
  return dict.daysAgo.replace("{n}", String(Math.floor(diff / 86_400_000)));
}

export function localeOf(lang: Lang): string {
  return lang === "zh" ? "zh-CN" : "en-US";
}

export function placeholderTitle(n: number, lang: Lang): string {
  if (lang === "zh") return n <= 1 ? "新会话" : `新会话 ${n}`;
  return n <= 1 ? "New session" : `New session ${n}`;
}

/** Matches placeholder titles in either language (old data may predate a switch). */
export function isPlaceholderTitle(title: string): boolean {
  return /^(新会话|New session)(?: \d+)?$/.test(title);
}

/* Sample app: live regex matcher. */
import { useMemo, useState } from "react";
import { useI18n, type Lang } from "../../i18n";

const zh = {
  pattern: "正则表达式",
  flags: "标志",
  presets: "预设",
  text: "测试文本",
  matches: "个匹配",
  badPattern: "无效正则",
  presetWin: "Windows 路径",
  presetEmail: "邮箱",
  presetHex: "十六进制颜色",
  presetIso: "ISO 日期",
  sampleText:
    "配置位于 C:\\Users\\Q\\lab\\khala\n笔记在 D:\\work\\notes.txt;\n联系 team@khala.dev,主题色 #4C9A6A,发布于 2026-11-09。",
};

type Dict = typeof zh;

const en: Dict = {
  pattern: "Pattern",
  flags: "Flags",
  presets: "Presets",
  text: "Test text",
  matches: "matches",
  badPattern: "Invalid regex",
  presetWin: "Windows path",
  presetEmail: "Email",
  presetHex: "Hex color",
  presetIso: "ISO date",
  sampleText:
    "Config lives in C:\\Users\\Q\\lab\\khala\nnotes in D:\\work\\notes.txt;\ncontact team@khala.dev, accent #4C9A6A, released 2026-11-09.",
};

const DICTS: Record<Lang, Dict> = { zh, en };

const PRESETS: { key: keyof Dict; pattern: string }[] = [
  {
    key: "presetWin",
    pattern: String.raw`[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*`,
  },
  { key: "presetEmail", pattern: String.raw`[\w.+-]+@[\w-]+\.[\w.]+` },
  { key: "presetHex", pattern: String.raw`#[0-9a-fA-F]{3,8}\b` },
  { key: "presetIso", pattern: String.raw`\d{4}-\d{2}-\d{2}` },
];

const FLAG_LIST = ["g", "i", "m", "s"] as const;
const MATCH_CAP = 200;

interface Segment {
  hit: boolean;
  text: string;
}

export function RegexCookbook() {
  const { lang } = useI18n();
  const d = DICTS[lang];
  const [pattern, setPattern] = useState(PRESETS[0].pattern);
  const [flags, setFlags] = useState<Set<string>>(new Set(["g"]));
  const [text, setText] = useState(d.sampleText);

  const toggleFlag = (f: string) =>
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const flagString = FLAG_LIST.filter((f) => flags.has(f)).join("");

  /* Iterate with "g" always (deduped); the user's g flag picks first-vs-all. */
  const parsed = useMemo(() => {
    if (!pattern) return { re: null, error: null };
    const iterFlags = flagString.includes("g") ? flagString : flagString + "g";
    try {
      return { re: new RegExp(pattern, iterFlags), error: null as null };
    } catch (e) {
      return { re: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flagString]);

  const segments = useMemo<Segment[]>(() => {
    const { re } = parsed;
    if (!re) return text ? [{ hit: false, text }] : [];
    const all = flags.has("g");
    /* The memoized RegExp persists; reset lastIndex after early-exit passes. */
    re.lastIndex = 0;
    const out: Segment[] = [];
    let last = 0;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && count < MATCH_CAP) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (m.index > last) out.push({ hit: false, text: text.slice(last, m.index) });
      out.push({ hit: true, text: m[0] });
      last = m.index + m[0].length;
      count += 1;
      if (!all) break;
    }
    if (last < text.length) out.push({ hit: false, text: text.slice(last) });
    return out;
  }, [parsed, text, flags]);

  const matchCount = segments.reduce((n, s) => n + (s.hit ? 1 : 0), 0);

  return (
    <div className="sa-root" data-testid="chat-sample-app" data-sample="regex">
      <label className="sa-label" htmlFor="sa-regex-pattern">
        {d.pattern}
      </label>
      <input
        id="sa-regex-pattern"
        className="sa-input sa-mono"
        value={pattern}
        spellCheck={false}
        data-testid="chat-sample-regex-pattern"
        onChange={(e) => setPattern(e.target.value)}
      />
      {parsed.error && (
        <p className="sa-err" data-testid="chat-sample-regex-error">
          {d.badPattern}: {parsed.error}
        </p>
      )}
      <div className="sa-row">
        <span className="sa-label">{d.flags}</span>
        {FLAG_LIST.map((f) => (
          <button
            key={f}
            type="button"
            className={`sa-chip sa-mono${flags.has(f) ? " active" : ""}`}
            aria-pressed={flags.has(f)}
            data-testid="chat-sample-regex-flag"
            data-flag={f}
            onClick={() => toggleFlag(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="sa-row">
        <span className="sa-label">{d.presets}</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="sa-chip"
            onClick={() => setPattern(p.pattern)}
          >
            {d[p.key]}
          </button>
        ))}
      </div>
      <label className="sa-label" htmlFor="sa-regex-text">
        {d.text}
      </label>
      <textarea
        id="sa-regex-text"
        className="sa-area sa-mono"
        rows={3}
        value={text}
        spellCheck={false}
        data-testid="chat-sample-regex-text"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sa-row">
        <span className="sa-label" data-testid="chat-sample-regex-count">
          {matchCount} {d.matches}
        </span>
      </div>
      <div className="sa-pre sa-mono" data-testid="chat-sample-regex-result">
        {segments.map((s, i) =>
          s.hit ? (
            <mark key={i} className="sa-mark">
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
    </div>
  );
}

/* Sample app: Conventional Commits composer. */
import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n, type Lang } from "../../i18n";

const zh = {
  type: "类型",
  scope: "范围 (可选)",
  subject: "标题",
  body: "正文 (可选)",
  breaking: "含破坏性变更",
  preview: "预览",
  subjectHint: "祈使句、现在时,不加句号",
};

type Dict = typeof zh;

const en: Dict = {
  type: "Type",
  scope: "Scope (optional)",
  subject: "Subject",
  body: "Body (optional)",
  breaking: "Breaking change",
  preview: "Preview",
  subjectHint: "Imperative mood, no trailing period",
};

const DICTS: Record<Lang, Dict> = { zh, en };

const TYPES = ["feat", "fix", "docs", "refactor", "perf", "test", "build", "ci", "chore"] as const;

export function CommitComposer() {
  const { lang, t } = useI18n();
  const d = DICTS[lang];
  const [type, setType] = useState<(typeof TYPES)[number]>("feat");
  const [scope, setScope] = useState("chat");
  const [subject, setSubject] = useState(lang === "zh" ? "新增应用页与示例应用" : "add apps gallery and samples");
  const [body, setBody] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const message = useMemo(() => {
    /* bang follows the scope: feat(chat)!: subject */
    const head = `${type}${scope ? `(${scope})` : ""}${breaking ? "!" : ""}: ${subject || "…"}`;
    return body.trim() ? `${head}\n\n${body.trim()}` : head;
  }, [type, scope, subject, body, breaking]);

  const canCopy = subject.trim().length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="sa-root" data-testid="chat-sample-app" data-sample="commit">
      <span className="sa-label">{d.type}</span>
      <div className="sa-row sa-wrap">
        {TYPES.map((ty) => (
          <button
            key={ty}
            type="button"
            className={`sa-chip sa-mono${type === ty ? " active" : ""}`}
            aria-pressed={type === ty}
            data-testid="chat-sample-commit-type"
            data-type={ty}
            onClick={() => setType(ty)}
          >
            {ty}
          </button>
        ))}
      </div>
      <div className="sa-grid2">
        <div>
          <label className="sa-label" htmlFor="sa-commit-scope">
            {d.scope}
          </label>
          <input
            id="sa-commit-scope"
            className="sa-input sa-mono"
            value={scope}
            spellCheck={false}
            data-testid="chat-sample-commit-scope"
            onChange={(e) => setScope(e.target.value)}
          />
        </div>
        <div>
          <label className="sa-label" htmlFor="sa-commit-breaking">
            {d.breaking}
          </label>
          <button
            id="sa-commit-breaking"
            type="button"
            className={`sa-chip${breaking ? " active" : ""}`}
            aria-pressed={breaking}
            onClick={() => setBreaking((v) => !v)}
          >
            {breaking ? "!" : "—"}
          </button>
        </div>
      </div>
      <label className="sa-label" htmlFor="sa-commit-subject">
        {d.subject}
      </label>
      <input
        id="sa-commit-subject"
        className="sa-input"
        value={subject}
        data-testid="chat-sample-commit-subject"
        onChange={(e) => setSubject(e.target.value)}
      />
      <p className="sa-hint">{d.subjectHint}</p>
      <label className="sa-label" htmlFor="sa-commit-body">
        {d.body}
      </label>
      <textarea
        id="sa-commit-body"
        className="sa-area"
        rows={3}
        value={body}
        data-testid="chat-sample-commit-body"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="sa-row sa-split">
        <span className="sa-label">{d.preview}</span>
        <button
          type="button"
          className="cbtn cbtn-ghost sa-copy"
          disabled={!canCopy}
          aria-label={copied ? t("copied") : t("copy")}
          data-testid="chat-sample-commit-copy"
          onClick={copy}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="sa-pre sa-mono" data-testid="chat-sample-commit-preview">
        {message}
      </pre>
    </div>
  );
}

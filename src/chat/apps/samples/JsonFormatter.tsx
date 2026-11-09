/* Sample app: JSON format / minify / validate with line:col error locate. */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n, type Lang } from "../../i18n";

const zh = {
  input: "输入",
  format: "格式化",
  minify: "压缩",
  reset: "示例",
  output: "输出",
  valid: "JSON 有效",
  error: "错误",
};

type Dict = typeof zh;

const en: Dict = {
  input: "Input",
  format: "Format",
  minify: "Minify",
  reset: "Sample",
  output: "Output",
  valid: "Valid JSON",
  error: "Error",
};

const DICTS: Record<Lang, Dict> = { zh, en };

const SAMPLE = JSON.stringify(
  {
    app: "khala",
    version: "0.1.0",
    transport: ["mock", "tauri"],
    design: { palette: ["#FBFBFC", "#17171C"], radius: [5, 8, 10] },
  },
  null,
  2,
);

/* line:col from the engine position, unless the message states it inline. */
function locate(message: string, text: string): string | null {
  if (/\(line \d+ column \d+\)/.test(message)) return null;
  const pos = message.match(/position (\d+)/);
  if (!pos) return null;
  const upto = text.slice(0, Number(pos[1]));
  const line = upto.split("\n").length;
  const col = upto.length - upto.lastIndexOf("\n");
  return `line ${line} column ${col}`;
}

export function JsonFormatter() {
  const { lang, t } = useI18n();
  const d = DICTS[lang];
  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (indent: number) => {
    try {
      const value = JSON.parse(input) as unknown;
      setOutput(JSON.stringify(value, null, indent));
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const at = locate(message, input);
      setError(at ? `${message} (${at})` : message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="sa-root" data-testid="chat-sample-app" data-sample="json">
      <div className="sa-row sa-split">
        <span className="sa-label">{d.input}</span>
        <span className="sa-row">
          <button
            type="button"
            className="cbtn cbtn-ink sa-btn"
            data-testid="chat-sample-json-format"
            onClick={() => run(2)}
          >
            {d.format}
          </button>
          <button
            type="button"
            className="cbtn cbtn-ghost sa-btn"
            data-testid="chat-sample-json-minify"
            onClick={() => run(0)}
          >
            {d.minify}
          </button>
          <button
            type="button"
            className="cbtn cbtn-ghost sa-btn"
            data-testid="chat-sample-json-reset"
            onClick={() => {
              setInput(SAMPLE);
              setOutput(SAMPLE);
              setError(null);
            }}
          >
            {d.reset}
          </button>
        </span>
      </div>
      <textarea
        className="sa-area sa-mono"
        rows={6}
        value={input}
        spellCheck={false}
        data-testid="chat-sample-json-input"
        onChange={(e) => setInput(e.target.value)}
      />
      {error ? (
        <p className="sa-err" data-testid="chat-sample-json-error">
          {d.error}: {error}
        </p>
      ) : (
        <p className="sa-ok" data-testid="chat-sample-json-valid">
          {d.valid}
        </p>
      )}
      <div className="sa-row sa-split">
        <span className="sa-label">{d.output}</span>
        <button
          type="button"
          className="cbtn cbtn-ghost sa-copy"
          aria-label={copied ? t("copied") : t("copy")}
          data-testid="chat-sample-json-copy"
          onClick={copy}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="sa-pre sa-mono" data-testid="chat-sample-json-output">
        {output}
      </pre>
    </div>
  );
}

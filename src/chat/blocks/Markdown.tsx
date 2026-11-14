/*
 * Minimal markdown renderer: paragraphs, H1-H4 (deeper levels clamp down),
 * lists, fenced code blocks + copy, inline code, bold, links. Anything
 * outside the set degrades to plain text; only http(s) links become
 * anchors — real streams will carry untrusted markdown.
 */
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../i18n";
import { fencedRegistry, resolveCodeRoute, resolveMathRoute } from "../extensions/registry";
import { ExtensionBlock } from "./ExtensionBlock";
import { InlineMath } from "./InlineMath";
import { MathBlock } from "./MathBlock";
import { parseInlineMath, splitMathBlocks } from "./mathDelimiter";

interface MarkdownProps {
  markdown: string;
  caret?: boolean;
}

/* Math is the last alternative so bold/code/link win position ties, and it
 * stays non-capturing to preserve the single-group split semantics. */
const INLINE_RE =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<!\\)\$(?:[A-Za-z0-9\\(][^$]*[A-Za-z0-9)}^_]|[A-Za-z0-9])\$(?!\$))/g;
const BOLD_RE = /^\*\*[^*]+\*\*$/;
const CODE_RE = /^`[^`]+`$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const SAFE_HREF = /^https?:\/\//i;

function renderInline(text: string, keyBase: string): ReactNode[] {
  return text
    .split(INLINE_RE)
    .filter((p) => p !== "")
    .map((part, i) => {
      const key = `${keyBase}-${i}`;
      if (BOLD_RE.test(part)) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (CODE_RE.test(part)) {
        return (
          <code key={key} className="md-code-inline">
            {part.slice(1, -1)}
          </code>
        );
      }
      const link = part.match(LINK_RE);
      if (link && SAFE_HREF.test(link[2])) {
        return (
          <a key={key} className="md-link" href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        );
      }
      const tex = parseInlineMath(part);
      if (tex !== null) {
        const ext = fencedRegistry.lookupMath("inline");
        if (ext) return <InlineMath key={key} ext={ext} tex={tex} />;
      }
      return <span key={key}>{part}</span>;
    });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <div className="md-code" data-testid="chat-code-block" data-lang={lang}>
      <div className="md-code-head">
        <span className="md-code-lang">{lang || "text"}</span>
        <button
          type="button"
          className="md-code-copy"
          data-testid="chat-code-copy"
          onClick={() => void copy()}
          aria-label={t("copyCodeAria")}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

type Segment =
  | { type: "code"; lang: string; code: string; closed: boolean }
  | { type: "math"; tex: string }
  | { type: "lines"; lines: string[] };

/* Math segments split from the buffered line runs only when a math renderer
 * is registered; otherwise segmentation matches the pre-math output exactly. */
function segment(markdown: string, mathEnabled: boolean): Segment[] {
  const segs: Segment[] = [];
  const lines = markdown.split("\n");
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      if (mathEnabled) segs.push(...splitMathBlocks(buffer));
      else segs.push({ type: "lines", lines: buffer });
      buffer = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```([\w+#-]*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      /* i landed on the closing fence → closed; ran to EOF → still streaming. */
      segs.push({ type: "code", lang: fence[1], code: code.join("\n"), closed: i < lines.length });
    } else {
      buffer.push(lines[i]);
    }
  }
  flush();
  return segs;
}

function renderLines(lines: string[], keyBase: string, caret = false): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  // Paragraphs buffer until the next block starts; the box defeats TS flow
  // analysis, which would freeze the initial null narrowing of a plain let.
  const box: { last: { index: number; key: string; text: string } | null } = { last: null };
  let para: string[] | null = null;
  const flushPara = () => {
    if (para === null) return;
    const key = `${keyBase}-${n++}`;
    const text = para.join("\n");
    box.last = { index: out.length, key, text };
    out.push(
      <p key={key} className="md-p">
        {renderInline(text, key)}
      </p>,
    );
    para = null;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      flushPara();
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      const level = Math.min(heading[1].length, 4);
      const Tag = (`h${level}` as unknown) as "h1";
      const key = `${keyBase}-${n++}`;
      out.push(
        <Tag key={key} className={`md-h md-h${level}`}>
          {renderInline(heading[2], key)}
        </Tag>,
      );
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      const key = `${keyBase}-${n++}`;
      out.push(
        <ul key={key} className="md-ul">
          {items.map((t, j) => (
            <li key={`${key}-${j}`}>{renderInline(t, `${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      const key = `${keyBase}-${n++}`;
      out.push(
        <ol key={key} className="md-ol">
          {items.map((t, j) => (
            <li key={`${key}-${j}`}>{renderInline(t, `${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (para === null) para = [];
    para.push(line);
    i += 1;
  }
  flushPara();
  const lastPara = box.last;
  if (caret && lastPara) {
    out[lastPara.index] = (
      <p key={lastPara.key} className="md-p">
        {renderInline(lastPara.text, lastPara.key)}
        <span className="stream-caret" aria-hidden />
      </p>
    );
  }
  return out;
}

export function Markdown({ markdown, caret = false }: MarkdownProps) {
  const mathExt = resolveMathRoute(fencedRegistry);
  const segs = segment(markdown, mathExt !== null);
  let lastLines = -1;
  segs.forEach((seg, si) => {
    if (seg.type === "lines") lastLines = si;
  });
  const nodes: ReactNode[] = [];
  segs.forEach((seg, si) => {
    if (seg.type === "code") {
      const ext = resolveCodeRoute(seg.closed, seg.lang, fencedRegistry);
      if (ext) {
        nodes.push(<ExtensionBlock key={`c-${si}`} ext={ext} lang={seg.lang} code={seg.code} />);
      } else {
        nodes.push(<CodeBlock key={`c-${si}`} lang={seg.lang} code={seg.code} />);
      }
    } else if (seg.type === "math" && mathExt) {
      nodes.push(<MathBlock key={`m-${si}`} ext={mathExt} tex={seg.tex} />);
    } else if (seg.type === "lines") {
      nodes.push(...renderLines(seg.lines, `l-${si}`, caret && si === lastLines));
    }
  });
  return <div className="md">{nodes}</div>;
}

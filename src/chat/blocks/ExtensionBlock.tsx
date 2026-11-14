/*
 * Host component for fenced-block render extensions: debounced render,
 * stale-result discard, render/source toggle, copy, theme re-render. A
 * failed render falls back to the plain source view.
 */
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../i18n";
import { useResolvedTheme } from "../useTheme";
import type { FencedBlockExtension } from "../extensions/types";

const DEBOUNCE_MS = 250;

interface ExtensionBlockProps {
  ext: FencedBlockExtension;
  lang: string;
  code: string;
}

export function ExtensionBlock({ ext, lang, code }: ExtensionBlockProps) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"render" | "source">("render");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const renderer = await ext.load();
          const result = await renderer.render(code, { theme });
          if (cancelled) return;
          if (result.kind === "html") {
            setHtml(result.html);
            setError("");
          } else {
            setHtml(null);
            setError(result.message);
          }
        } catch (err) {
          if (cancelled) return;
          setHtml(null);
          setError(err instanceof Error ? err.message : "");
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ext, code, theme]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const effectiveView: "render" | "source" = error ? "source" : view;

  return (
    <div className="md-code" data-testid="chat-diagram-block" data-lang={lang}>
      <div className="md-code-head">
        <span className="md-code-lang">{lang || "text"}</span>
        <span className="md-diagram-actions">
          {!error && (
            <button
              type="button"
              className="md-code-copy"
              onClick={() => setView(view === "render" ? "source" : "render")}
            >
              {effectiveView === "render" ? t("viewSource") : t("viewDiagram")}
            </button>
          )}
          <button
            type="button"
            className="md-code-copy"
            data-testid="chat-diagram-copy"
            onClick={() => void copy()}
            aria-label={t("copyCodeAria")}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t("copied") : t("copy")}
          </button>
        </span>
      </div>
      {effectiveView === "render" ? (
        html ? (
          <div className="md-diagram-body" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="md-diagram-body">
            <span className="md-diagram-note">{t("diagramLoading")}</span>
          </div>
        )
      ) : (
        <>
          {error !== "" && (
            <p className="md-diagram-err">
              {t("diagramError")}
              {error ? ` — ${error}` : ""}
            </p>
          )}
          <pre className="md-code-pre">
            <code>{code}</code>
          </pre>
        </>
      )}
    </div>
  );
}

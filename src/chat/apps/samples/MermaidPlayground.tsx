/* Sample app: mermaid playground over the extensions registry, using the
 * same provider as the chat markdown layer; a missing provider shows an
 * empty-state notice. */
import { useEffect, useRef, useState } from "react";
import { useI18n, type Lang } from "../../i18n";
import { useResolvedTheme } from "../../useTheme";
import { fencedRegistry } from "../../extensions/registry";
import type { FencedBlockRenderer } from "../../extensions/types";

const zh = {
  presets: "预设",
  source: "mermaid 源码",
  preview: "预览",
  rendering: "渲染中…",
  renderError: "渲染失败",
  disabledTitle: "mermaid 渲染器未启用",
  disabledHint: "providers/mermaid.ext.ts 不在位或依赖已移除;聊天里的 mermaid 代码块当前按纯文本展示。",
  presetFlow: "流程图",
  presetSeq: "时序图",
  presetPie: "饼图",
  presetClass: "类图",
};

type Dict = typeof zh;

const en: Dict = {
  presets: "Presets",
  source: "mermaid source",
  preview: "Preview",
  rendering: "Rendering...",
  renderError: "Render failed",
  disabledTitle: "mermaid renderer not enabled",
  disabledHint: "providers/mermaid.ext.ts is missing or the dependency was removed; mermaid blocks in chat currently render as plain text.",
  presetFlow: "Flowchart",
  presetSeq: "Sequence",
  presetPie: "Pie",
  presetClass: "Class",
};

const DICTS: Record<Lang, Dict> = { zh, en };

const PRESETS: { id: string; labelKey: keyof Dict; code: string }[] = [
  {
    id: "flow",
    labelKey: "presetFlow",
    code: "flowchart TD\n  A[开始] --> B{语法解析}\n  B -- 通过 --> C[渲染 SVG]\n  B -- 失败 --> D[回退源码]\n  C --> E[上屏]\n  D --> E",
  },
  {
    id: "seq",
    labelKey: "presetSeq",
    code: "sequenceDiagram\n  participant U as 用户\n  participant K as khala\n  U->>K: 输入 mermaid 源码\n  K-->>U: 防抖后实时成图\n  Note over K: 主题跟随 data-theme",
  },
  {
    id: "pie",
    labelKey: "presetPie",
    code: "pie title 渲染结果占比\n  \"成功\" : 92\n  \"语法错误\" : 8",
  },
  {
    id: "class",
    labelKey: "presetClass",
    code: "classDiagram\n  class ExtensionBlock {\n    +debounce()\n    +toggleView()\n  }\n  class Provider {\n    +load()\n    +render(code, theme)\n  }\n  ExtensionBlock --> Provider : 注册表查找",
  },
];

export function MermaidPlayground() {
  const { lang } = useI18n();
  const t = DICTS[lang];
  const theme = useResolvedTheme();
  const ext = fencedRegistry.lookup("mermaid");
  const [renderer, setRenderer] = useState<FencedBlockRenderer | null>(null);
  const [presetId, setPresetId] = useState("flow");
  const [code, setCode] = useState(PRESETS[0].code);
  const [html, setHtml] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ext) return;
    let alive = true;
    void ext
      .load()
      .then((r) => {
        if (alive) setRenderer(r);
      })
      .catch(() => {
        if (alive) setErr("load failed");
      });
    return () => {
      alive = false;
    };
  }, [ext]);

  /* Debounced live render; stale results are dropped by sequence token. A
   * parse failure keeps the last good diagram and reports the error inline. */
  const seq = useRef(0);
  useEffect(() => {
    if (!renderer) return;
    const my = ++seq.current;
    const timer = window.setTimeout(() => {
      void renderer
        .render(code, { theme })
        .then((res) => {
          if (seq.current !== my) return;
          if (res.kind === "html") {
            setHtml(res.html);
            setErr("");
          } else {
            setErr(res.message);
          }
        })
        .catch((e: unknown) => {
          if (seq.current !== my) return;
          setErr(e instanceof Error ? e.message : "render failed");
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [renderer, code, theme]);

  if (!ext) {
    return (
      <div className="sa-root">
        <p className="sa-label">{t.disabledTitle}</p>
        <p className="sa-hint">{t.disabledHint}</p>
      </div>
    );
  }

  return (
    <div className="sa-root">
      <div className="sa-row sa-wrap">
        <span className="sa-label">{t.presets}</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`sa-chip${presetId === p.id ? " active" : ""}`}
            onClick={() => {
              setPresetId(p.id);
              setCode(p.code);
            }}
          >
            {t[p.labelKey]}
          </button>
        ))}
      </div>
      <textarea
        className="sa-area sa-mono"
        rows={7}
        value={code}
        spellCheck={false}
        aria-label={t.source}
        onChange={(e) => {
          setCode(e.target.value);
          setPresetId("");
        }}
      />
      <div className="sa-row sa-split">
        <span className="sa-label">{t.preview}</span>
        {err !== "" && <p className="sa-err">{`${t.renderError} — ${err}`}</p>}
      </div>
      {html ? (
        <div className="sa-diagram" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="sa-diagram">
          <span className="sa-label">{t.rendering}</span>
        </div>
      )}
    </div>
  );
}

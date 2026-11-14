/* $$ block host: centered display math without code chrome. Bad TeX renders
 * as the library's own red echo; the error path covers load/exception
 * failures only. */
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import type { FencedBlockExtension } from "../extensions/types";
import { renderTex } from "./mathRender";

interface MathBlockProps {
  ext: FencedBlockExtension;
  tex: string;
}

export function MathBlock({ ext, tex }: MathBlockProps) {
  const { t } = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void renderTex(ext, tex, true).then((h) => {
      if (cancelled) return;
      if (h === null) setFailed(true);
      else setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [ext, tex]);

  if (failed) {
    return (
      <div>
        <p className="md-diagram-err">{t("mathError")}</p>
        <pre className="md-math-src">
          <code>{tex}</code>
        </pre>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="md-math">
        <span className="md-diagram-note">{t("mathLoading")}</span>
      </div>
    );
  }
  return <div className="md-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

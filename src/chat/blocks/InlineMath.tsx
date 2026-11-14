/* Inline $...$ host. Keys stay stable while streaming, so the effect runs
 * once per formula; output inherits currentColor and renders one-shot. */
import { useEffect, useState } from "react";
import type { FencedBlockExtension } from "../extensions/types";
import { renderTex } from "./mathRender";

interface InlineMathProps {
  ext: FencedBlockExtension;
  tex: string;
}

export function InlineMath({ ext, tex }: InlineMathProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void renderTex(ext, tex, false).then((h) => {
      if (!cancelled && h !== null) setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [ext, tex]);

  if (html === null) return <span>{`$${tex}$`}</span>;
  return <span className="md-math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

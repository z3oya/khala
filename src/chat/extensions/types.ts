/*
 * Fenced-block render extensions: the contract between the markdown layer
 * and optional heavy renderers (mermaid, katex, plantuml, more later).
 *
 * The host injects { kind: "html" } output verbatim, so a provider must
 * return markup safe for verbatim injection (mermaid: securityLevel
 * "strict"; katex: trust false; plantuml: DOMPurify svg profile). Error
 * messages are plain strings rendered as text. renderMath output is under
 * the same rule.
 *
 * Three seams are open: fence langs (this contract), $$ blocks (Markdown's
 * segment layer via math claims), and inline $...$ (renderInline). A
 * provider declaring math whose renderer lacks renderMath is treated as
 * not enabled. Interactive renderers extend the result union with
 * { kind: "component", Component }.
 */
import type { ResolvedTheme } from "../useTheme";

export interface FencedBlockExtension {
  /** Stable identifier for warnings/tracing ("mermaid"). */
  id: string;
  /** Fence languages this extension claims; matched after trim+lowercase. */
  langs: string[];
  /** Loads the heavy library once; host instances share the promise. */
  load(): Promise<FencedBlockRenderer>;
  /** Math claims: $$ blocks and inline $...$; first registration wins. */
  math?: { block?: boolean; inline?: boolean };
  /** Host loading-string key; defaults to diagramLoading. */
  loadingKey?: "diagramLoading" | "mathLoading";
}

export type FencedRenderResult =
  | { kind: "html"; html: string }
  | { kind: "error"; message: string };

export interface FencedBlockRenderer {
  render(code: string, ctx: { theme: ResolvedTheme }): Promise<FencedRenderResult>;
  /** Math rendering; display separates $$ blocks from inline $...$. */
  renderMath?(tex: string, opts: { display: boolean }): Promise<FencedRenderResult>;
}

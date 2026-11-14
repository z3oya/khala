/*
 * Fenced-block render extensions: the contract between the markdown layer
 * and optional heavy renderers (mermaid today, more later).
 *
 * The host injects { kind: "html" } output verbatim, so a provider must
 * return markup safe for verbatim injection (mermaid: securityLevel
 * "strict", bindFunctions dropped, default maxTextSize kept). Error
 * messages are plain strings rendered as text.
 *
 * Future seams: math ($$...$$, KaTeX) enters at Markdown's segment() layer
 * as a new Segment kind plus a parallel lookup; interactive renderers
 * extend the result union with { kind: "component", Component }.
 */
import type { ResolvedTheme } from "../useTheme";

export interface FencedBlockExtension {
  /** Stable identifier for warnings/tracing ("mermaid"). */
  id: string;
  /** Fence languages this extension claims; matched after trim+lowercase. */
  langs: string[];
  /** Loads the heavy library once; host instances share the promise. */
  load(): Promise<FencedBlockRenderer>;
}

export type FencedRenderResult =
  | { kind: "html"; html: string }
  | { kind: "error"; message: string };

export interface FencedBlockRenderer {
  render(code: string, ctx: { theme: ResolvedTheme }): Promise<FencedRenderResult>;
}

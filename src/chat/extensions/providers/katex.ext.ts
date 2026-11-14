/*
 * katex extension — the only file referencing the katex package, and only
 * inside load(), keeping the library, its CSS and fonts an async chunk.
 * Unplug: delete this file + `pnpm remove katex`.
 *
 * Fences render in display mode; $$ blocks and inline $...$ route through
 * renderMath with the display flag. Output inherits currentColor, so one
 * render serves both themes and throwOnError:false echoes bad TeX in red.
 */
import type { FencedBlockExtension, FencedBlockRenderer } from "../types";

type Katex = (typeof import("katex"))["default"];

let libPromise: Promise<Katex> | undefined;

async function ensureLib(): Promise<Katex> {
  libPromise ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(
    ([mod]) => mod.default,
  );
  return libPromise;
}

async function renderTexToHtml(tex: string, displayMode: boolean) {
  const katex = await ensureLib();
  const html = katex.renderToString(tex, { displayMode, throwOnError: false });
  return { kind: "html" as const, html };
}

const renderer: FencedBlockRenderer = {
  async render(code: string) {
    return renderTexToHtml(code, true);
  },
  async renderMath(tex, opts) {
    return renderTexToHtml(tex, opts.display);
  },
};

const extension: FencedBlockExtension = {
  id: "katex",
  langs: ["latex", "tex", "math"],
  math: { block: true, inline: true },
  loadingKey: "mathLoading",
  async load() {
    return renderer;
  },
};

export default extension;

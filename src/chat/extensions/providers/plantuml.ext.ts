/*
 * plantuml extension — the only file referencing the @plantuml/core
 * package, and only inside load()/render(), keeping the multi-MB TeaVM
 * engine an async chunk. Unplug: delete this file + plantuml.d.ts +
 * `pnpm remove @plantuml/core` (dompurify stays if another provider uses it).
 *
 * Diagram source passes through verbatim; khala styling rides on CSS
 * filters scoped to [data-ext="plantuml"] in chat.css. viz-global.js (the
 * Graphviz layout engine) must run as a classic script, so it loads via a
 * ?url asset + injected <script>. Output is sanitized with DOMPurify —
 * the package emits link and event attributes verbatim and the host
 * injects verbatim.
 */
import type { FencedBlockExtension, FencedBlockRenderer } from "../types";

declare global {
  var Viz: unknown;
  var PLANTUML_VIZ: unknown;
}

type Core = typeof import("@plantuml/core");

let vizPromise: Promise<void> | undefined;
let corePromise: Promise<Core> | undefined;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("viz-global script failed to load"));
    document.head.appendChild(el);
  });
}

function ensureViz(): Promise<void> {
  vizPromise ??= (async () => {
    if (globalThis.Viz === undefined) {
      const { default: url } = await import("@plantuml/core/viz-global.js?url");
      await injectScript(url);
    }
    if (globalThis.Viz === undefined) throw new Error("viz-global unavailable");
    globalThis.PLANTUML_VIZ ??= globalThis.Viz;
  })();
  return vizPromise;
}

function ensureCore(): Promise<Core> {
  corePromise ??= import("@plantuml/core");
  return corePromise;
}

const renderer: FencedBlockRenderer = {
  async render(code: string) {
    try {
      await ensureViz();
      const core = await ensureCore();
      const { default: DOMPurify } = await import("dompurify");
      /* CR/BOM normalization: a trailing \r rides the line's last token and
       * fails the grammar. */
      const lines = code.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n");
      const svg = await new Promise<string>((resolve, reject) => {
        core.renderToString(lines, resolve, (msg) => reject(new Error(msg)), {
          maxSvgSize: 8192,
        });
      });
      const html = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
      return { kind: "html", html };
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[plantuml] render failed; input lines:", JSON.stringify(code.split("\n")));
      }
      return { kind: "error", message: err instanceof Error ? err.message : "render failed" };
    }
  },
};

const extension: FencedBlockExtension = {
  id: "plantuml",
  langs: ["plantuml", "puml"],
  async load() {
    return renderer;
  },
};

export default extension;

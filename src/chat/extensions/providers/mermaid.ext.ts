/*
 * mermaid fenced-block extension — the only file referencing the mermaid
 * package, and only inside load(), keeping the library an async chunk.
 * Unplug: delete this file + `pnpm remove mermaid`.
 *
 * mermaid's config is global per initialize() and CSS variables cannot feed
 * themeVariables, so the khala tokens from tokens.css are hardcoded for both
 * themes and render() re-initializes on a theme flip. Renders serialize
 * through one queue so a re-init cannot interleave another parse/render.
 */
import type { MermaidConfig } from "mermaid";
import type { FencedBlockExtension, FencedBlockRenderer } from "../types";
import type { ResolvedTheme } from "../../useTheme";

type Mermaid = (typeof import("mermaid"))["default"];

const FONT_FAMILY = 'ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace';

/* tokens.css light theme. */
const LIGHT_VARS: Record<string, string> = {
  background: "transparent",
  fontFamily: FONT_FAMILY,
  primaryColor: "#efeff1",
  primaryBorderColor: "#cfcfd4",
  primaryTextColor: "#26262b",
  lineColor: "#cfcfd4",
  textColor: "#26262b",
  mainBkg: "#efeff1",
  nodeBorder: "#cfcfd4",
  clusterBkg: "#f6f6f7",
  clusterBorder: "#e2e2e6",
  edgeLabelBackground: "#fbfbfc",
  titleColor: "#17171c",
  actorBkg: "#efeff1",
  actorBorder: "#cfcfd4",
  actorTextColor: "#26262b",
  signalColor: "#66666c",
  signalTextColor: "#26262b",
  loopTextColor: "#66666c",
  activationBkgColor: "#e4e4e7",
  activationBorderColor: "#cfcfd4",
  noteBkgColor: "#f6f6f7",
  noteTextColor: "#26262b",
  noteBorderColor: "#e2e2e6",
  cScale0: "#26262b",
  cScale1: "#66666c",
  cScale2: "#9b9ba1",
  cScale3: "#cfcfd4",
  cScale4: "#e4e4e7",
  cScale5: "#efeff1",
  cScaleLabel0: "#fafafb",
  cScaleLabel1: "#fafafb",
  cScaleLabel2: "#26262b",
  cScaleLabel3: "#26262b",
  cScaleLabel4: "#26262b",
  cScaleLabel5: "#26262b",
  pieTitleTextColor: "#17171c",
};

/* tokens.css dark theme. */
const DARK_VARS: Record<string, string> = {
  background: "transparent",
  fontFamily: FONT_FAMILY,
  primaryColor: "#212227",
  primaryBorderColor: "#3f4046",
  primaryTextColor: "#e4e4e8",
  lineColor: "#3f4046",
  textColor: "#e4e4e8",
  mainBkg: "#212227",
  nodeBorder: "#3f4046",
  clusterBkg: "#191a1e",
  clusterBorder: "#2b2c32",
  edgeLabelBackground: "#131316",
  titleColor: "#ececf1",
  actorBkg: "#212227",
  actorBorder: "#3f4046",
  actorTextColor: "#e4e4e8",
  signalColor: "#a6a6ae",
  signalTextColor: "#e4e4e8",
  loopTextColor: "#a6a6ae",
  activationBkgColor: "#2a2b31",
  activationBorderColor: "#3f4046",
  noteBkgColor: "#191a1e",
  noteTextColor: "#e4e4e8",
  noteBorderColor: "#2b2c32",
  cScale0: "#ececf1",
  cScale1: "#a6a6ae",
  cScale2: "#75757d",
  cScale3: "#3f4046",
  cScale4: "#2a2b31",
  cScale5: "#212227",
  cScaleLabel0: "#1a1a1f",
  cScaleLabel1: "#1a1a1f",
  cScaleLabel2: "#ececf1",
  cScaleLabel3: "#ececf1",
  cScaleLabel4: "#ececf1",
  cScaleLabel5: "#ececf1",
  pieTitleTextColor: "#ececf1",
};

const themeVars = (theme: ResolvedTheme): Record<string, string> =>
  theme === "dark" ? DARK_VARS : LIGHT_VARS;

let libPromise: Promise<Mermaid> | undefined;
let currentTheme: ResolvedTheme | undefined;
let idCounter = 0;
let queue: Promise<unknown> = Promise.resolve();

async function ensureLib(): Promise<Mermaid> {
  libPromise ??= import("mermaid").then((mod) => mod.default);
  return libPromise;
}

async function ensureTheme(lib: Mermaid, theme: ResolvedTheme): Promise<void> {
  if (currentTheme === theme) return;
  const config: MermaidConfig = {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: themeVars(theme),
  };
  await lib.initialize(config);
  currentTheme = theme;
}

const renderer: FencedBlockRenderer = {
  async render(code, ctx) {
    const lib = await ensureLib();
    const task = async (): Promise<{ kind: "html"; html: string } | { kind: "error"; message: string }> => {
      try {
        await ensureTheme(lib, ctx.theme);
        /* suppressErrors: parse failure returns false instead of throwing. */
        const ok = await lib.parse(code, { suppressErrors: true });
        if (!ok) return { kind: "error", message: "syntax error" };
        const { svg } = await lib.render(`khala-mermaid-${idCounter++}`, code);
        return { kind: "html", html: svg };
      } catch (err) {
        return { kind: "error", message: err instanceof Error ? err.message : "render failed" };
      }
    };
    /* task catches internally, so the queue never rejects. */
    const result = queue.then(task);
    queue = result.then(() => undefined);
    return result;
  },
};

const extension: FencedBlockExtension = {
  id: "mermaid",
  langs: ["mermaid", "mmd"],
  async load() {
    return renderer;
  },
};

export default extension;

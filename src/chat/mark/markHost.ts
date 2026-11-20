/**
 * Host runtime — 1:1 port of grok-bot-mark.
 * rAF loop / IO visibility / settle-wake / ResizeObserver / pointer gaze / props diff dispatch
 * keep the source structure; DOM observers are created only after attach; the render entry is injected per PORTING.md §4.
 */
import type {
  LookDir,
  MarkAppearance,
  MarkFrame,
  MarkHost,
  MarkHostProps,
  MarkState,
  PokeKind,
  RawClip,
  StateMorphName,
  SvgNode,
  Vec2,
} from "./types";
import { BASE_ZOOM } from "./engine/clip";
import { fnv1a } from "./engine/math/rand";
import { createPuppet } from "./engine/puppet";
import { createDirector } from "./engine/director";
import { pointerToGaze } from "./engine/gaze";
import { patchSvg } from "./svgPatch";

// ── Constants ────────────────────────────────────────────

const COMPACT_SIZE_THRESHOLD = 48;
const STATIC_ADVANCE_STEPS = 60;
const STATIC_ADVANCE_DT = 0.1;

function zoomMulForFill(fill: number): number {
  return fill / BASE_ZOOM;
}

// Read once at creation, unaffected by later system setting changes (same as source).
export function prefersReducedMotion(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? false
    : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Props normalization ─────────────────────────────────

/** Normalized props: defaults filled in. */
export interface NormalizedMarkHostProps {
  id: string;
  body: MarkHostProps["body"];
  appearance: MarkAppearance;
  state: MarkState | undefined;
  clip: RawClip | null;
  morph: StateMorphName | null;
  size: number | "fill";
  fill: number;
  resolution: number | undefined;
  maxFrameRate: number;
  isPlaying: boolean;
  isEmphasized: boolean;
  isFollowingPointer: boolean;
  isStatic: boolean;
  isProof: boolean;
}

export function normalizeMarkHostProps(e: MarkHostProps): NormalizedMarkHostProps {
  return {
    id: e.id,
    body: e.body,
    appearance: e.appearance,
    state: e.state,
    clip: e.clip ?? null,
    morph: e.morph ?? null,
    size: e.size,
    fill: e.fill ?? 0.6,
    resolution: e.resolution,
    maxFrameRate: e.maxFrameRate ?? 60,
    isPlaying: e.isPlaying ?? true,
    isEmphasized: e.isEmphasized ?? false,
    isFollowingPointer: e.isFollowingPointer ?? false,
    isStatic: e.isStatic ?? false,
    isProof: e.isProof ?? false,
  };
}

/** Render resolution: explicit resolution wins; otherwise size·fill/BASE_ZOOM rounded to hundredths. */
export function computeResolution(size: number, fill: number, resolution?: number): number {
  return resolution ?? Math.round(size * zoomMulForFill(fill) * 100) / 100;
}

// ── Diff dispatch decision ───────────────────────────────

/** Diff dispatch action set; field order is the source dispatch order. */
export interface UpdatePlan {
  body: boolean;
  clip: boolean;
  morph: boolean;
  state: boolean;
  isEmphasized: boolean;
  playing: boolean;
  repaint: boolean;
  size: boolean;
  isFollowingPointer: boolean;
  loop: boolean;
}

export function planUpdate(
  a: NormalizedMarkHostProps,
  t: NormalizedMarkHostProps,
  isReducedMotion: boolean,
): UpdatePlan {
  const changed = (key: keyof NormalizedMarkHostProps) => !Object.is(a[key], t[key]);
  const degradedBefore = a.isStatic || isReducedMotion;
  const liveBefore = a.isPlaying && !degradedBefore;
  const degradedAfter = t.isStatic || isReducedMotion;
  const liveAfter = t.isPlaying && !degradedAfter;
  return {
    body: changed("body"),
    clip: changed("clip"),
    morph: changed("morph"),
    state: changed("state"),
    isEmphasized: changed("isEmphasized"),
    playing: liveBefore !== liveAfter,
    repaint:
      changed("appearance") || changed("fill") || changed("resolution") || changed("isProof"),
    size: changed("size"),
    isFollowingPointer: changed("isFollowingPointer"),
    loop: degradedBefore !== degradedAfter || changed("maxFrameRate"),
  };
}

// ── Renderer injection ──────────────────────────────────

/** Renderer contract (PORTING.md §4; isProof trimmed per §0.4 and not passed in). */
export type MarkRenderer = (
  frame: MarkFrame,
  appearance: MarkAppearance,
  resolution: number,
  id: string,
  opts?: { displaySize?: number },
) => SvgNode;

import { renderMarkToNode } from "./render/renderFrame";

let defaultRenderer: MarkRenderer | null = renderMarkToNode;

/** Inject/clear the default renderer (for test fakes or host-environment custom rendering). */
export function setDefaultMarkRenderer(renderer: MarkRenderer | null): void {
  defaultRenderer = renderer;
}

// ── Host ───────────────────────────────────────────────

/** Mount point built at attach: host = outer container, canvas = SVG patch target. */
interface MarkAttachment {
  host: HTMLElement;
  canvas: HTMLElement;
}

export function createMarkHost(props: MarkHostProps, renderer?: MarkRenderer): MarkHost {
  const renderFn = renderer ?? defaultRenderer;
  const reducedMotion = prefersReducedMotion();
  let t = normalizeMarkHostProps(props);
  const isDegraded = (): boolean => t.isStatic || reducedMotion;
  const isLive = (): boolean => t.isPlaying && !isDegraded();
  const puppet = createPuppet({ body: t.body });
  const director =
    t.state === undefined
      ? null
      : createDirector(puppet, t.state, {
          // seed comes from the original creation-time props (the normalized form has no seed field).
          seed: fnv1a(props.seed ?? props.id),
          isCompact: typeof t.size !== "number" || t.size < COMPACT_SIZE_THRESHOLD,
          isResting: !isLive(),
        });
  let displaySize = typeof t.size === "number" ? t.size : 0;
  let attachment: MarkAttachment | null = null;
  let wakeHandle: { wake: () => void } | null = null;
  let resizeDetach: (() => void) | null = null;
  let pointerDetach: (() => void) | null = null;
  let loopDetach: (() => void) | null = null;

  const render = (): void => {
    const canvas = attachment?.canvas;
    const { appearance, fill, resolution } = t;
    const res = computeResolution(displaySize, fill, resolution);
    if (canvas == null || res <= 0 || renderFn == null) return;
    patchSvg(
      canvas,
      renderFn(puppet.frame(), appearance, res, t.id, {
        displaySize: displaySize > 0 ? displaySize : res,
      }),
    );
  };

  // The degraded path warms up 60×0.1s before rendering so the static frame lands.
  const renderNow = (): void => {
    if (isDegraded()) {
      puppet.pause();
      puppet.seek(0);
      for (let i = 0; i < STATIC_ADVANCE_STEPS; i++) puppet.advance(STATIC_ADVANCE_DT);
      render();
    } else {
      render();
      wakeHandle?.wake();
    }
  };

  const onBody = (): void => {
    puppet.setBody(t.body, { isInstant: isDegraded() });
    renderNow();
  };
  const onClip = (): void => {
    if (director == null && t.clip != null) puppet.load(t.clip, { isPlaying: isLive() });
    renderNow();
  };
  const onMorph = (): void => {
    if (director == null) puppet.setMorph(t.morph, { isInstant: isDegraded() });
    renderNow();
  };
  const onState = (): void => {
    if (t.state !== undefined) director?.setState(t.state);
    renderNow();
  };
  const onEmphasis = (): void => {
    director?.setEmphasis(t.isEmphasized);
    renderNow();
  };
  const onPlaying = (): void => {
    if (director == null) {
      if (isLive()) puppet.play();
      else puppet.pause();
    } else director.setResting(!isLive());
    renderNow();
  };

  const attachResize = (host: HTMLElement): (() => void) | null => {
    const { size } = t;
    if (typeof size === "number") {
      displaySize = size;
      director?.setCompact(size < COMPACT_SIZE_THRESHOLD);
      renderNow();
      return null;
    }
    if (typeof ResizeObserver === "undefined") return null;
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (width !== displaySize) {
        displaySize = width;
        director?.setCompact(width < COMPACT_SIZE_THRESHOLD);
        renderNow();
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  };

  const attachPointer = (host: HTMLElement): (() => void) | null => {
    puppet.setGazeAlways(t.isFollowingPointer);
    if (!t.isFollowingPointer) return null;
    const onMove = (ev: PointerEvent): void => {
      puppet.setGaze(pointerToGaze(host.getBoundingClientRect(), { x: ev.clientX, y: ev.clientY }));
      wakeHandle?.wake();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      puppet.setGaze(null);
      wakeHandle?.wake();
    };
  };

  const attachLoop = (host: HTMLElement): (() => void) | null => {
    if (isDegraded()) return null;
    const minInterval = 1e3 / Math.max(1, t.maxFrameRate);
    let rafId = 0;
    let last = 0;
    let running = false;
    let visible = true;
    const tick = (now: number): void => {
      rafId = 0;
      if (now - last < minInterval - 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = (now - last) / 1e3;
      last = now;
      // Skip advancing while document.hidden; rendering continues either way.
      if (!document.hidden) {
        if (isLive()) director?.advance(dt);
        puppet.advance(dt);
      }
      render();
      // Settled and not live: the chain stops itself; only wake() revives it.
      if (!isLive() && puppet.isSettled) running = false;
      else rafId = requestAnimationFrame(tick);
    };
    const wake = (): void => {
      if (!running && visible) {
        running = true;
        last = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries[entries.length - 1]?.isIntersecting ?? true;
            if (visible) wake();
            else {
              cancelAnimationFrame(rafId);
              rafId = 0;
              running = false;
            }
          });
    io?.observe(host);
    wakeHandle = { wake };
    wake();
    return () => {
      cancelAnimationFrame(rafId);
      io?.disconnect();
      wakeHandle = null;
    };
  };

  const detachAll = (): void => {
    loopDetach?.();
    pointerDetach?.();
    resizeDetach?.();
    loopDetach = null;
    pointerDetach = null;
    resizeDetach = null;
    if (attachment != null) {
      attachment.canvas.remove();
      attachment = null;
    }
  };

  const onSize = (): void => {
    resizeDetach?.();
    resizeDetach = attachment == null ? null : attachResize(attachment.host);
  };
  const onPointerFlag = (): void => {
    pointerDetach?.();
    pointerDetach = null;
    if (attachment == null) puppet.setGazeAlways(t.isFollowingPointer);
    else pointerDetach = attachPointer(attachment.host);
  };
  const restartLoop = (): void => {
    loopDetach?.();
    loopDetach = attachment == null ? null : attachLoop(attachment.host);
  };

  const update = (patch: Partial<MarkHostProps>): void => {
    const prev = t;
    t = normalizeMarkHostProps({ ...t, ...patch });
    const plan = planUpdate(prev, t, reducedMotion);
    if (plan.body) onBody();
    if (plan.clip) onClip();
    if (plan.morph) onMorph();
    if (plan.state) onState();
    if (plan.isEmphasized) onEmphasis();
    if (plan.playing) onPlaying();
    if (plan.repaint) renderNow();
    if (plan.size) onSize();
    if (plan.isFollowingPointer) onPointerFlag();
    if (plan.loop) restartLoop();
  };

  // Creation-time init order matches the source; do not reorder.
  puppet.setBody(t.body, { isInstant: isDegraded() });
  if (director == null && t.clip != null) puppet.load(t.clip, { isPlaying: isLive() });
  if (director == null) puppet.setMorph(t.morph, { isInstant: isDegraded() });
  director?.setEmphasis(t.isEmphasized);
  if (director == null) {
    if (isLive()) puppet.play();
    else puppet.pause();
  } else director.setResting(!isLive());
  puppet.setGazeAlways(t.isFollowingPointer);

  const attach = (el: HTMLElement): (() => void) => {
    detachAll();
    const canvas = el.ownerDocument.createElement("span");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    el.appendChild(canvas);
    const att: MarkAttachment = { host: el, canvas };
    attachment = att;
    renderNow();
    resizeDetach = attachResize(el);
    pointerDetach = attachPointer(el);
    loopDetach = attachLoop(el);
    return () => {
      if (attachment === att) detachAll();
    };
  };

  return {
    attach,
    update,
    setState: (state: MarkState) => update({ state }),
    setBody: (body: MarkHostProps["body"]) => update({ body }),
    setPlaying: (v: boolean) => update({ isPlaying: v }),
    setExpression: (face, opts) => {
      puppet.setExpression(face, opts);
      renderNow();
    },
    blink: () => {
      puppet.blink();
      renderNow();
    },
    look: (dir: LookDir) => {
      puppet.look(dir);
      renderNow();
    },
    restart: () => {
      puppet.seek(0);
      puppet.play();
      renderNow();
    },
    poke: (kind: PokeKind, opts?: { turns?: number }) => {
      if (reducedMotion) return;
      puppet.poke(kind, opts);
      renderNow();
    },
    gaze: (g: Vec2 | null) => {
      if (reducedMotion) return;
      puppet.setGaze(g);
      renderNow();
    },
  };
}

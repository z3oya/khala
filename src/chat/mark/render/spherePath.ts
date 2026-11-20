/**
 * Sphere sprite — body double arc + eye cutout/fill + glow gradient + SVG wrapping.
 * The proof branch is not ported (the isProof render layer is ignored); eye frames/flips are passed in by the caller.
 */
import type { GlowSpec, MarkAppearance, MarkFrame, RGB, SvgNode, Vec2 } from "../types";
import {
  arcToPolyline,
  ellipsePoint,
  ellipseTwoArcs,
  mergeEyeArcs,
  renderEyes,
  type ClipSegment,
  type EyeFrame,
} from "./eyesRender";
import { el, fmt2, svgRoot } from "./svgTree";

const GLOW_STOPS = 48;
const HALO_STOPS = 11;
const HALO_REACH = 0.055;
const ARC_SPLIT_THRESHOLD = Math.PI * 0.999;
const SPHERE_RING_POINTS = 192;

// ── Gradients and colors ──────────────────

export interface GradientStop {
  offset: number;
  color: string;
  opacity: number;
}

export interface GradientSpec {
  transform: string;
  focus: number;
  stops: GradientStop[];
}

export function paintHex(e: RGB): string {
  const comp = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${comp(e[0])}${comp(e[1])}${comp(e[2])}`;
}

export function inkPaintOf(e: { ink?: RGB; inkPaint?: string }): string {
  return e.inkPaint ?? paintHex(e.ink ?? [0, 0, 0]);
}

export function spotPaintOf(e: { spot?: RGB; spotPaint?: string | null }): string {
  return e.spotPaint ?? paintHex(e.spot ?? [0, 0, 0]);
}

export function rgbPaint(e: RGB): string {
  return `rgb(${Math.round(e[0] * 255)}, ${Math.round(e[1] * 255)}, ${Math.round(e[2] * 255)})`;
}

export function glowGradient(
  e: GlowSpec,
  t: number,
): { cx: number; cy: number; r: number; stops: { offset: number; color: string }[] } {
  const n = t / 2;
  return {
    cx: n,
    cy: n,
    r: n,
    stops: [
      { offset: 0, color: rgbPaint(e.inner) },
      { offset: 0.42 + e.midT * 0.16, color: rgbPaint(e.mid) },
      { offset: 0.93, color: rgbPaint(e.rim) },
      { offset: 1, color: rgbPaint(e.rim) },
    ],
  };
}

// smoothstep local copy (re-implemented in several source places)
function colorSmoothstep(e: number, t: number, n: number): number {
  const r = Math.min(1, Math.max(0, (n - e) / (t - e)));
  return r * r * (3 - 2 * r);
}

export function mixColor(e: GlowSpec, t: number, n: number): RGB {
  const r = colorSmoothstep(0.12, t, n);
  const i = colorSmoothstep(t, 0.93, n);
  const a = 0.9 + 0.1 * Math.max(0, 1 - n * n) ** 0.225;
  const channel = (ch: 0 | 1 | 2): number => {
    const v = e.inner[ch] + (e.mid[ch] - e.inner[ch]) * r;
    return (v + (e.rim[ch] - v) * i) * a;
  };
  return [channel(0), channel(1), channel(2)];
}

export function gradientMatrix(e: Vec2, t: (p: Vec2) => string, n: number): string {
  return `matrix(${fmt2(e[0] * n)} 0 0 ${fmt2(e[1] * n)} ${t([0, 0])})`;
}

// ── Path assembly ──────────────────

export function buildPath(e: ClipSegment[], t: (p: Vec2) => string, n: number): string {
  let cur = e[e.length - 1].to;
  let d = `M${t(cur)}`;
  for (const seg of e) {
    d += seg.kind === "line" ? `L${t(seg.to)}` : arcSegment(cur, seg, t, n);
    cur = seg.to;
  }
  return `${d}Z`;
}

type ArcSegment = Extract<ClipSegment, { kind: "arc" }>;

export function arcSegment(
  e: Vec2,
  t: ArcSegment,
  toStr: (p: Vec2) => string,
  n: number,
): string {
  if (t.sweep === 0) return "";
  if (Math.abs(t.sweep) > ARC_SPLIT_THRESHOLD) {
    const half = t.sweep / 2;
    const mid = ellipsePoint(t.radii, Math.atan2(e[1], e[0]) + half);
    return (
      arcSegment(e, { ...t, to: mid, sweep: half }, toStr, n) +
      arcSegment(mid, { ...t, sweep: half }, toStr, n)
    );
  }
  return `A${fmt2(t.radii[0] * n)} ${fmt2(t.radii[1] * n)} 0 0 ${t.sweep > 0 ? 0 : 1} ${toStr(t.to)}`;
}

// ── Glow path (bh) ─────────────

export function glowPaths(
  e: GlowSpec,
  t: Vec2,
  toStr: (p: Vec2) => string,
  n: number,
): { body: GradientSpec; halo: { d: string; gradient: GradientSpec } | null } {
  const blend = 0.42 + 0.16 * e.midT;
  const bodyStops: GradientStop[] = [];
  for (let i = 0; i <= GLOW_STOPS; i++) {
    const offset = 1 - (1 - i / GLOW_STOPS) ** 2;
    bodyStops.push({ offset, color: paintHex(mixColor(e, blend, offset)), opacity: 1 });
  }
  const body: GradientSpec = { transform: gradientMatrix(t, toStr, n), focus: 0, stops: bodyStops };
  if (!(e.halo > 0)) return { body, halo: null };
  const haloStops: GradientStop[] = [];
  for (let i = 0; i <= HALO_STOPS; i++) {
    const dist = (HALO_REACH * i) / HALO_STOPS;
    const opacity = Math.min(1, e.halo * (1 - colorSmoothstep(0, HALO_REACH, dist)));
    haloStops.push({ offset: (1 + dist) / 1.055, color: paintHex(e.rim), opacity });
  }
  const haloRadii: Vec2 = [t[0] * 1.055, t[1] * 1.055];
  return {
    body,
    halo: {
      d: buildPath(ellipseTwoArcs(haloRadii, 1), toStr, n) + buildPath(ellipseTwoArcs(t, 1), toStr, n),
      gradient: { transform: gradientMatrix(haloRadii, toStr, n), focus: 0, stops: haloStops },
    },
  };
}

// ── Sphere sprite ──────────────

export interface SphereSprite {
  size: number;
  body: string;
  eyes: string;
  glow: { body: GradientSpec; halo: { d: string; gradient: GradientSpec } | null } | null;
}

export function buildSphereSprite(
  frame: MarkFrame,
  appearance: MarkAppearance,
  size: number,
  eyeFrames: EyeFrame[],
  flip: boolean[],
): SphereSprite {
  const i = (frame.zoom * size) / 2;
  const [a, o] = frame.squash;
  if (i === 0 || a === 0 || o === 0) return { size, body: "", eyes: "", glow: null };
  const s: Vec2 = [Math.abs(a), Math.abs(o)];
  const c = size / 2 + i * frame.offset[0];
  const l = size / 2 - i * (frame.squashAnchor * (1 - o) + frame.offset[1]);
  const toStr = (p: Vec2): string => `${fmt2(c + p[0] * i)} ${fmt2(l - p[1] * i)}`;
  const d = (paths: ClipSegment[][]): string =>
    paths.map((p) => buildPath(p, toStr, Math.abs(i))).join("");
  const f = renderEyes(frame, Math.abs(i), eyeFrames, flip);
  return {
    size,
    body: d(appearance.cutout ? mergeEyeArcs(s, f) : [ellipseTwoArcs(s, 1)]),
    eyes: appearance.cutout ? "" : d(f),
    glow: frame.glow === null ? null : glowPaths(frame.glow, s, toStr, Math.abs(i)),
  };
}

// nm ellipse-ring sampling local copy (avoids a reverse dependency)
function ellipseRing(center: Vec2, radii: Vec2, n: number): Vec2[] {
  const [r, i] = radii;
  return Array.from({ length: n }, (_v, k) => {
    const angle = (k / n) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scale = r === 0 || i === 0 ? 0 : 1 / Math.hypot(cos / r, sin / i);
    return [center[0] + cos * scale, center[1] + sin * scale];
  });
}

export function sphereGeometry(
  frame: MarkFrame,
  size: number,
  eyeFrames: EyeFrame[],
  flip: boolean[],
): { center: Vec2; radius: number; body: Vec2[]; eyes: Vec2[][] } {
  const n = (frame.zoom * size) / 2;
  const [r, i] = frame.squash;
  const center: Vec2 = [
    size / 2 + n * frame.offset[0],
    size / 2 - n * (frame.squashAnchor * (1 - i) + frame.offset[1]),
  ];
  const radius = Math.abs(n);
  const toScreen = (p: Vec2): Vec2 => [center[0] + p[0] * n, center[1] - p[1] * n];
  return {
    center,
    radius,
    body: ellipseRing(center, [Math.abs(r) * radius, Math.abs(i) * radius], SPHERE_RING_POINTS),
    eyes: renderEyes(frame, radius, eyeFrames, flip).map((e) => arcToPolyline(e).map(toScreen)),
  };
}

// ── SVG wrapping ────────────

function radialGradientNode(id: string, g: GradientSpec): SvgNode {
  return el(
    "radialGradient",
    {
      id,
      gradientUnits: "userSpaceOnUse",
      cx: 0,
      cy: 0,
      r: 1,
      fx: g.focus,
      fy: 0,
      gradientTransform: g.transform,
    },
    g.stops.map((s) => el("stop", { offset: s.offset, "stop-color": s.color, "stop-opacity": s.opacity })),
  );
}

export function sphereToSvg(
  sprite: SphereSprite,
  appearance: MarkAppearance,
  id = "grok-sphere",
  extent = sprite.size,
): SvgNode {
  const defs: SvgNode[] = [];
  const content: SvgNode[] = [];
  let fill = inkPaintOf(appearance);
  if (sprite.glow?.halo != null) {
    defs.push(radialGradientNode(`${id}-halo`, sprite.glow.halo.gradient));
    content.push(
      el("path", { d: sprite.glow.halo.d, fill: `url(#${id}-halo)`, "fill-rule": "evenodd" }),
    );
  }
  if (sprite.glow !== null) {
    fill = `url(#${id}-body)`;
    defs.push(radialGradientNode(`${id}-body`, sprite.glow.body));
  }
  content.push(el("path", { d: sprite.body, fill, "fill-rule": "evenodd" }));
  if (sprite.eyes !== "")
    content.push(el("path", { d: sprite.eyes, fill: spotPaintOf(appearance) }));
  return svgRoot(sprite.size, id, extent, [
    ...(defs.length > 0 ? [el("defs", {}, defs)] : []),
    ...content,
  ]);
}

export function sphereSpriteToSvgNode(
  sprite: SphereSprite,
  appearance: MarkAppearance,
  id = "grok-sphere",
  extent = sprite.size,
): SvgNode {
  return sphereToSvg(sprite, appearance, id, extent);
}

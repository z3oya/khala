/**
 * Clip loading / sampling / bridging.
 * Normalization: raw track names go through the TRACK_ALIAS mapping (scale→zoom happens here); expression-track
 * keyframes with v==='blink' expand into a 3-key envelope merged into lids; bridging uses wrapAngle for angle wrapping to build a 0.35s two-key track.
 */
import type { BodyId, Clip, ExpressionEvent, FaceName, Keyframe, RawClip, RawKeyframe } from "../types";
import { bezierSolve } from "./math/bezier";
import { BODY_VOCAB, RECIPE_BODY_ALIAS } from "../data/shapes.generated";
import { getRestEuler, normalizeFace } from "./faces";

export const DEFAULT_EASE: readonly [number, number, number, number] = [.42, 0, .58, 1];
// Bridge first-key ease / bridge duration / blink duration (used by blinkEnvelope)
export const BRIDGE_EASE: readonly [number, number, number, number] = [.4, 0, .2, 1];
export const BRIDGE_DURATION = 0.35;
export const BLINK_DURATION = 0.26;
export const BASE_ZOOM = 0.6;

// Track aliases (including scale→zoom, scl→squash)
export const TRACK_ALIAS = new Map<string, string>([
  ["position", "position"],
  ["rotation", "rotation"],
  ["squash", "squash"],
  ["scale", "zoom"],
  ["lids", "lids"],
  ["expression", "expression"],
  ["pos", "position"],
  ["rot", "rotation"],
  ["scl", "squash"],
  ["zoom", "zoom"],
  ["expr", "expression"],
]);

// Resting euler angles (degrees), derived from faces.getRestEuler on first read.
let restEulerCache: number[] | null = null;

/** Lazily-built singleton resting euler. */
export function restEuler(): number[] {
  if (restEulerCache == null) {
    const e = getRestEuler();
    restEulerCache = [e[0], e[1], e[2]];
  }
  return restEulerCache;
}

function isBodyId(e: string): e is BodyId {
  return BODY_VOCAB.some((t) => t === e);
}

// After alias lookup, anything outside the vocabulary falls back to sphere (arch→horseshoe is not in the vocabulary; keep source behavior, do NOT "fix" it)
export function resolveBodyId(e: string): BodyId {
  const t = RECIPE_BODY_ALIAS[e] ?? e;
  return isBodyId(t) ? t : "sphere";
}

export function isBezier4(e: readonly number[] | undefined): e is readonly [number, number, number, number] {
  return e != null && e.length === 4;
}

export function normalizeKeyframe({ t, v, ease }: RawKeyframe): Keyframe {
  return { t, v: typeof v === "string" ? [] : v, ease: isBezier4(ease) ? ease : DEFAULT_EASE };
}

// [0,1,0] three-key envelope at [t, t+0.26*.45, t+0.26]
export function blinkEnvelope(e: number): Keyframe[] {
  return [
    { t: e, v: [0], ease: DEFAULT_EASE },
    { t: e + BLINK_DURATION * 0.45, v: [1], ease: DEFAULT_EASE },
    { t: e + BLINK_DURATION, v: [0], ease: DEFAULT_EASE },
  ];
}

export function normalizeInspect(e: RawClip): { bias?: number; isFollowingTurn?: boolean } {
  const t = e.inspect?.bias;
  return {
    bias: t !== undefined && Number.isFinite(t) ? Math.min(1, Math.max(-1, t)) : undefined,
    isFollowingTurn: e.inspect?.follow,
  };
}

// RawClip → Clip
export function normalizeClip(e: RawClip): Clip {
  const t = new Map<string, RawKeyframe[]>();
  for (const [n, r] of Object.entries(e.tracks)) {
    const alias = TRACK_ALIAS.get(n);
    if (alias !== undefined) t.set(alias, r);
  }
  const track = (name: string) => (t.get(name) ?? []).map(normalizeKeyframe);
  const lids = track("lids");
  const expression: ExpressionEvent[] = [];
  let hasBlink = false;
  for (const ev of t.get("expression") ?? []) {
    if (ev.v === "blink") {
      hasBlink = true;
      lids.push(...blinkEnvelope(ev.t));
    } else {
      expression.push({
        t: ev.t,
        name: typeof ev.v === "string" ? normalizeFace(ev.v) : "neutral",
        isThroughBlink: ev.cut === false,
      });
    }
  }
  if (hasBlink) lids.sort((a, b) => a.t - b.t);
  return {
    name: e.name ?? "",
    duration: e.duration,
    body: resolveBodyId(e.body ?? "sphere"),
    squashAnchor: e.squashAnchor ?? 0,
    restTime: e.workArea ? e.workArea.start : 0,
    inspect: normalizeInspect(e),
    position: track("position"),
    rotation: track("rotation"),
    squash: track("squash"),
    zoom: track("zoom"),
    lids,
    expression,
  };
}

export function sampleTrack(e: readonly Keyframe[], t: number): number[] | null {
  if (e.length === 0) return null;
  if (t <= e[0].t) return e[0].v;
  const n = e[e.length - 1];
  if (t >= n.t) return n.v;
  let r = 0;
  for (; r < e.length - 2 && e[r + 1].t <= t; ) r++;
  const i = e[r];
  const a = e[r + 1];
  const o = bezierSolve((t - i.t) / Math.max(a.t - i.t, 1e-9), i.ease);
  return i.v.map((v, k) => v + (a.v[k] - v) * o);
}

/** Anonymous pose snapshot returned by SRC Ra (shape shared by Va/Ha/oe). */
export interface PoseSnapshot {
  rot: number[];
  pos: number[];
  scl: number[];
  zoom: number;
  lids: number;
  expr: FaceName;
  squashAnchor: number;
}

export function restPose(e: Clip): PoseSnapshot {
  const t = e.restTime;
  const n = sampleTrack(e.rotation, t);
  const r = sampleTrack(e.position, t);
  const i = sampleTrack(e.squash, t);
  const a = sampleTrack(e.zoom, t);
  const o = sampleTrack(e.lids, t);
  let s: FaceName = "neutral";
  let c = false;
  for (const ev of e.expression) {
    if (!c) {
      s = ev.name;
      c = true;
    }
    if (ev.t <= t + 1e-9) s = ev.name;
  }
  return {
    rot: n ? [n[0], n[1], n[2]] : [0, 0, 0],
    pos: r ? [r[0], r[1]] : [0, 0],
    scl: i ? [i[0], i[1]] : [1, 1],
    zoom: a ? a[0] : BASE_ZOOM,
    lids: o ? Math.min(1, Math.max(0, o[0])) : 0,
    expr: s,
    squashAnchor: e.squashAnchor,
  };
}

// Nearest wrap: e + 360·round((t−e)/360)
export function wrapAngle(e: number, t: number): number {
  return e + 360 * Math.round((t - e) / 360);
}

// Absolute angle difference (0..180)
export function angleDelta(e: number, t: number): number {
  return Math.abs((((e - t) % 360) + 540) % 360 - 180);
}

export function poseMatches(e: PoseSnapshot, t: PoseSnapshot): boolean {
  return (
    angleDelta(e.rot[0], t.rot[0]) < 4 &&
    angleDelta(e.rot[1], t.rot[1]) < 4 &&
    angleDelta(e.rot[2], t.rot[2]) < 4 &&
    Math.abs(e.pos[0] - t.pos[0]) < 0.015 &&
    Math.abs(e.pos[1] - t.pos[1]) < 0.015 &&
    Math.abs(e.scl[0] - t.scl[0]) < 0.02 &&
    Math.abs(e.scl[1] - t.scl[1]) < 0.02 &&
    Math.abs(e.zoom - t.zoom) < 0.02 &&
    Math.abs(e.lids - t.lids) < 0.05
  );
}

export function makeBridge(e: PoseSnapshot, t: PoseSnapshot): Clip {
  const bridge = (from: number[], to: number[]): Keyframe[] => [
    { t: 0, v: from, ease: BRIDGE_EASE },
    { t: BRIDGE_DURATION, v: to, ease: DEFAULT_EASE },
  ];
  const r = [wrapAngle(t.rot[0], e.rot[0]), wrapAngle(t.rot[1], e.rot[1]), wrapAngle(t.rot[2], e.rot[2])];
  return {
    ...DEFAULT_CLIP_TEMPLATE,
    duration: BRIDGE_DURATION,
    squashAnchor: e.squashAnchor,
    position: bridge(e.pos, t.pos),
    rotation: bridge(e.rot, r),
    squash: bridge(e.scl, t.scl),
    zoom: bridge([e.zoom], [t.zoom]),
    lids: e.lids === 0 && t.lids === 0 ? [] : bridge([e.lids], [t.lids]),
  };
}

// The source has no name field; types.ts requires name, so an empty-string placeholder (source consumers never read clip.name)
export const DEFAULT_CLIP_TEMPLATE: Clip = {
  name: "",
  duration: 10,
  body: null,
  squashAnchor: 0,
  restTime: 0,
  inspect: {},
  position: [],
  rotation: [],
  squash: [],
  zoom: [],
  lids: [],
  expression: [],
};

// Rest clip: rotation[0].v lazily takes restEuler()
export const REST_CLIP: Clip = {
  ...DEFAULT_CLIP_TEMPLATE,
  rotation: [{ t: 0, get v() { return restEuler(); }, ease: DEFAULT_EASE }],
};

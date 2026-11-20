/**
 * Eye model layer (path primitives + transforms/metrics). Units = eye-local coordinates; see ../types for the EyeShape contract.
 */
import type { EyeShape, Vec2 } from "../types";

// Stroke half-width of arc expressions (happy/confused)
export const STROKE_WID = 0.1305;
// Baseline capsule width parameter (first parameter of neutral/sad/squinted; sleepy takes half)
export const NEUTRAL_WID = 0.26;
// 3-segment cubic bezier path floats (6 floats per segment)
export const PATH_FLOATS = 18;

// lidY lower bound while blinking
const LID_MIN = 0.03;
// Closed-eye squash target aspect ratio
const SQUASH_RATIO = 0.42;
// Normalized scale of inspect following turn (turn/Ei clamped ±1)
const INSPECT_TURN_SCALE = 20;

/** The three control-point inputs of buildEyePath. */
export interface EyePathSpec {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  isArc: boolean;
}

// ── Path primitives ────────────────────────────────────

// Anchor of segment seg
export function anchorAt(path: readonly number[], seg: number): [number, number] {
  return [path[seg * 6], path[seg * 6 + 1]];
}

// Control point of segment seg (isOut=true out-handle / false in-handle), returns absolute coordinates
export function handleAt(path: readonly number[], seg: number, isOut: boolean): [number, number] {
  const r = isOut ? 4 : 2;
  return [path[seg * 6] + path[seg * 6 + r], path[seg * 6 + 1] + path[seg * 6 + r + 1]];
}

// Sampling: 11 points per segment (step 1/10), the second segment starts at 1 skipping the duplicate endpoint → 11+10=21-point polyline
export function samplePath(path: readonly number[]): [number, number][] {
  const pts: [number, number][] = [];
  const seg = (p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, from: number) => {
    for (let o = from; o < 11; o++) {
      const t = o / 10;
      const s = 1 - t;
      const c = s * s * s;
      const l = 3 * s * s * t;
      const u = 3 * s * t * t;
      const d = t * t * t;
      pts.push([
        c * p0[0] + l * c1[0] + u * c2[0] + d * p1[0],
        c * p0[1] + l * c1[1] + u * c2[1] + d * p1[1],
      ]);
    }
  };
  seg(anchorAt(path, 0), handleAt(path, 0, true), handleAt(path, 1, false), anchorAt(path, 1), 0);
  seg(anchorAt(path, 1), handleAt(path, 1, true), handleAt(path, 2, false), anchorAt(path, 2), 1);
  return pts;
}

// Three control points → 3-segment bezier 18 floats;
// isArc uses the circumscribed circle (K=4/3·tan(θ/4)·r, θ=segment angle), degenerate (collinear) lands in the chord-midpoint branch; otherwise midpoint method
export function buildEyePath({ p0: e, p1: t, p2: n, isArc: r }: EyePathSpec): number[] {
  const [i, a] = e;
  const [o, s] = t;
  const [c, l] = n;
  const u = new Array<number>(PATH_FLOATS).fill(0);
  const setAnchor = (seg: number, pt: readonly number[]) => {
    u[seg * 6] = pt[0];
    u[seg * 6 + 1] = pt[1];
  };
  const setIn = (seg: number, pt: readonly number[]) => {
    u[seg * 6 + 2] = pt[0] - u[seg * 6];
    u[seg * 6 + 3] = pt[1] - u[seg * 6 + 1];
  };
  const setOut = (seg: number, pt: readonly number[]) => {
    u[seg * 6 + 4] = pt[0] - u[seg * 6];
    u[seg * 6 + 5] = pt[1] - u[seg * 6 + 1];
  };
  if (r) {
    const det = 2 * (i * (s - l) + o * (l - a) + c * (a - s));
    if (Math.abs(det) > 1e-9) {
      const q0 = i * i + a * a;
      const q1 = o * o + s * s;
      const q2 = c * c + l * l;
      const mx = (q0 * (s - l) + q1 * (l - a) + q2 * (a - s)) / det;
      const my = (q0 * (c - o) + q1 * (i - c) + q2 * (o - i)) / det;
      const radius = Math.hypot(i - mx, a - my);
      const ang0 = Math.atan2(a - my, i - mx);
      const ang2 = Math.atan2(l - my, c - mx);
      const ang1 = Math.atan2(s - my, o - mx);
      const TAU = Math.PI * 2;
      const sweepPos = (ang2 - ang0 + TAU) % TAU;
      const sweep = (ang1 - ang0 + TAU) % TAU <= sweepPos ? sweepPos : sweepPos - TAU;
      const ptAt = (ang: number): [number, number] => [mx + radius * Math.cos(ang), my + radius * Math.sin(ang)];
      const tanAt = (ang: number): [number, number] => [-Math.sin(ang), Math.cos(ang)];
      const half = sweep / 2;
      const K = ((4 / 3) * Math.tan(half / 4)) * radius;
      const angles = [ang0, ang0 + half, ang0 + sweep];
      for (let seg = 0; seg < 3; seg++) {
        const anchor = ptAt(angles[seg]);
        const tan = tanAt(angles[seg]);
        setAnchor(seg, anchor);
        if (seg > 0) setIn(seg, [anchor[0] - K * tan[0], anchor[1] - K * tan[1]]);
        if (seg < 2) setOut(seg, [anchor[0] + K * tan[0], anchor[1] + K * tan[1]]);
      }
      return u;
    }
    const mid: [number, number] = [(i + c) / 2, (a + l) / 2];
    setAnchor(0, [i, a]);
    setAnchor(1, mid);
    setAnchor(2, [c, l]);
    setOut(0, [i + (mid[0] - i) / 3, a + (mid[1] - a) / 3]);
    setIn(1, [mid[0] - (mid[0] - i) / 3, mid[1] - (mid[1] - a) / 3]);
    setOut(1, [mid[0] + (c - mid[0]) / 3, mid[1] + (l - mid[1]) / 3]);
    setIn(2, [c - (c - mid[0]) / 3, l - (l - mid[1]) / 3]);
    return u;
  }
  const m: [number, number] = [(i + o) / 2, (a + s) / 2];
  const h: [number, number] = [(o + c) / 2, (s + l) / 2];
  const g: [number, number] = [(m[0] + h[0]) / 2, (m[1] + h[1]) / 2];
  setAnchor(0, [i, a]);
  setAnchor(1, g);
  setAnchor(2, [c, l]);
  setOut(0, [i + (2 / 3) * (m[0] - i), a + (2 / 3) * (m[1] - a)]);
  setIn(1, [g[0] + (2 / 3) * (m[0] - g[0]), g[1] + (2 / 3) * (m[1] - g[1])]);
  setOut(1, [g[0] + (2 / 3) * (h[0] - g[0]), g[1] + (2 / 3) * (h[1] - g[1])]);
  setIn(2, [c + (2 / 3) * (h[0] - c), l + (2 / 3) * (h[1] - l)]);
  return u;
}

// Arbitrary three-control-point path eye
export function makeEye(off: Vec2, tilt: number, wid: number, spec: EyePathSpec, oval: Vec2): EyeShape {
  const path = buildEyePath(spec);
  return { off, tilt, wid, lidY: 1, oval, ovalMix: 0, pts: samplePath(path), path, fillRing: null };
}

// Capsule: wid=width/2, axis half-length=(total length−width)/2, angle measured from vertical (degrees, internally ×π/180)
export function capsule(width: number, totalLen: number, angleDeg: number, off: Vec2, tilt: number): EyeShape {
  const axisHalf = Math.max(0, (totalLen - width) / 2);
  const ang = (angleDeg * Math.PI) / 180;
  const sx = Math.sin(ang) * axisHalf;
  const sy = Math.cos(ang) * axisHalf;
  return makeEye(off, tilt, width / 2, { p0: [-sx, -sy], p1: [0, 0], p2: [sx, sy], isArc: false }, [0, 0]);
}

// Capsule (x-offset variant): off=[offX,0], tilt=0
export function capsuleX(width: number, totalLen: number, angleDeg: number, offX: number): EyeShape {
  return capsule(width, totalLen, angleDeg, [offX, 0], 0);
}

// Ellipse eye: oval=[a,b], wid=b
export function ovalEye(a: number, b: number, offX: number): EyeShape {
  const spec: EyePathSpec = { p0: [-a, 0], p1: [0, 0], p2: [a, 0], isArc: false };
  return makeEye([offX, 0], 0, b, spec, [a, b]);
}

// Both eyes isomorphic
export function bothEyes(e: EyeShape): EyeShape[] {
  return [e, e];
}

// inspecting preset (asymmetric eyes: circle r=.27 / r=.18, both shifted right .04)
export const INSPECTING_PRESET: EyeShape[] = [capsuleX(0.54, 0.54, 0, 0.04), capsuleX(0.36, 0.36, 0, 0.04)];

// ── Transforms and metrics ──────────────────────────

// Both eyes mapped per-eye (with index)
export function pairMap(eyes: readonly EyeShape[], fn: (e: EyeShape, i: number) => EyeShape): EyeShape[] {
  return [fn(eyes[0], 0), fn(eyes[1], 1)];
}

// ovalMix reset to zero
export function resetOval(e: EyeShape): EyeShape {
  return { ...e, ovalMix: 0 };
}

// Blink closed phase: eye shrinks to invisible
export function collapseEye(e: EyeShape): EyeShape {
  return { ...e, wid: 0, oval: [0, 0] };
}

export function isOvalEye(e: EyeShape): boolean {
  return e.oval[0] > 1e-4 && e.oval[1] > 1e-4;
}

// Polyline deviating from the chord by > max(.012, wid·.2) counts as a "closed shape" (basis of the spine path)
export function isClosedShape(e: EyeShape): boolean {
  if (isOvalEye(e) || e.pts.length < 3) return false;
  const first = e.pts[0];
  const last = e.pts[e.pts.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return false;
  let maxDev = 0;
  for (const pt of e.pts) {
    const s = ((pt[0] - first[0]) * dx + (pt[1] - first[1]) * dy) / len2;
    const px = first[0] + s * dx;
    const py = first[1] + s * dy;
    const dev = Math.hypot(pt[0] - px, pt[1] - py);
    if (dev > maxDev) maxDev = dev;
  }
  return maxDev > Math.max(0.012, e.wid * 0.2);
}

export function lerpNum(e: number, t: number, n: number): number {
  return e + (t - e) * n;
}

export function lerpVec(e: Vec2, t: Vec2, n: number): [number, number] {
  return [lerpNum(e[0], t[0], n), lerpNum(e[1], t[1], n)];
}

// Polyline resampled by index (count evenly divided)
export function resamplePts(pts: readonly Vec2[], idx: number, count: number): Vec2 {
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1 || count <= 1) return pts[0];
  const r = (idx / (count - 1)) * (pts.length - 1);
  const i = Math.min(Math.floor(r), pts.length - 2);
  return lerpVec(pts[i], pts[i + 1], r - i);
}

// spine blending: path interpolated per float (same length) or polyline resampled interpolation
export function blendSpine(e: EyeShape, t: EyeShape, n: number): EyeShape {
  const base = {
    off: lerpVec(e.off, t.off, n),
    tilt: lerpNum(e.tilt, t.tilt, n),
    wid: lerpNum(e.wid, t.wid, n),
    lidY: lerpNum(e.lidY, t.lidY, n),
    oval: lerpVec(e.oval, t.oval, n),
    ovalMix: 0,
    fillRing: null,
  };
  if (e.path && t.path && e.path.length === t.path.length) {
    const tp = t.path;
    const path = e.path.map((v, i) => lerpNum(v, tp[i], n));
    return { ...base, path, pts: samplePath(path) };
  }
  const count = Math.max(e.pts.length, t.pts.length, 2);
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    pts.push(lerpVec(resamplePts(e.pts, i, count), resamplePts(t.pts, i, count), n));
  }
  return { ...base, path: null, pts };
}

/** Capsule approximation. */
export interface EyeApprox {
  cx: number;
  cy: number;
  ang: number;
  halfLen: number;
  halfW: number;
}

// Ellipse eyes take the oval axis; polyline eyes take the endpoint chord + wid
export function capsuleApprox(e: EyeShape): EyeApprox {
  if (isOvalEye(e)) {
    const [a, b] = e.oval;
    return { cx: e.off[0], cy: e.off[1], ang: a >= b ? Math.PI / 2 : 0, halfLen: Math.max(a, b), halfW: Math.min(a, b) };
  }
  const wid = e.wid;
  if (e.pts.length < 2) return { cx: e.off[0], cy: e.off[1], ang: e.tilt, halfLen: wid, halfW: wid };
  const first = e.pts[0];
  const last = e.pts[e.pts.length - 1];
  return {
    cx: e.off[0] + (first[0] + last[0]) / 2,
    cy: e.off[1] + (first[1] + last[1]) / 2,
    ang: Math.atan2(last[0] - first[0], last[1] - first[1]) + e.tilt,
    halfLen: Math.hypot(last[0] - first[0], last[1] - first[1]) / 2 + wid,
    halfW: wid,
  };
}

// Angle difference normalized to ±90°
export function angleDelta(e: EyeApprox, t: EyeApprox): number {
  let n = t.ang - e.ang;
  while (n > Math.PI / 2) n -= Math.PI;
  while (n < -Math.PI / 2) n += Math.PI;
  return n;
}

// Stadium ring 48 points: SDF ring between capsule ↔ rounded rectangle
export function stadiumRing(halfLen: number, halfW: number, mix: number): [number, number][] {
  const axis = Math.max(0, halfLen - halfW);
  const m = Math.max(0, Math.min(1, mix));
  const ring: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const th = (i / 48) * Math.PI * 2;
    const s = Math.cos(th);
    const c = Math.sin(th);
    const px = halfW * s; // capsule boundary x (l=t·s)
    const py = halfLen * c; // capsule boundary y (u=e·c)
    const d = halfW / Math.max(Math.abs(s), 1e-6); // rounded-rectangle boundary radial distance
    let f: number;
    if (d * Math.abs(c) <= axis + 1e-6 && Number.isFinite(d)) f = d;
    else {
      const e = (c >= 0 ? 1 : -1) * axis * c;
      const disc = Math.max(0, e * e - axis * axis + halfW * halfW);
      f = e + Math.sqrt(disc);
    }
    const rx = f * s;
    const ry = f * c;
    ring.push([px + (rx - px) * m, py + (ry - py) * m]);
  }
  return ring;
}

// Construct the elliptical baseline eye in capsule form (angle 0, tilt carries the orientation)
export function toOval(width: number, len: number, tilt: number, off: Vec2): EyeShape {
  return capsule(Math.max(width, 1e-4), Math.max(len, width), 0, off, tilt);
}

// oval path blending: target stadiumized, ovalMix cubic in/out (in 1−(1−n)³ / out n³)
export function blendOval(e: EyeShape, t: EyeShape, n: number): EyeShape {
  if (n <= 1e-4) return resetOval(e);
  if (n >= 0.995) return resetOval(t);
  const from = capsuleApprox(e);
  const to = capsuleApprox(t);
  const dAng = angleDelta(from, to);
  const targetOval = isOvalEye(t);
  const s = targetOval ? 1 - (1 - n) ** 3 : n * n * n;
  const ang = from.ang + dAng * n;
  const halfLen = Math.max(from.halfLen + (to.halfLen - from.halfLen) * n, 1e-4);
  const halfW = Math.max(from.halfW + (to.halfW - from.halfW) * n, 1e-4);
  const d = +!!isOvalEye(e);
  const f = d + ((+!!targetOval - d) * s);
  const eye = toOval(2 * halfW, 2 * halfLen, ang, [from.cx + (to.cx - from.cx) * n, from.cy + (to.cy - from.cy) * n]);
  const useOval = f > 1e-4;
  return {
    ...eye,
    oval: useOval ? [halfW, halfLen] : eye.oval,
    ovalMix: useOval ? f : 0,
    fillRing: stadiumRing(halfLen, halfW, f),
  };
}

// stadium path blending: rebuild capsule(2·halfW, 2·(axis+halfW)) from the capsule approximation
export function blendStadium(e: EyeShape, t: EyeShape, n: number): EyeShape {
  if (n >= 0.9999) return resetOval(t);
  const from = capsuleApprox(e);
  const to = capsuleApprox(t);
  const ang = from.ang + angleDelta(from, to) * n;
  const halfW = Math.max(1e-4, from.halfW + (to.halfW - from.halfW) * n);
  const axis = Math.max(0, from.halfLen - from.halfW) * (1 - n) + Math.max(0, to.halfLen - to.halfW) * n;
  const off: [number, number] = [from.cx + (to.cx - from.cx) * n, from.cy + (to.cy - from.cy) * n];
  return capsule(2 * halfW, 2 * (axis + halfW), (ang * 180) / Math.PI, off, 0);
}

/** Oriented bounding box parameters. */
export interface EyeBounds {
  width: number;
  height: number;
  tilt: number;
  cx: number;
  cy: number;
}

export function boundsOf(e: EyeShape): EyeBounds | null {
  const oval = isOvalEye(e);
  if (!(e.wid > 0) && !oval) return null;
  const lid = e.lidY;
  const tiltDeg = e.tilt * (180 / Math.PI);
  if (oval) return { width: 2 * e.oval[0], height: 2 * e.oval[1] * lid, tilt: tiltDeg, cx: e.off[0], cy: e.off[1] };
  if (e.pts.length < 2) return null;
  const first = e.pts[0];
  const last = e.pts[e.pts.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const len = Math.hypot(dx, dy);
  const w = 2 * e.wid;
  return {
    width: w,
    height: (len + w) * lid,
    tilt: (180 / Math.PI) * Math.atan2(dx, dy) + tiltDeg,
    cx: e.off[0] + (first[0] + last[0]) / 2,
    cy: e.off[1] + ((first[1] + last[1]) / 2) * lid,
  };
}

/** Axis-aligned bounding box. */
export interface EyeBox {
  w: number;
  h: number;
  cx: number;
  cy: number;
}

// Degenerate fallback {w:ri, h:.57} (.57 = neutral capsule total length, source literal)
export function boundsBox(e: EyeShape): EyeBox {
  const b = boundsOf(e);
  if (b == null) return { w: NEUTRAL_WID, h: 0.57, cx: e.off[0], cy: e.off[1] };
  const rad = b.tilt * (Math.PI / 180);
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  return { w: b.width * cosA + b.height * sinA, h: b.width * sinA + b.height * cosA, cx: b.cx, cy: b.cy };
}

// Build vertical/horizontal ellipse eyes from the bounding box (h≥w vertical 0°, else horizontal 90°)
export function makeOvalAt(w: number, h: number, cx: number, cy: number): EyeShape {
  return h >= w ? toOval(w, h, 0, [cx, cy]) : toOval(h, w, Math.PI / 2, [cx, cy]);
}

// Squash to a horizontal ellipse (SQUASH_RATIO)
export function widenToOval(e: EyeShape, n: number): EyeShape {
  if (n <= 0) return e;
  const m = Math.min(1, n);
  const box = boundsBox(e);
  const w = Math.max(box.w, 1e-4);
  const h = Math.max(box.h, w);
  return makeOvalAt(w, h + (w * SQUASH_RATIO - h) * m, box.cx, box.cy);
}

// Eyelid anchor: bottom raised by 40% height
export function lidAnchor(e: EyeShape): number {
  let lo: number;
  let hi: number;
  if (isOvalEye(e)) {
    lo = -e.oval[1];
    hi = e.oval[1];
  } else {
    let minY = 1e9;
    let maxY = -1e9;
    for (const pt of e.pts) {
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
    lo = minY - e.wid;
    hi = maxY + e.wid;
  }
  return lo + 0.4 * (hi - lo);
}

// Vertical spine polyline straightened (spine tilt folded into tilt, pts rotated)
export function alignVertical(e: EyeShape): EyeShape {
  if (e.pts.length < 2) return e;
  const first = e.pts[0];
  const last = e.pts[e.pts.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  if (Math.abs(dy) < Math.abs(dx)) return e;
  const ang = Math.atan2(dx, dy);
  if (Math.abs(ang) < 1e-5) return e;
  const cosA = Math.cos(ang);
  const sinA = Math.sin(ang);
  return {
    ...e,
    tilt: e.tilt + ang,
    pts: e.pts.map((p): [number, number] => [p[0] * cosA - p[1] * sinA, p[0] * sinA + p[1] * cosA]),
  };
}

// Blink press-down: lidY contracts and shifts along the eye axis
export function lidDrop(e: EyeShape, t: number): EyeShape {
  if (t === 0) return e;
  const n = alignVertical(e);
  const lid = Math.max(LID_MIN, 1 - t);
  const drop = lidAnchor(n) * (1 - lid);
  const cosA = Math.cos(-n.tilt);
  const sinA = Math.sin(-n.tilt);
  return { ...n, off: [n.off[0] - sinA * drop, n.off[1] + cosA * drop], lidY: n.lidY * lid };
}

// inspect asymmetric both-eye scaling (spec §4.5)
export function inspectScale(
  eyes: EyeShape[],
  weight: number,
  inspect: { bias?: number; isFollowingTurn?: boolean },
  turn: number,
): EyeShape[] {
  if (weight < 0.001) return eyes;
  // The source reads n.bias directly in the non-following branch (when absent l=NaN, consistent with SRC runtime; the caller must supply bias)
  const bias = inspect.isFollowingTurn ? Math.min(1, Math.max(-1, turn / INSPECT_TURN_SCALE)) : inspect.bias!;
  const [a, o] = INSPECTING_PRESET;
  const s = Math.max(1e-4, a.wid);
  const c = Math.max(1e-4, o.wid);
  const l = (1 + bias) / 2;
  const scaled = (e: EyeShape, n: number): EyeShape => {
    const r = 1 + (n - 1) * weight;
    return { ...resetOval(e), wid: e.wid * r, pts: e.pts.map((p): [number, number] => [p[0] * r, p[1] * r]) };
  };
  return [scaled(eyes[0], (c / s) ** +l), scaled(eyes[1], (s / c) ** +l)];
}

// inspecting test → 0/1 (for arithmetic)
export function isInspectingFlag(name: string): number {
  return +(name === "inspecting");
}

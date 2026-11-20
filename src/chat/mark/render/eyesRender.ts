/**
 * Eye rendering — SDF outline extraction (marching squares) + spherical mapping + hemisphere/squash clipping.
 * Eye anchor frames and flip flags are passed in by the caller; only the renderMarkEyesForSphere convenience wrapper imports faces.
 */
import type { EyeShape, MarkFrame, Mat3, Vec2, Vec3 } from "../types";
import { mat3MulVec, quatToMat3 } from "../engine/math/quat";
import { getEyeFlip, getEyeFrames } from "../engine/faces";
// vh is reverse-imported by spherePath; both directions are call-time references with no top-level evaluation dependency
import { buildPath } from "./spherePath";
import { fmt2 } from "./svgTree";

/** Per-eye ortho cutting-plane frame (M=eye-center direction, T/C=cut-plane basis); structurally compatible with engine/faces.ts EyeFrame. */
export interface EyeFrame {
  M: Vec3;
  T: Vec3;
  C: Vec3;
}

// ── Convenience wrapper (the only direct faces import in this file) ──────────

export function renderMarkEyesForSphere(frame: MarkFrame, size: number): string {
  const i = (frame.zoom * size) / 2;
  const [a, o] = frame.squash;
  if (i === 0 || a === 0 || o === 0) return "";
  const c = size / 2 + i * frame.offset[0];
  const l = size / 2 - i * (frame.squashAnchor * (1 - o) + frame.offset[1]);
  const toStr = (p: Vec2): string => `${fmt2(c + p[0] * i)} ${fmt2(l - p[1] * i)}`;
  return renderEyes(frame, Math.abs(i), getEyeFrames(), getEyeFlip())
    .map((path) => buildPath(path, toStr, Math.abs(i)))
    .join("");
}

/** Clip path segments (output of the Sm/Cm/wm family). */
export type ClipSegment =
  | { kind: "line"; to: Vec2 }
  | { kind: "arc"; to: Vec2; radii: Vec2; sweep: number };

const OUTLINE_TOL_BASE = 0.02; // base tolerance, refined by 2^LOD
const LOD_MAX_LEVEL = 16;
const GRID_STEP_MAX = 0.015;
const GRID_SPAN_DIV = 400;
const OUTLINE_CACHE_MAX = 512;
const SEG_STRIDE = 5; // polyline segment packed floats: x,y,dx,dy,1/len²

const NEWTON_ITER = 60;
const RAY_STEPS = 256;
const SUBDIV_DEPTH = 24;
const POINT_CAP = 2e4;
const GRADIENT_MIN_DOT = 0.2;

const ARC_POLYLINE_STEP = Math.PI / 48;

export const eyeOutlineCache = new Map<string, Vec2[][]>();

// ── Eye SDF ─────────────────────────────────────────────

/** Eye SDF input data (product of `qm`; segments are 5-float-packed polyline segments). */
export interface EyeSdfData {
  segments: Float64Array;
  halfWidth: number;
  rx: number;
  ry: number;
  ellipseMix: number;
}

export function eyeSdfData(e: EyeShape): EyeSdfData {
  const [t, n] = e.oval;
  const r =
    t > 1e-5 && n > 1e-5
      ? e.ovalMix > 1e-4
        ? Math.min(1, e.ovalMix)
        : ovalSmoothstep(0, 0.08, Math.min(t, n))
      : 0;
  const i = Math.max(0, e.pts.length - 1);
  const a = new Float64Array(i * SEG_STRIDE);
  for (let t2 = 0; t2 < i; t2++) {
    const [n2, r2] = e.pts[t2];
    const i2 = e.pts[t2 + 1][0] - n2;
    const o = e.pts[t2 + 1][1] - r2;
    const s = i2 * i2 + o * o;
    a.set([n2, r2, i2, o, s > 0 ? 1 / s : 0], t2 * SEG_STRIDE);
  }
  return { segments: a, halfWidth: e.wid > 0 ? e.wid : -1, rx: t, ry: n, ellipseMix: r };
}

// smoothstep local copy (re-implemented in several source places)
function ovalSmoothstep(e: number, t: number, n: number): number {
  const r = Math.min(1, Math.max(0, (n - e) / (t - e)));
  return r * r * (3 - 2 * r);
}

export function eyeSdf(e: EyeSdfData, t: number, n: number): number {
  const r = distToSegments(e.segments, t, n) - e.halfWidth;
  if (e.ellipseMix === 0) return r;
  const i = t / e.rx;
  const a = n / e.ry;
  const o = (Math.sqrt(i * i + a * a) - 1) * Math.min(e.rx, e.ry);
  return r * (1 - e.ellipseMix) + o * e.ellipseMix;
}

export function distToSegments(e: Float64Array, t: number, n: number): number {
  let r = 1e6;
  for (let i = 0; i < e.length; i += SEG_STRIDE) {
    const a = t - e[i];
    const o = n - e[i + 1];
    const s = e[i + 2];
    const c = e[i + 3];
    const l = (a * s + o * c) * e[i + 4];
    const u = l < 0 ? 0 : l > 1 ? 1 : l;
    const d = a - s * u;
    const f = o - c * u;
    const p = d * d + f * f;
    if (p < r) r = p;
  }
  return Math.sqrt(r);
}

// ── marching squares (iso-contour + quadratic bezier fit + DP simplification) ──

/** Sampling grid (the grid parameter of `sd`). */
export interface MarchGrid {
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
}

interface MarchState {
  field: (x: number, y: number) => number;
  tolerance: { deviation: number; edge: number };
  root: number;
  reach: number;
}

export function marchingSquares(
  field: (x: number, y: number) => number,
  grid: MarchGrid,
  tolerance: { deviation: number; edge: number },
): Vec2[][] {
  const state: MarchState = {
    field,
    tolerance,
    root: tolerance.deviation * 0.001,
    reach: grid.step * Math.hypot(grid.nx, grid.ny),
  };
  const outlines: Vec2[][] = [];
  for (const ring of gridLink(state, grid)) {
    const simplified = simplifyRing(dedupRing(state, ring), tolerance);
    if (simplified.length >= 3) outlines.push(simplified);
  }
  return outlines;
}

function gridLink(state: MarchState, grid: MarchGrid): Vec2[][] {
  const { field } = state;
  const { x0, y0, step, nx, ny } = grid;
  const rowStride = nx + 1;
  const vals = new Float64Array(rowStride * (ny + 1));
  for (let row = 0; row <= ny; row++)
    for (let col = 0; col <= nx; col++)
      vals[row * rowStride + col] = field(x0 + col * step, y0 + row * step);
  const edgeCount = 2 * rowStride * (ny + 1);
  const next = new Int32Array(edgeCount).fill(-1);
  const crossingCache = new Map<number, Vec2>();
  const edgePoint = (edge: number): Vec2 => {
    const cached = crossingCache.get(edge);
    if (cached !== undefined) return cached;
    const from = edge >> 1;
    const to = (edge & 1) !== 0 ? from + rowStride : from + 1;
    const ax = x0 + (from % rowStride) * step;
    const ay = y0 + Math.floor(from / rowStride) * step;
    const bx = x0 + (to % rowStride) * step;
    const by = y0 + Math.floor(to / rowStride) * step;
    const h = newtonRoot(state, ax, ay, vals[from], bx, by, vals[to]);
    const pt: Vec2 = [ax + (bx - ax) * h, ay + (by - ay) * h];
    crossingCache.set(edge, pt);
    return pt;
  };
  const cornerNodes = [0, 0, 0, 0];
  const cornerEdges = [0, 0, 0, 0];
  const hitEdges = [0, 0, 0, 0];
  const hitNeg = [false, false, false, false];
  for (let row = 0; row < ny; row++)
    for (let col = 0; col < nx; col++) {
      const node = row * rowStride + col;
      if (
        vals[node] < 0
          ? vals[node + 1] < 0 && vals[node + 1 + rowStride] < 0 && vals[node + rowStride] < 0
          : vals[node + 1] >= 0 && vals[node + 1 + rowStride] >= 0 && vals[node + rowStride] >= 0
      )
        continue;
      cornerNodes[0] = node;
      cornerNodes[1] = node + 1;
      cornerNodes[2] = node + 1 + rowStride;
      cornerNodes[3] = node + rowStride;
      cornerEdges[0] = 2 * node;
      cornerEdges[1] = 2 * (node + 1) + 1;
      cornerEdges[2] = 2 * (node + rowStride);
      cornerEdges[3] = 2 * node + 1;
      let hits = 0;
      for (let k = 0; k < 4; k++) {
        const neg = vals[cornerNodes[k]] < 0;
        if (neg !== vals[cornerNodes[(k + 1) & 3]] < 0) {
          hitEdges[hits] = cornerEdges[k];
          hitNeg[hits] = neg;
          hits++;
        }
      }
      if (hits === 2) {
        const from = +!hitNeg[0];
        next[hitEdges[from]] = hitEdges[1 - from];
      } else if (hits === 4) {
        const centerNeg = field(x0 + (col + 0.5) * step, y0 + (row + 0.5) * step) < 0;
        for (let k = 0; k < 4; k++)
          if (hitNeg[k]) next[hitEdges[k]] = hitEdges[(k + (centerNeg ? 1 : 3)) & 3];
      }
    }
  const loops: Vec2[][] = [];
  const seen = new Uint8Array(edgeCount);
  for (let edge = 0; edge < edgeCount; edge++) {
    if (next[edge] < 0 || seen[edge] !== 0) continue;
    const pts: Vec2[] = [];
    let cur = edge;
    while (cur >= 0 && seen[cur] === 0) {
      seen[cur] = 1;
      pts.push(edgePoint(cur));
      cur = next[cur];
    }
    if (cur === edge) loops.push(pts);
  }
  return loops;
}

function newtonRoot(
  state: MarchState,
  ax: number,
  ay: number,
  va: number,
  bx: number,
  by: number,
  vb: number,
): number {
  let lo = 0;
  let loVal = va;
  let hi = 1;
  let hiVal = vb;
  let side = 0;
  let t = 0;
  for (let iter = 0; iter < NEWTON_ITER; iter++) {
    t = (lo * hiVal - hi * loVal) / (hiVal - loVal);
    const v = state.field(ax + (bx - ax) * t, ay + (by - ay) * t);
    if (Math.abs(v) <= state.root || hi - lo <= 1e-15) break;
    if (v < 0 === (hiVal < 0)) {
      hi = t;
      hiVal = v;
      if (side === -1) loVal /= 2;
      side = -1;
    } else {
      lo = t;
      loVal = v;
      if (side === 1) hiVal /= 2;
      side = 1;
    }
  }
  return t;
}

function dedupRing(state: MarchState, ring: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let r = 0; r < ring.length; r++) {
    const a = ring[r];
    const b = ring[(r + 1) % ring.length];
    if (a[0] !== b[0] || a[1] !== b[1]) {
      out.push(a);
      subdivideSegment(state, a, b, 0, out);
    }
  }
  return out;
}

function subdivideSegment(state: MarchState, a: Vec2, b: Vec2, depth: number, out: Vec2[]): void {
  const dx0 = b[0] - a[0];
  const dy0 = b[1] - a[1];
  const len = Math.sqrt(dx0 * dx0 + dy0 * dy0);
  if (len === 0 || depth >= SUBDIV_DEPTH || out.length >= POINT_CAP) return;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const vm = state.field(mx, my);
  if (!Number.isFinite(vm)) return;
  const sgn = vm > 0 ? 1 : -1;
  const nx = (-dy0 / len) * sgn;
  const ny = (dx0 / len) * sgn;
  const reach = rayProbe(state, mx, my, vm, nx, ny);
  if (reach === null || (reach <= state.tolerance.deviation / 2 && len <= state.tolerance.edge))
    return;
  const hit: Vec2 =
    vm > 0
      ? gradientFix(state, mx, my, vm, nx, ny, reach)
      : [mx + nx * reach, my + ny * reach];
  subdivideSegment(state, a, hit, depth + 1, out);
  out.push(hit);
  subdivideSegment(state, hit, b, depth + 1, out);
}

function gradientFix(
  state: MarchState,
  x: number,
  y: number,
  v: number,
  nx: number,
  ny: number,
  reach: number,
): Vec2 {
  const probe: Vec2 = [x + nx * reach, y + ny * reach];
  const eps = reach * 0.001;
  const dfdx = state.field(x + eps, y) - state.field(x - eps, y);
  const dfdy = state.field(x, y + eps) - state.field(x, y - eps);
  const gradLen = Math.sqrt(dfdx * dfdx + dfdy * dfdy);
  if (gradLen === 0) return probe;
  const flip = dfdx * ny - dfdy * nx < 0 ? -1 : 1;
  const gx = (-dfdy / gradLen) * flip;
  const gy = (dfdx / gradLen) * flip;
  if (gx * nx + gy * ny < GRADIENT_MIN_DOT) return probe;
  const gReach = rayProbe(state, x, y, v, gx, gy);
  if (gReach === null || gReach * (gx * nx + gy * ny) <= reach) return probe;
  return [x + gx * gReach, y + gy * gReach];
}

function rayProbe(
  state: MarchState,
  x: number,
  y: number,
  v: number,
  dx: number,
  dy: number,
): number | null {
  if (v === 0) return 0;
  let t0 = 0;
  let v0 = v;
  for (let i = 0; i < RAY_STEPS; i++) {
    const t1 = t0 + Math.max(Math.abs(v0), state.root);
    if (t1 > state.reach) return null;
    const x1 = x + dx * t1;
    const y1 = y + dy * t1;
    const v1 = state.field(x1, y1);
    if (v1 < 0 !== v0 < 0)
      return t0 + (t1 - t0) * newtonRoot(state, x + dx * t0, y + dy * t0, v0, x1, y1, v1);
    t0 = t1;
    v0 = v1;
  }
  return null;
}

function simplifyRing(ring: Vec2[], tolerance: { deviation: number; edge: number }): Vec2[] {
  const n = ring.length;
  if (n < 4) return ring;
  const keep = new Uint8Array(n);
  let farthest = 0;
  let farDist = -1;
  for (let t = 1; t < n; t++) {
    const d = distSq(ring[0], ring[t]);
    if (d > farDist) {
      farDist = d;
      farthest = t;
    }
  }
  keep[0] = 1;
  keep[farthest] = 1;
  const recurse = (i: number, j: number): void => {
    if (j - i < 2) return;
    const a = ring[i];
    const b = ring[j % n];
    let maxDev = -1;
    let maxIdx = i;
    for (let t = i + 1; t < j; t++) {
      const d = perpDistSq(ring[t], a, b);
      if (d > maxDev) {
        maxDev = d;
        maxIdx = t;
      }
    }
    const byDeviation = maxDev > tolerance.deviation / 2;
    if (!byDeviation && Math.sqrt(distSq(a, b)) <= tolerance.edge) return;
    if (!byDeviation) maxIdx = (i + j) >> 1;
    keep[maxIdx] = 1;
    recurse(i, maxIdx);
    recurse(maxIdx, j);
  };
  recurse(0, farthest);
  recurse(farthest, n);
  return ring.filter((_p, t) => keep[t] === 1);
}

function distSq(e: Vec2, t: Vec2): number {
  const n = t[0] - e[0];
  const r = t[1] - e[1];
  return n * n + r * r;
}

function perpDistSq(e: Vec2, t: Vec2, n: Vec2): number {
  const r = n[0] - t[0];
  const i = n[1] - t[1];
  const a = e[0] - t[0];
  const o = e[1] - t[1];
  const s = r * r + i * i;
  const c = s > 0 ? Math.min(1, Math.max(0, (a * r + o * i) / s)) : 0;
  const l = a - r * c;
  const u = o - i * c;
  return l * l + u * u;
}

export function eyeBounds(e: EyeSdfData, t: number): Vec2[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let refRad = Infinity;
  const { segments: s, halfWidth: c } = e;
  if (c > 0 && e.ellipseMix < 1 && s.length > 0) {
    for (let i = 0; i < s.length; i += SEG_STRIDE)
      for (const [px, py] of [
        [s[i], s[i + 1]],
        [s[i] + s[i + 2], s[i + 1] + s[i + 3]],
      ]) {
        minX = Math.min(minX, px - c);
        minY = Math.min(minY, py - c);
        maxX = Math.max(maxX, px + c);
        maxY = Math.max(maxY, py + c);
      }
    refRad = c;
  }
  if (e.ellipseMix > 0) {
    minX = Math.min(minX, -e.rx);
    minY = Math.min(minY, -e.ry);
    maxX = Math.max(maxX, e.rx);
    maxY = Math.max(maxY, e.ry);
    refRad = Math.min(refRad, e.rx, e.ry);
  }
  if (!(maxX > minX && maxY > minY)) return [];
  const step = Math.max(
    Math.min(GRID_STEP_MAX, refRad / 3),
    Math.max(maxX - minX, maxY - minY) / GRID_SPAN_DIV,
  );
  return marchingSquares(
    (x, y) => eyeSdf(e, x, y),
    {
      x0: minX - 2 * step,
      y0: minY - 2 * step,
      step,
      nx: Math.ceil((maxX - minX) / step) + 4,
      ny: Math.ceil((maxY - minY) / step) + 4,
    },
    { deviation: t, edge: Math.sqrt(4 * t) },
  );
}

export function eyeOutline(e: EyeShape, scale: number): Vec2[][] {
  const n = Math.min(LOD_MAX_LEVEL, Math.max(0, Math.ceil(Math.log2(Math.max(scale, 1)))));
  const key = `${n}|${e.wid}|${e.oval.join()}|${e.ovalMix}|${e.pts.join()}`;
  const hit = eyeOutlineCache.get(key);
  if (hit !== undefined) {
    eyeOutlineCache.delete(key);
    eyeOutlineCache.set(key, hit);
    return hit;
  }
  const outline = eyeBounds(eyeSdfData(e), OUTLINE_TOL_BASE / 2 ** n);
  eyeOutlineCache.set(key, outline);
  if (eyeOutlineCache.size > OUTLINE_CACHE_MAX) {
    const oldest = eyeOutlineCache.keys().next();
    if (oldest.done !== true) eyeOutlineCache.delete(oldest.value);
  }
  return outline;
}

// ── Hemisphere clipping and arc-merge family ──────────────────

const HORIZON_RADII: Vec2 = [1, 1];

export function clipHemisphere(e: Vec3[], t: number): ClipSegment[] | null {
  const n = e.length;
  let start = -1;
  for (let i = 0; i < n && start < 0; i++)
    if (e[i][2] <= 0 && e[(i + 1) % n][2] > 0) start = i;
  if (start < 0)
    return n === 0 || e[0][2] <= 0
      ? null
      : e.map(([x, y]): ClipSegment => ({ kind: "line", to: [x, y] }));
  const out: ClipSegment[] = [];
  let firstCross: Vec2 = [1, 0];
  let openCross: Vec2 | null = null;
  for (let s = 0; s < n; s++) {
    const c = e[(start + s) % n];
    const l = e[(start + s + 1) % n];
    const u = c[2] > 0;
    const d = l[2] > 0;
    if (u && d) out.push({ kind: "line", to: [l[0], l[1]] });
    else if (u) {
      openCross = horizonCross(c, l);
      out.push({ kind: "line", to: openCross });
    } else if (d) {
      const cross = horizonCross(c, l);
      if (openCross === null) firstCross = cross;
      else out.push(horizonArc(openCross, cross, t));
      out.push({ kind: "line", to: [l[0], l[1]] });
    }
  }
  if (openCross !== null) out.push(horizonArc(openCross, firstCross, t));
  return out;
}

function horizonCross(e: Vec3, t: Vec3): Vec2 {
  const n = e[2] / (e[2] - t[2]);
  const r = e[0] + (t[0] - e[0]) * n;
  const i = e[1] + (t[1] - e[1]) * n;
  const a = Math.sqrt(r * r + i * i);
  return [r / a, i / a];
}

function horizonArc(e: Vec2, t: Vec2, n: number): ClipSegment {
  return {
    kind: "arc",
    to: t,
    radii: HORIZON_RADII,
    sweep: wrapPi(Math.atan2(t[1], t[0]) - n) - wrapPi(Math.atan2(e[1], e[0]) - n),
  };
}

export function ellipseTwoArcs(e: Vec2, t: number): ClipSegment[] {
  return [
    { kind: "arc", to: [-e[0], 0], radii: e, sweep: t * Math.PI },
    { kind: "arc", to: [e[0], 0], radii: e, sweep: t * Math.PI },
  ];
}

export function ellipsePoint(e: Vec2, t: number): Vec2 {
  const n = Math.cos(t);
  const r = Math.sin(t);
  const i = 1 / Math.sqrt((n * n) / (e[0] * e[0]) + (r * r) / (e[1] * e[1]));
  return [i * n, i * r];
}

export function squashClip(e: ClipSegment[], t: Vec2): ClipSegment[] | null {
  const pieces = splitAtEllipse(e, t);
  const n = pieces.length;
  if (pieces.every((p) => p.isInside)) return e;
  let firstInside = -1;
  for (let i = 0; i < n && firstInside < 0; i++)
    if (pieces[i].isInside && !pieces[(i + n - 1) % n].isInside) firstInside = i;
  if (firstInside < 0) {
    const totalSweep = pieces.reduce((acc, p) => acc + p.sweep, 0);
    return Math.abs(totalSweep) > Math.PI ? ellipseTwoArcs(t, Math.sign(totalSweep)) : null;
  }
  const out: ClipSegment[] = [];
  let openFrom: Vec2 | null = null;
  let sweep = 0;
  for (let i = 0; i < n; i++) {
    const p = pieces[(firstInside + i) % n];
    if (p.isInside) {
      if (openFrom !== null) {
        out.push({ kind: "arc", to: p.from, radii: t, sweep });
        openFrom = null;
      }
      out.push(p.segment);
    } else {
      if (openFrom === null) {
        openFrom = p.from;
        sweep = 0;
      }
      sweep += p.sweep;
    }
  }
  if (openFrom !== null)
    out.push({ kind: "arc", to: pieces[firstInside].from, radii: t, sweep });
  return out;
}

interface SplitPiece {
  from: Vec2;
  segment: ClipSegment;
  sweep: number;
  isInside: boolean;
}

function splitAtEllipse(e: ClipSegment[], t: Vec2): SplitPiece[] {
  const invA2 = 1 / (t[0] * t[0]);
  const invB2 = 1 / (t[1] * t[1]);
  const implicit = (p: Vec2): number => invA2 * p[0] * p[0] + invB2 * p[1] * p[1] - 1;
  const pieces: SplitPiece[] = [];
  let cur = e[e.length - 1].to;
  for (const seg of e) {
    if (seg.kind === "line") {
      const crossings = lineEllipseParams(cur, seg.to, invA2, invB2);
      let from = cur;
      for (let i = 0; i <= crossings.length; i++) {
        const t0 = i === 0 ? 0 : crossings[i - 1];
        const t1 = i === crossings.length ? 1 : crossings[i];
        const to = i === crossings.length ? seg.to : lerpPoint(cur, seg.to, t1);
        pieces.push({
          from,
          segment: { kind: "line", to },
          sweep: Math.atan2(from[0] * to[1] - from[1] * to[0], from[0] * to[0] + from[1] * to[1]),
          isInside: implicit(lerpPoint(cur, seg.to, (t0 + t1) / 2)) < 0,
        });
        from = to;
      }
    } else {
      const r = seg.radii[0];
      const baseAngle = Math.atan2(cur[1], cur[0]);
      const crossings = arcEllipseFractions(r, baseAngle, seg.sweep, invA2, invB2);
      let from = cur;
      for (let i = 0; i <= crossings.length; i++) {
        const t0 = i === 0 ? 0 : crossings[i - 1];
        const t1 = i === crossings.length ? 1 : crossings[i];
        const angle = baseAngle + seg.sweep * t1;
        const to: Vec2 = i === crossings.length ? seg.to : [r * Math.cos(angle), r * Math.sin(angle)];
        const midAngle = baseAngle + seg.sweep * ((t0 + t1) / 2);
        const pieceSweep = seg.sweep * (t1 - t0);
        pieces.push({
          from,
          segment: { kind: "arc", to, radii: seg.radii, sweep: pieceSweep },
          sweep: pieceSweep,
          isInside: implicit([r * Math.cos(midAngle), r * Math.sin(midAngle)]) < 0,
        });
        from = to;
      }
    }
    cur = seg.to;
  }
  return pieces;
}

function lineEllipseParams(e: Vec2, t: Vec2, invA2: number, invB2: number): number[] {
  const dx = t[0] - e[0];
  const dy = t[1] - e[1];
  const quad = invA2 * dx * dx + invB2 * dy * dy;
  const lin = invA2 * e[0] * dx + invB2 * e[1] * dy;
  const cst = invA2 * e[0] * e[0] + invB2 * e[1] * e[1] - 1;
  const disc = lin * lin - quad * cst;
  if (quad === 0 || disc <= 0) return [];
  const root = Math.sqrt(disc);
  const p = -(lin + (lin < 0 ? -root : root));
  return [p / quad, cst / p].filter((v) => v > 0 && v < 1).sort((a, b) => a - b);
}

function arcEllipseFractions(
  e: number,
  t: number,
  n: number,
  r: number,
  i: number,
): number[] {
  if (r === i || n === 0) return [];
  const a = (1 / (e * e) - i) / (r - i);
  if (!(a > 0 && a < 1)) return [];
  const o = Math.acos(Math.sqrt(a));
  const out: number[] = [];
  for (const v of [o, -o, Math.PI - o, Math.PI + o]) {
    const f = wrap2Pi(n > 0 ? v - t : t - v) / Math.abs(n);
    if (f > 0 && f < 1) out.push(f);
  }
  return out.sort((a2, b2) => a2 - b2);
}

type ArcSeg = Extract<ClipSegment, { kind: "arc" }>;

export function mergeEyeArcs(e: Vec2, t: ClipSegment[][]): ClipSegment[][] {
  const isBodyArc = (seg: ClipSegment): seg is ArcSeg =>
    seg.kind === "arc" && seg.radii[0] === e[0] && seg.radii[1] === e[1];
  const plainPaths: ClipSegment[][] = [];
  const chains: Chain[] = [];
  const arcPieces: { from: Vec2; sweep: number }[] = [];
  const cutPoints: Vec2[] = [];
  for (const path of t) {
    const firstArc = path.findIndex(isBodyArc);
    if (firstArc < 0) {
      plainPaths.push(path);
      continue;
    }
    let runStart = path[firstArc].to;
    const runSegs: ClipSegment[] = [];
    let prevEnd = runStart;
    for (let k = 1; k <= path.length; k++) {
      const seg = path[(firstArc + k) % path.length];
      if (isBodyArc(seg)) {
        arcPieces.push({ from: prevEnd, sweep: seg.sweep });
        cutPoints.push(prevEnd, seg.to);
        if (runSegs.length > 0) chains.push(reverseChain(runStart, runSegs));
        runSegs.length = 0;
        runStart = seg.to;
      } else runSegs.push(seg);
      prevEnd = seg.to;
    }
  }
  return arcPieces.length === 0
    ? [ellipseTwoArcs(e, 1), ...plainPaths]
    : [...stitchChains([...chains, ...gapArcs(e, arcPieces, cutPoints)]), ...plainPaths];
}

interface Chain {
  from: Vec2;
  to: Vec2;
  segments: ClipSegment[];
}

function reverseChain(e: Vec2, t: ClipSegment[]): Chain {
  const nodes = [e, ...t.map((seg) => seg.to)];
  const segments = t
    .map((seg, i): ClipSegment =>
      seg.kind === "line" ? { kind: "line", to: nodes[i] } : { ...seg, to: nodes[i], sweep: -seg.sweep },
    )
    .reverse();
  return { from: nodes[nodes.length - 1], to: e, segments };
}

function gapArcs(e: Vec2, t: { from: Vec2; sweep: number }[], n: Vec2[]): Chain[] {
  const sorted = n
    .map((p) => ({ point: p, angle: wrap2Pi(Math.atan2(p[1], p[0])) }))
    .sort((a, b) => a.angle - b.angle);
  const out: Chain[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const sweep =
      i + 1 < sorted.length ? b.angle - a.angle : b.angle + 2 * Math.PI - a.angle;
    if (sweep <= 0) continue;
    const mid = a.angle + sweep / 2;
    if (t.reduce((acc, piece) => acc + arcWindingAt(piece, mid), 0) === 0)
      out.push({
        from: a.point,
        to: b.point,
        segments: [{ kind: "arc", to: b.point, radii: e, sweep }],
      });
  }
  return out;
}

function arcWindingAt(e: { from: Vec2; sweep: number }, t: number): number {
  const n = Math.atan2(e.from[1], e.from[0]);
  return (e.sweep > 0 ? wrap2Pi(t - n) : wrap2Pi(n - t)) < Math.abs(e.sweep)
    ? Math.sign(e.sweep)
    : 0;
}

function stitchChains(chains: Chain[]): ClipSegment[][] {
  const key = (p: Vec2): string => `${p[0]} ${p[1]}`;
  const byFrom = new Map<string, Chain[]>();
  for (const chain of chains) {
    const list = byFrom.get(key(chain.from));
    if (list === undefined) byFrom.set(key(chain.from), [chain]);
    else list.push(chain);
  }
  const visited = new Set<Chain>();
  const paths: ClipSegment[][] = [];
  for (const head of chains) {
    const segs: ClipSegment[] = [];
    let cur: Chain | undefined = head;
    for (; cur !== undefined && !visited.has(cur); ) {
      visited.add(cur);
      segs.push(...cur.segments);
      cur = byFrom.get(key(cur.to))?.find((c) => !visited.has(c));
    }
    if (segs.length > 0) paths.push(segs);
  }
  return paths;
}

function lerpPoint(e: Vec2, t: Vec2, n: number): Vec2 {
  return [e[0] + (t[0] - e[0]) * n, e[1] + (t[1] - e[1]) * n];
}

function wrapPi(e: number): number {
  return e - 2 * Math.PI * Math.round(e / (2 * Math.PI));
}

function wrap2Pi(e: number): number {
  const t = e % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

// ── Spherical mapping and assembly ──────────────────────

export function mapEyePoint(eye: EyeShape, frame: EyeFrame, rot: Mat3, pt: Vec2): Vec3 {
  const o = mat3MulVec(rot, frame.M);
  const s = mat3MulVec(rot, frame.C);
  const c = mat3MulVec(rot, frame.T);
  const u = Math.cos(eye.tilt);
  const d = Math.sin(eye.tilt);
  const [f, p] = eye.off;
  const t = pt[0];
  const n = pt[1];
  const r = n * eye.lidY;
  const i = f + u * t + d * r;
  const a = p - d * t + u * r;
  const l = Math.sqrt(i * i + a * a);
  const m = l > 1e-12 ? Math.sin(l) / l : 1;
  const h = Math.cos(l);
  return [
    h * o[0] + m * (i * s[0] + a * c[0]),
    h * o[1] + m * (i * s[1] + a * c[1]),
    h * o[2] + m * (i * s[2] + a * c[2]),
  ];
}

export function mapEyeToSphere(
  eye: EyeShape,
  frame: EyeFrame,
  flip: boolean,
  rot: Mat3,
  scale: number,
): ClipSegment[][] {
  const outlines = eyeOutline(eye, scale * Math.max(1, eye.lidY));
  if (outlines.length === 0) return [];
  const o = mat3MulVec(rot, frame.M);
  const s = mat3MulVec(rot, frame.C);
  const c = mat3MulVec(rot, frame.T);
  const tangent = Math.atan2(o[1], o[0]);
  const u = Math.cos(eye.tilt);
  const d = Math.sin(eye.tilt);
  const [f, p] = eye.off;
  const mapPoint = (pt: Vec2): Vec3 => {
    const t = pt[0];
    const n = pt[1];
    const r = n * eye.lidY;
    const i = f + u * t + d * r;
    const a = p - d * t + u * r;
    const l = Math.sqrt(i * i + a * a);
    const m = l > 1e-12 ? Math.sin(l) / l : 1;
    const h = Math.cos(l);
    return [
      h * o[0] + m * (i * s[0] + a * c[0]),
      h * o[1] + m * (i * s[1] + a * c[1]),
      h * o[2] + m * (i * s[2] + a * c[2]),
    ];
  };
  const paths: ClipSegment[][] = [];
  for (const outline of outlines) {
    const pts = outline.map(mapPoint);
    if (flip) pts.reverse();
    const clipped = clipHemisphere(pts, tangent);
    if (clipped !== null) paths.push(clipped);
  }
  return paths;
}

export function renderEyes(
  frame: MarkFrame,
  scale: number,
  eyeFrames: EyeFrame[],
  flip: boolean[],
): ClipSegment[][] {
  const eyes = frame.eyes;
  if (eyes === null) return [];
  const rot = quatToMat3(frame.quat);
  const squash: Vec2 = [Math.abs(frame.squash[0]), Math.abs(frame.squash[1])];
  const needsSquashClip = squash[0] < 1 || squash[1] < 1;
  const out: ClipSegment[][] = [];
  eyes.forEach((eye, i) => {
    for (const path of mapEyeToSphere(eye, eyeFrames[i], flip[i], rot, scale)) {
      const clipped = needsSquashClip ? squashClip(path, squash) : path;
      if (clipped !== null) out.push(clipped);
    }
  });
  return out;
}

export function arcToPolyline(e: ClipSegment[]): Vec2[] {
  const out: Vec2[] = [];
  let cur: Vec2 = e[e.length - 1]?.to ?? [0, 0];
  for (const seg of e) {
    if (seg.kind === "arc") {
      const base = Math.atan2(cur[1], cur[0]);
      const steps = Math.max(1, Math.ceil(Math.abs(seg.sweep) / ARC_POLYLINE_STEP));
      for (let k = 1; k < steps; k++)
        out.push(ellipsePoint(seg.radii, base + (seg.sweep * k) / steps));
    }
    out.push(seg.to);
    cur = seg.to;
  }
  return out;
}

/**
 * Non-sphere body paths — LOD euler quantization + silhouette/eye-ring caches + eye-seat attachment + polygon union + sprite assembly/SVG wrapping.
 * §0.4 trimming: the proof render layer is ignored; pumpkin resolves to the sphere stub (seat=null → eye rings always []),
 * and its hard-edge quantization set HARD_EDGE_BODIES keeps the source structure.
 */
import type { BodyId, EyeShape, MarkAppearance, MarkFrame, Mat3, Quat, SvgNode } from "../types";
import { mat3ToEuler, quatToMat3 } from "../engine/math/quat";
import type { BodyGeom, Pt2, Seat } from "../geometry/silhouette3d";
import { getSilhouette } from "../geometry/silhouette3d";
import { makeProjection, polygonPath, renderConvexExtrusionPaths, type Projection } from "../geometry/project";
import { layoutEyes, type EyeLayout } from "../geometry/eyeSeats2d";
import { glowGradient, inkPaintOf, spotPaintOf } from "./spherePath";
import { el, fmt2b, svgRoot } from "./svgTree";

// ── Constants and caches ───────────────────────

export const MIN_SPRITE = 144;
export const SPRITE_SCALE = 184 / 256;
const RAD2DEG = 180 / Math.PI;
const CACHE_BYTE_BUDGET = 16e6;
const LOD_BASE = 0.6;
const EYE_LOOP_CACHE_MAX = 256;
const HARD_EDGE_BODIES = new Set<BodyId>(["pumpkin"]);

const silhouettePathCache = new Map<string, string[]>();
let silhouetteCacheBytes = 0;

const eyeLoopCache = new Map<string, string[]>();

// ── LOD and pose quantization ──────────────

/** Quantized display pose (degrees). */
export interface PoseEuler {
  yaw: number;
  pitch: number;
  roll: number;
}

// 90±.5° dead zone: push to 89.5/90.5 (avoiding the orthographic singularity)
export function wrap180(e: number): number {
  const t = ((e % 180) + 180) % 180;
  return Math.abs(t - 90) >= 0.5 ? e : e + (t <= 90 ? 89.5 - t : 90.5 - t);
}

// LOD quantization step (degrees), always a power of 2; size·zoom≤2 clamps to 32°.
export function lodStep(size: number, zoom: number): number {
  const n = (LOD_BASE / Math.max((size * zoom) / 2, 1)) * RAD2DEG;
  return 2 ** Math.floor(Math.log2(n));
}

export function quantizeEuler(m: Mat3, step: number): PoseEuler {
  const [pitch, yaw, roll] = mat3ToEuler(m);
  const q = (v: number): number => (step > 0 ? Math.round(v / step) * step : v);
  return { yaw: wrap180(q(yaw * RAD2DEG)), pitch: wrap180(q(pitch * RAD2DEG)), roll: q(roll * RAD2DEG) };
}

export function eulerFromQuatAny(q: Quat, step = 0): PoseEuler {
  const m = quatToMat3(q);
  // Complementary flip (src Mp): negate the full third row and column
  // (indices 0/2/3/5/6/8) so the matrix stays a proper rotation when m22 < 0.
  return quantizeEuler(
    m[8] >= 0
      ? m
      : [-m[0], m[1], -m[2], -m[3], m[4], -m[5], -m[6], m[7], -m[8]],
    step,
  );
}

export function poseFromQuat(frame: MarkFrame, size: number): PoseEuler {
  const step = lodStep(size, frame.zoom);
  return HARD_EDGE_BODIES.has(frame.body)
    ? quantizeEuler(quatToMat3(frame.quat), step)
    : eulerFromQuatAny(frame.quat, step);
}

// ── Eye seat attachment ──────────────

export function attachEyeLoops(
  body: BodyGeom,
  pose: PoseEuler,
  view: number,
  layout: EyeLayout,
): number[][] {
  return body.seat == null
    ? []
    : attachEyes(body.seat, layout, makeProjection(body, pose, view)).flatMap(polygonPath);
}

export function attachEyes(
  seat: Exclude<Seat, null>,
  layout: EyeLayout,
  proj: Projection,
): Pt2[][] {
  switch (seat.kind) {
    case "front":
      return seatFront(seat.faceZ, layout, proj);
    case "loft":
      return seatLoft(seat.surfaceZ, layout, proj);
    case "wrap":
      return seatWrap(seat, layout, proj);
    case "wrapX":
      return seatWrapX(seat, layout, proj);
    default:
      throw Error(`Unhandled case`);
  }
}

export function seatFront(faceZ: number, { loops, shiftY }: EyeLayout, proj: Projection): Pt2[][] {
  if (!(proj.rotate({ x: 0, y: 0, z: 1 }).z > 0.03)) return [];
  const dy = Math.sin(shiftY);
  return loops
    .filter((loop) => loop.length >= 3)
    .map((loop) => loop.map(([x, y]) => proj.project({ x, y: y - dy, z: faceZ })));
}

export function seatLoft(
  surfaceZ: (x: number, y: number) => number,
  { loops, shiftY }: EyeLayout,
  { rotate, project }: Projection,
): Pt2[][] {
  if (!(rotate({ x: 0, y: 0, z: 1 }).z >= 0.05)) return [];
  const dy = Math.sin(shiftY);
  const out: Pt2[][] = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const pts = loop.map(([x, y]) => ({ x, y: y - dy }));
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    sx /= pts.length;
    sy /= pts.length;
    const h = 0.004;
    const gx = (surfaceZ(sx + h, sy) - surfaceZ(sx - h, sy)) / (2 * h);
    const gy = (surfaceZ(sx, sy + h) - surfaceZ(sx, sy - h)) / (2 * h);
    const inv = Math.hypot(gx, gy, 1);
    if (rotate({ x: -gx / inv, y: -gy / inv, z: 1 / inv }).z < 0.12) continue;
    const z0 = surfaceZ(sx, sy);
    out.push(pts.map((p) => project({ x: p.x, y: p.y, z: z0 + (p.x - sx) * gx + (p.y - sy) * gy })));
  }
  return out;
}

// wrap attachment: angle clamp ±2.6, slope step .012, visible z≥.05; puff branch angle clamp π−.02, 20 bisection iterations.
export function seatWrap(
  seat: Extract<Seat, { kind: "wrap" }>,
  { loops, shiftY }: EyeLayout,
  { rotate, project }: Projection,
): Pt2[][] {
  const { wrapR, wrapY0, wrapY1, radiusAt, puffAt } = seat;
  const inset = radiusAt ? 0.02 : 0.06;
  const baseY = Math.min(wrapY1 - inset, Math.max(wrapY0 + inset, seat.eyeY - shiftY));
  const clampY = (y: number): number => Math.min(wrapY1, Math.max(wrapY0, y));
  const wrapLoop = (loop: readonly (readonly [number, number])[]): Pt2[] => {
    const out: Pt2[] = [];
    for (const [px, py] of loop) {
      const yy = clampY(baseY + py);
      const rr = radiusAt ? radiusAt(yy) : wrapR;
      const u = Math.max(-2.6, Math.min(2.6, px / Math.max(0.12, rr)));
      let slope = 0;
      if (radiusAt) {
        const t = 0.012;
        slope = -(radiusAt(Math.min(wrapY1, yy + t)) - radiusAt(Math.max(wrapY0, yy - t))) / (2 * t);
      }
      if (rotate({ x: Math.sin(u), y: slope, z: Math.cos(u) }).z >= 0.05)
        out.push(project({ x: rr * Math.sin(u), y: yy, z: rr * Math.cos(u) }));
    }
    return out;
  };
  const puffLoop = (loop: readonly (readonly [number, number])[]): Pt2[] => {
    if (puffAt == null || loop.length === 0) return [];
    let sx = 0;
    let sy = 0;
    for (const [x, y] of loop) {
      sx += x;
      sy += y;
    }
    const puff = puffAt(sx / loop.length, clampY(baseY + sy / loop.length));
    const facing = rotate({ x: 0, y: 0, z: 1 }).z;
    const out: Pt2[] = [];
    for (const [px, py] of loop) {
      const dx = px - puff.x;
      const dy = clampY(baseY + py) - puff.y;
      const dist = Math.hypot(dx, dy);
      let ang = Math.min(dist / puff.r, Math.PI - 0.02);
      const ux = dist > 1e-9 ? dx / dist : 1;
      const uy = dist > 1e-9 ? dy / dist : 0;
      const side = rotate({ x: ux, y: uy, z: 0 }).z;
      const lift = (t: number): number => side * Math.sin(t) + facing * Math.cos(t);
      if (lift(ang) < 0.06 && facing > 0.06) {
        let lo = 0;
        let hi = ang;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          if (lift(mid) >= 0.06) lo = mid;
          else hi = mid;
        }
        ang = lo;
      }
      const chord = puff.r * Math.sin(ang);
      if (rotate({ x: ux * Math.sin(ang), y: uy * Math.sin(ang), z: Math.cos(ang) }).z >= 0.05)
        out.push(project({ x: puff.x + ux * chord, y: puff.y + uy * chord, z: puff.z + puff.r * Math.cos(ang) }));
    }
    return out;
  };
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const loop of loops) {
    for (const [, y] of loop) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  let shift = 0;
  if (maxY - minY <= wrapY1 - wrapY0) {
    if (minY + baseY < wrapY0) shift = wrapY0 - (minY + baseY);
    else if (maxY + baseY > wrapY1) shift = wrapY1 - (maxY + baseY);
  }
  const shifted: [number, number][][] =
    shift === 0 ? loops : loops.map((l) => l.map(([x, y]) => [x, y + shift]));
  const mapLoop = puffAt != null ? puffLoop : wrapLoop;
  return shifted.map(mapLoop).filter((l) => l.length > 2);
}

export function seatWrapX(
  seat: Extract<Seat, { kind: "wrapX" }>,
  { loops, shiftY }: EyeLayout,
  { rotate, project }: Projection,
): Pt2[][] {
  const { wrapR, wrapX0, wrapX1, radiusAtX } = seat;
  const baseAng = Math.max(-2.4, Math.min(2.4, -shiftY / wrapR));
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const loop of loops) {
    for (const [x] of loop) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  let shift = 0;
  if (maxX - minX <= wrapX1 - wrapX0) {
    if (minX < wrapX0) shift = wrapX0 - minX;
    else if (maxX > wrapX1) shift = wrapX1 - maxX;
  }
  const shifted: [number, number][][] =
    shift === 0 ? loops : loops.map((l) => l.map(([x, y]) => [x + shift, y]));
  return shifted
    .map((loop) => {
      const out: Pt2[] = [];
      for (const [px, py] of loop) {
        const xx = Math.min(wrapX1, Math.max(wrapX0, px));
        const rr = radiusAtX(xx);
        const ang = baseAng + Math.max(-2.6, Math.min(2.6, py / Math.max(0.12, wrapR)));
        const h = 0.012;
        const slope = -(radiusAtX(Math.min(wrapX1, xx + h)) - radiusAtX(Math.max(wrapX0, xx - h))) / (2 * h);
        if (rotate({ x: -slope, y: Math.sin(ang), z: Math.cos(ang) }).z >= 0.05)
          out.push(project({ x: xx, y: rr * Math.sin(ang), z: rr * Math.cos(ang) }));
      }
      return out;
    })
    .filter((l) => l.length > 2);
}

// ── Polygon union ────────────────────────
// Integer grid (×1024) edge symmetric difference + intersection splitting + orientation filtering + chaining; the key to merging multi-ring cutout masks.

const GRID_SCALE = 1024;
const KEY_OFFSET = 2 ** 23;
const KEY_STRIDE = 2 ** 25;
const EDGE_STRIDE = 2 ** 26;

/** Directed edge (fixed-point integer coordinates + multiplicity). */
interface EdgeRec {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  count: number;
}

class VertexInterner {
  xs: number[] = [];
  ys: number[] = [];
  #ids = new Map<number, number>();
  id(x: number, y: number): number {
    const key = (x + KEY_OFFSET) * KEY_STRIDE + (y + KEY_OFFSET);
    const hit = this.#ids.get(key);
    if (hit !== undefined) return hit;
    const id = this.xs.length;
    this.xs.push(x);
    this.ys.push(y);
    this.#ids.set(key, id);
    return id;
  }
}

const pathRound = (v: number): string => String(Math.round(v * 100) / 100);

export function flatLoopsPath(loops: readonly (readonly number[])[]): string {
  let d = ``;
  for (const loop of loops) {
    d += `M${pathRound(loop[0])} ${pathRound(loop[1])}`;
    for (let i = 2; i < loop.length; i += 2) d += ` ${pathRound(loop[i])} ${pathRound(loop[i + 1])}`;
    d += `Z`;
  }
  return d;
}

export function polygonsUnion(loops: readonly (readonly number[])[]): string {
  const edges = collectEdges(loops);
  const pts = intersectionPoints(edges);
  return chainPaths(orientEdges(mergeEdges(edges.flatMap((e) => splitEdge(e, pts)))));
}

function collectEdges(loops: readonly (readonly number[])[]): EdgeRec[] {
  const interner = new VertexInterner();
  const counts = new Map<number, number>();
  const ids: number[] = [];
  const addLoop = (flat: readonly number[]): void => {
    const area = flatArea2(flat);
    if (area === 0) return;
    const n = flat.length / 2;
    ids.length = 0;
    for (let i = 0; i < n; i++) {
      const j = area > 0 ? i : n - 1 - i;
      ids.push(interner.id(flat[2 * j]!, flat[2 * j + 1]!));
    }
    for (let i = 0; i < n; i++) {
      const a = ids[i]!;
      const b = ids[(i + 1) % n]!;
      if (a === b) continue;
      const revKey = b * EDGE_STRIDE + a;
      const rev = counts.get(revKey) ?? 0;
      if (rev > 1) counts.set(revKey, rev - 1);
      else if (rev === 1) counts.delete(revKey);
      else {
        const key = a * EDGE_STRIDE + b;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  };
  const rounded: number[] = [];
  for (const loop of loops) {
    rounded.length = loop.length;
    for (let i = 0; i < loop.length; i++) rounded[i] = Math.round(loop[i]! * GRID_SCALE);
    const quads = rounded.length === 8 ? splitQuad8(rounded) : null;
    if (quads == null) addLoop(rounded);
    else for (const q of quads) addLoop(q);
  }
  const { xs, ys } = interner;
  return [...counts].map(([key, count]) => {
    const a = Math.floor(key / EDGE_STRIDE);
    const b = key - a * EDGE_STRIDE;
    return { ax: xs[a]!, ay: ys[a]!, bx: xs[b]!, by: ys[b]!, count };
  });
}

function intersectionPoints(edges: readonly EdgeRec[]): { x: number; y: number }[] {
  const interner = new VertexInterner();
  for (const e of edges) {
    interner.id(e.ax, e.ay);
    interner.id(e.bx, e.by);
  }
  const order = edges.map((_e, i) => i).sort((a, b) => edgeMinX(edges[a]!) - edgeMinX(edges[b]!));
  order.forEach((ia, pos) => {
    const a = edges[ia]!;
    const rightA = Math.max(a.ax, a.bx);
    for (let jb = pos + 1; jb < order.length; jb++) {
      const b = edges[order[jb]!]!;
      if (edgeMinX(b) > rightA) break;
      if (Math.min(b.ay, b.by) > Math.max(a.ay, a.by) || Math.max(b.ay, b.by) < Math.min(a.ay, a.by)) continue;
      const s1 = Math.sign(cross2(a.ax, a.ay, a.bx, a.by, b.ax, b.ay));
      const s2 = Math.sign(cross2(a.ax, a.ay, a.bx, a.by, b.bx, b.by));
      const t1 = cross2(b.ax, b.ay, b.bx, b.by, a.ax, a.ay);
      const t2 = cross2(b.ax, b.ay, b.bx, b.by, a.bx, a.by);
      if (s1 * s2 >= 0 || Math.sign(t1) * Math.sign(t2) >= 0) continue;
      const t = t1 / (t1 - t2);
      interner.id(Math.round(a.ax + (a.bx - a.ax) * t), Math.round(a.ay + (a.by - a.ay) * t));
    }
  });
  const { xs, ys } = interner;
  return xs.map((x, i) => ({ x, y: ys[i]! })).sort((p, q) => p.x - q.x);
}

function splitEdge(edge: EdgeRec, pts: readonly { x: number; y: number }[]): EdgeRec[] {
  const dx = edge.bx - edge.ax;
  const dy = edge.by - edge.ay;
  const len = Math.abs(dx) + Math.abs(dy);
  const yLo = Math.min(edge.ay, edge.by) - 0.5;
  const yHi = Math.max(edge.ay, edge.by) + 0.5;
  const xHi = Math.max(edge.ax, edge.bx) + 0.5;
  const hits: { t: number; x: number; y: number }[] = [];
  for (let i = lowerBoundX(pts, Math.min(edge.ax, edge.bx) - 0.5); i < pts.length && pts[i]!.x <= xHi; i++) {
    const { x, y } = pts[i]!;
    if (y < yLo || y > yHi || 2 * Math.abs(cross2(edge.ax, edge.ay, edge.bx, edge.by, x, y)) > len) continue;
    hits.push({ t: ((x - edge.ax) * dx + (y - edge.ay) * dy) / (dx * dx + dy * dy), x, y });
  }
  hits.sort((a, b) => a.t - b.t);
  const out: EdgeRec[] = [];
  for (let i = 1; i < hits.length; i++) {
    const p = hits[i - 1]!;
    const q = hits[i]!;
    if (p.x !== q.x || p.y !== q.y) out.push({ ax: p.x, ay: p.y, bx: q.x, by: q.y, count: edge.count });
  }
  return out;
}

function lowerBoundX(pts: readonly { x: number; y: number }[], x: number): number {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.x < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function mergeEdges(edges: readonly EdgeRec[]): EdgeRec[] {
  const interner = new VertexInterner();
  const counts = new Map<number, number>();
  for (const e of edges) {
    const a = interner.id(e.ax, e.ay);
    const b = interner.id(e.bx, e.by);
    const key = Math.min(a, b) * EDGE_STRIDE + Math.max(a, b);
    counts.set(key, (counts.get(key) ?? 0) + (a < b ? e.count : -e.count));
  }
  const { xs, ys } = interner;
  const out: EdgeRec[] = [];
  for (const [key, count] of counts) {
    if (count === 0) continue;
    const a = Math.floor(key / EDGE_STRIDE);
    const b = key - a * EDGE_STRIDE;
    out.push({ ax: xs[a]!, ay: ys[a]!, bx: xs[b]!, by: ys[b]!, count });
  }
  return out;
}

// Source guard o!==0!=(s!==0): s is parenthesized — it is a sign-crossing test; do NOT drop the parentheses and "restore" it into an always-true expression.
function orientEdges(edges: readonly EdgeRec[]): EdgeRec[] {
  const out: EdgeRec[] = [];
  for (const e of edges) {
    const mx = e.ax + e.bx;
    const my = e.ay + e.by;
    let winding = 0;
    for (const o of edges) {
      if (o === e) continue;
      const ay = 2 * o.ay;
      const by = 2 * o.by;
      if (ay <= my) {
        if (by > my && cross2(2 * o.ax, ay, 2 * o.bx, by, mx, my) > 0) winding += o.count;
      } else if (by <= my && cross2(2 * o.ax, ay, 2 * o.bx, by, mx, my) < 0) winding -= o.count;
    }
    const fwd = e.ay < e.by || (e.ay === e.by && e.ax > e.bx) ? winding + e.count : winding;
    const back = fwd - e.count;
    if ((fwd !== 0) !== (back !== 0))
      out.push(fwd === 0 ? { ax: e.bx, ay: e.by, bx: e.ax, by: e.ay, count: 1 } : { ...e, count: 1 });
  }
  return out;
}

function chainPaths(edges: readonly EdgeRec[]): string {
  const interner = new VertexInterner();
  const adj: number[][] = [];
  for (const e of edges) {
    const a = interner.id(e.ax, e.ay);
    const b = interner.id(e.bx, e.by);
    while (adj.length <= Math.max(a, b)) adj.push([]);
    for (let i = 0; i < Math.abs(e.count); i++) {
      if (e.count > 0) adj[a]!.push(b);
      else adj[b]!.push(a);
    }
  }
  const { xs, ys } = interner;
  let d = ``;
  adj.forEach((next, start) => {
    while (next.length > 0) {
      d += `M${pathRound(xs[start]! / GRID_SCALE)} ${pathRound(ys[start]! / GRID_SCALE)}`;
      let cur = next.pop();
      while (cur !== undefined && cur !== start) {
        d += ` ${pathRound(xs[cur]! / GRID_SCALE)} ${pathRound(ys[cur]! / GRID_SCALE)}`;
        cur = adj[cur]!.pop();
      }
      d += `Z`;
    }
  });
  return d;
}

function splitQuad8(flat: readonly number[]): number[][] | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = flat as [
    number, number, number, number, number, number, number, number,
  ];
  const d1 = segmentCross(x0, y0, x1, y1, x2, y2, x3, y3);
  if (d1 != null) return [[x0, y0, d1[0], d1[1], x3, y3], [d1[0], d1[1], x1, y1, x2, y2]];
  const d2 = segmentCross(x1, y1, x2, y2, x3, y3, x0, y0);
  return d2 == null ? null : [[x1, y1, d2[0], d2[1], x0, y0], [d2[0], d2[1], x2, y2, x3, y3]];
}

function segmentCross(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
): [number, number] | null {
  const s1 = Math.sign(cross2(x0, y0, x1, y1, x2, y2));
  const s2 = Math.sign(cross2(x0, y0, x1, y1, x3, y3));
  const t1 = cross2(x2, y2, x3, y3, x0, y0);
  const t2 = cross2(x2, y2, x3, y3, x1, y1);
  if (!(s1 * s2 < 0 && Math.sign(t1) * Math.sign(t2) < 0)) return null;
  const t = t1 / (t1 - t2);
  return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)];
}

function cross2(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  return (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
}

function flatArea2(flat: readonly number[]): number {
  let area = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    area += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return area;
}

function edgeMinX(e: EdgeRec): number {
  return Math.min(e.ax, e.bx);
}

// ── Body paths and cache ────────────────

export function polygonsToPath(loops: number[][]): string[] {
  if (loops.length === 1) return [flatLoopsPath(loops)];
  const union = polygonsUnion(loops);
  return union === `` ? [] : [union];
}

// Keys fold yaw into yawPeriod; eviction uses an approximate byte budget on path string length.
export function bodyPathCache(shape: BodyId, pose: PoseEuler, res: number): string[] {
  const geom = getSilhouette(shape);
  const yawPeriod = geom.silhouette.kind === `solid` ? geom.silhouette.yawPeriod : null;
  const { pitch, roll } = pose;
  const yaw = yawPeriod == null ? pose.yaw : pose.yaw - yawPeriod * Math.floor(pose.yaw / yawPeriod);
  const key = `${shape} ${res} ${yaw} ${pitch} ${roll}`;
  const hit = silhouettePathCache.get(key);
  if (hit != null) {
    silhouettePathCache.delete(key);
    silhouettePathCache.set(key, hit);
    return hit;
  }
  const paths = polygonsToPath(renderConvexExtrusionPaths(geom, { yaw, pitch, roll }, res));
  silhouettePathCache.set(key, paths);
  silhouetteCacheBytes += pathBytes(paths);
  for (const [k, v] of silhouettePathCache) {
    if (silhouetteCacheBytes <= CACHE_BYTE_BUDGET) break;
    silhouettePathCache.delete(k);
    silhouetteCacheBytes -= pathBytes(v);
  }
  return paths;
}

function pathBytes(paths: readonly string[]): number {
  return paths.reduce((acc, p) => acc + p.length, 0);
}

export function eyeLoopsFor(shape: BodyId, pose: PoseEuler, res: number, eyes: readonly EyeShape[]): string[] {
  const key = `${shape} ${res} ${pose.yaw} ${pose.pitch} ${pose.roll} ${JSON.stringify(eyes)}`;
  const hit = eyeLoopCache.get(key);
  if (hit != null) {
    eyeLoopCache.delete(key);
    eyeLoopCache.set(key, hit);
    return hit;
  }
  const loops = attachEyeLoops(
    getSilhouette(shape),
    pose,
    res,
    shape === `pumpkin`
      ? { loops: [], shiftY: 0 }
      : layoutEyes(shape as Exclude<BodyId, "sphere" | "pumpkin">, eyes),
  ).map((loop) => flatLoopsPath([loop]));
  eyeLoopCache.set(key, loops);
  if (eyeLoopCache.size > EYE_LOOP_CACHE_MAX) {
    for (const k of eyeLoopCache.keys()) {
      eyeLoopCache.delete(k);
      break;
    }
  }
  return loops;
}

/** Body geometry: body path group + eye-ring path group + stem path group. */
export interface BodyGeometry {
  body: string[];
  eyes: string[];
  stem: { d: string; fill: string }[];
}

export function bodyGeometry(
  shape: BodyId,
  pose: PoseEuler,
  res: number,
  eyes: readonly EyeShape[] | null,
): BodyGeometry {
  const eyeLoops = eyes == null ? [] : eyeLoopsFor(shape, pose, res, eyes);
  return { body: bodyPathCache(shape, pose, res), eyes: eyeLoops, stem: [] };
}

export function spriteTransform(
  frame: MarkFrame,
  size: number,
  base: number,
  sprite: number,
): [number, number, number, number] {
  const half = size / 2;
  const cx = half + frame.offset[0] * frame.zoom * half;
  const cy = half - frame.offset[1] * frame.zoom * half;
  const anchorY = cy - frame.squashAnchor * frame.zoom * half;
  const [sx, sy] = frame.squash;
  const scale = base / sprite;
  return [sx * scale, sy * scale, cx - (sx * base) / 2, anchorY + sy * (cy - base / 2 - anchorY)];
}

export function pathToPolylines(path: string): [number, number][][] {
  const out: [number, number][][] = [];
  for (const seg of path.split(`Z`)) {
    const nums = seg
      .replace(/M/g, ` `)
      .trim()
      .split(/\s+/)
      .filter((t) => t !== ``)
      .map(Number);
    if (nums.length < 6) continue;
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!]);
    out.push(pts);
  }
  return out;
}

// ── Sprite assembly and SVG wrapping ─────────────

/** Glow gradient fill description (product of Gp). */
export type GlowFill = ReturnType<typeof glowGradient>;

/** Product of kp: input of jp. */
export interface BodySprite {
  size: number;
  sprite: number;
  transform: string;
  body: string[];
  bodyFill: string | GlowFill;
  eyes: string[];
  eyeFill: string | null;
  stem: { d: string; fill: string }[];
}

export function buildBodySprite(frame: MarkFrame, appearance: MarkAppearance, size: number): BodySprite {
  const base = Math.max(8, Math.round((size * frame.zoom) / SPRITE_SCALE));
  const sprite = Math.max(base, MIN_SPRITE);
  const pose = poseFromQuat(frame, size);
  const { body, eyes, stem } = bodyGeometry(frame.body, pose, sprite, frame.eyes);
  const [sx, sy, tx, ty] = spriteTransform(frame, size, base, sprite);
  const transform = `matrix(${fmt2b(sx)} 0 0 ${fmt2b(sy)} ${fmt2b(tx)} ${fmt2b(ty)})`;
  if (frame.glow != null) {
    const fill = glowGradient(frame.glow, sprite);
    return {
      size,
      sprite,
      transform,
      body: [...body, ...stem.map((s) => s.d)],
      bodyFill: fill,
      eyes: [],
      eyeFill: null,
      stem: [],
    };
  }
  const eyeFill = appearance.cutout ? null : spotPaintOf(appearance);
  const eyeLoops = frame.eyes == null ? [] : eyes;
  return { size, sprite, transform, body, bodyFill: inkPaintOf(appearance), eyes: eyeLoops, eyeFill, stem };
}

/** Single-body shape input for the blend pipeline; points are readonly pairs so both Vec2 and local arrays are accepted. */
export interface BlendShapeInput {
  center: readonly [number, number];
  radius: number;
  body: readonly (readonly [number, number])[][];
  eyes: readonly (readonly [number, number])[][];
  painted?: { fill: string; loops: readonly (readonly [number, number])[][] }[];
}

export function buildBlendGeometry(frame: MarkFrame, size: number): BlendShapeInput {
  const base = Math.max(8, Math.round((size * frame.zoom) / SPRITE_SCALE));
  const sprite = Math.max(base, MIN_SPRITE);
  const pose = poseFromQuat(frame, size);
  const { body, eyes, stem } = bodyGeometry(frame.body, pose, sprite, frame.eyes);
  const [sx, sy, tx, ty] = spriteTransform(frame, size, base, sprite);
  const f = ([x, y]: readonly [number, number]): [number, number] => [sx * x + tx, sy * y + ty];
  const p = (path: string): [number, number][][] => pathToPolylines(path).map((pl) => pl.map(f));
  const painted = stem.map((s) => ({ fill: s.fill, loops: p(s.d) }));
  return {
    center: [(sx * sprite) / 2 + tx, (sy * sprite) / 2 + ty],
    radius: (frame.zoom * size) / 2,
    body: [...body.flatMap(p), ...painted.flatMap(({ loops }) => loops)],
    eyes: frame.eyes == null ? [] : eyes.flatMap(p),
    ...(painted.length === 0 ? {} : { painted }),
  };
}

// Eye cutout or in-eye fill; the proof clipPath branch is ignored per §0.4)
export function spriteToSvgNode(sprite: BodySprite, id: string, extent: number = sprite.size): SvgNode {
  const box = sprite.sprite;
  const bodyRef = `${id}-body`;
  const maskArea = { maskUnits: `userSpaceOnUse`, x: 0, y: 0, width: box, height: box };
  const eyePaths = (fill: string): SvgNode[] => sprite.eyes.map((d) => el(`path`, { d, fill }));
  const bodyPaths = sprite.body.map((d) => el(`path`, { d }));
  const defs: SvgNode[] = [el(`g`, { id: bodyRef }, bodyPaths)];
  let mask: { mask?: string } = {};
  const inside: SvgNode[] = [];
  if (sprite.eyes.length > 0 && sprite.eyeFill == null) {
    defs.push(
      el(`mask`, { id: `${id}-holes`, ...maskArea }, [
        el(`rect`, { width: box, height: box, fill: `#fff` }),
        ...eyePaths(`#000`),
      ]),
    );
    mask = { mask: `url(#${id}-holes)` };
  } else if (sprite.eyes.length > 0 && sprite.eyeFill != null) {
    defs.push(el(`mask`, { id: `${id}-inside`, ...maskArea }, [el(`use`, { href: `#${bodyRef}`, fill: `#fff` })]));
    inside.push(el(`g`, { mask: `url(#${id}-inside)` }, eyePaths(sprite.eyeFill)));
  }
  let bodyNode: SvgNode;
  if (typeof sprite.bodyFill == `string`) {
    bodyNode = el(`use`, { href: `#${bodyRef}`, fill: sprite.bodyFill, ...mask });
  } else {
    const { cx, cy, r, stops } = sprite.bodyFill;
    defs.push(
      el(
        `radialGradient`,
        { id: `${id}-glow`, gradientUnits: `userSpaceOnUse`, cx, cy, r },
        stops.map((s) => el(`stop`, { offset: s.offset, "stop-color": s.color })),
      ),
    );
    bodyNode = el(`use`, { href: `#${bodyRef}`, fill: `url(#${id}-glow)`, ...mask });
  }
  const stemNodes = sprite.stem.map(({ d, fill }) => el(`path`, { d, fill }));
  return svgRoot(sprite.size, id, extent, [
    el(`defs`, {}, defs),
    el(`g`, { transform: sprite.transform }, [bodyNode, ...inside, ...stemNodes]),
  ]);
}

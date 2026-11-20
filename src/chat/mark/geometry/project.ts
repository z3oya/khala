/**
 * Silhouette projection (orthographic) — euler rotation → (x, −y) orthographic projection × radius scaling; solid/ball-cloud polar-angle merge/extrusion/loft shading.
 */
import type { BodyGeom, Pt3, Silhouette, SolidSilhouette } from "./silhouette3d";

const TAU = Math.PI * 2;
const MIN_BODY_RADIUS = 0.2;
const RADIUS_SCALE = 0.36;
const RADIUS_VIEW_NORM = 1.18;
const BALL_DIR_COUNT = 160;
const SHADOW_BUCKETS = 480;
const SHADOW_DILATE = 1.01;
const SHADOW_GAP_EPS = 1e-5;
const SHADOW_BASE = 0.01;
const SORT_BUCKET_DIV = 8;

interface Pt2 {
  x: number;
  y: number;
}
interface BallProj {
  x: number;
  y: number;
  r: number;
}

function unitCircleTable(n: number): Pt2[] {
  return Array.from({ length: n }, (_t, i) => {
    const a = (i / n) * TAU;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

const BALL_DIRECTIONS = unitCircleTable(BALL_DIR_COUNT);
const SHADOW_DIRECTIONS = unitCircleTable(SHADOW_BUCKETS);

/** Degrees. */
export interface EulerAngles {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface Projection {
  rotate: (p: Pt3) => Pt3;
  project: (p: Pt3) => Pt2;
  origin: Pt2;
  radius: number;
}

export function bodyRadius(body: BodyGeom, view: number): number {
  return Math.max(MIN_BODY_RADIUS, body.size) * ((RADIUS_SCALE * view) / RADIUS_VIEW_NORM);
}

function eulerBasis(a: number): [number, number, number] {
  const c = Math.cos(a);
  return [c, Math.sin(a), 1 - c];
}

// Euler rotation (radians); redundant multiplications keep the source form, do NOT simplify
export function eulerRotate(ax: number, ay: number, az: number): (p: Pt3) => Pt3 {
  const [r, i, a] = eulerBasis(ax);
  const [o, s, c] = eulerBasis(ay);
  const [l, u, d] = eulerBasis(az);
  return ({ x, y, z }) => {
    const f = x * r + z * i;
    const p = y * r + y * a;
    const m = z * r - x * i;
    const h = f * o + f * c;
    const g = p * o - m * s;
    const w = m * o + p * s;
    return { x: h * l - g * u, y: g * l + h * u, z: w * l + w * d };
  };
}

export function makeProjection(body: BodyGeom, angles: EulerAngles, view: number): Projection {
  const half = view / 2;
  const radius = bodyRadius(body, view);
  const rotate = eulerRotate(
    (angles.yaw * Math.PI) / 180,
    (angles.pitch * Math.PI) / 180,
    (angles.roll * Math.PI) / 180,
  );
  return {
    rotate,
    project: (p) => {
      const r = rotate(p);
      return { x: half + radius * r.x, y: half - radius * r.y };
    },
    origin: { x: half, y: half },
    radius,
  };
}

export function polygonPath(points: readonly Pt2[]): number[][] {
  const first = points[0];
  if (points.length < 2 || !Number.isFinite(first!.x) || !Number.isFinite(first!.y)) return [];
  const flat: number[] = [];
  for (const p of points) {
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) flat.push(p.x, p.y);
  }
  return flat.length >= 6 ? [flat] : [];
}

function sortPointsByX(pts: readonly Pt2[]): Pt2[] {
  let minX = 1 / 0, maxX = -1 / 0;
  for (const { x } of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const buckets = Math.ceil(pts.length / SORT_BUCKET_DIV);
  const scale = maxX > minX ? buckets / (maxX - minX) : 0;
  const bucketOf = (x: number): number => Math.min(buckets - 1, Math.floor((x - minX) * scale));
  const counts = new Int32Array(buckets + 1);
  for (const { x } of pts) counts[bucketOf(x) + 1]++;
  for (let b = 0; b < buckets; b++) counts[b + 1] += counts[b]!;
  const starts = counts.slice(0, buckets);
  const out: Pt2[] = Array(pts.length);
  for (const p of pts) out[starts[bucketOf(p.x)]++] = p;
  for (let b = 0; b < buckets; b++) {
    for (let i = counts[b]! + 1; i < counts[b + 1]!; i++) {
      const cur = out[i]!;
      let j = i - 1;
      for (; j >= counts[b]! && (out[j]!.x > cur.x || (out[j]!.x === cur.x && out[j]!.y > cur.y)); j--) {
        out[j + 1] = out[j]!;
      }
      out[j + 1] = cur;
    }
  }
  return out;
}

export function convexHull2D(pts: readonly Pt2[]): Pt2[] {
  const sorted = sortPointsByX(pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  if (sorted.length < 3) return sorted;
  const cross = (a: Pt2, b: Pt2, c: Pt2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Pt2[] = [];
  for (const p of sorted) {
    for (; lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0; ) lower.pop();
    lower.push(p);
  }
  const upper: Pt2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    for (; upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0; ) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function renderSolidPaths(sil: SolidSilhouette, proj: Projection): Pt2[] {
  const pts: Pt2[] = [];
  for (const s of sil.samples) {
    const q = proj.project(s);
    if (Number.isFinite(q.x) && Number.isFinite(q.y)) pts.push(q);
  }
  if (sil.isLoop) return pts;
  if (sil.balls.length === 0) return convexHull2D(pts);
  const balls: BallProj[] = sil.balls
    .map(([x, y, z, r]) => ({ ...proj.project({ x, y, z }), r: r * proj.radius }))
    .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && b.r > 1e-6);
  let ox = proj.origin.x, oy = proj.origin.y;
  if (balls.length > 0) {
    ox = 0;
    oy = 0;
    for (const b of balls) {
      ox += b.x;
      oy += b.y;
    }
    ox /= balls.length;
    oy /= balls.length;
  }
  for (const { x: dx, y: dy } of BALL_DIRECTIONS) {
    let reach = 0;
    for (const b of balls) {
      const ex = b.x - ox, ey = b.y - oy;
      const proj2 = dx * ex + dy * ey;
      const disc = proj2 * proj2 - (ex * ex + ey * ey) + b.r * b.r;
      if (disc <= 0) continue;
      const u = proj2 + Math.sqrt(disc);
      if (u > reach) reach = u;
    }
    if (reach > 0) pts.push({ x: ox + dx * reach, y: oy + dy * reach });
  }
  if (sil.samples.length > 0) return convexHull2D(pts);
  if (pts.length >= 3) return pts;
  for (const b of balls) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      pts.push({ x: b.x + b.r * Math.cos(a), y: b.y + b.r * Math.sin(a) });
    }
  }
  return pts.length >= 3 ? convexHull2D(pts) : pts;
}

// Loft ring shading: 480 polar-angle bucket scanline; −240 = −480/2 is a source literal
export function loftRingShadow(
  rings: readonly (readonly Pt3[])[],
  proj: Pick<Projection, "project" | "origin">,
): Pt2[] {
  const { project, origin } = proj;
  const projected = rings.map((ring) => ring.map((p) => project(p)));
  const centroid = (ring: readonly Pt2[]): Pt2 => {
    let sx = 0, sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / ring.length, y: sy / ring.length };
  };
  const firstC = centroid(projected[0]!);
  const lastC = centroid(projected[projected.length - 1]!);
  if (Math.hypot(lastC.x - firstC.x, lastC.y - firstC.y) < 1e-4) {
    let best: Pt2[] = projected[0]!;
    let bestArea = 0;
    for (const ring of projected) {
      let area2 = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        area2 += a.x * b.y - b.x * a.y;
      }
      if (Math.abs(area2) > bestArea) {
        best = ring;
        bestArea = Math.abs(area2);
      }
    }
    return best;
  }
  const dist2 = projected.map((ring) => ring.map(({ x, y }) => (x - origin.x) * (x - origin.x) + (y - origin.y) * (y - origin.y)));
  const maxPerRing = dist2.map((ring) => Math.max(...ring));
  const gapFloor = SHADOW_GAP_EPS * Math.max(...maxPerRing) + SHADOW_BASE;
  const isHidden = (d: number, min: number): boolean => {
    const t = (min - gapFloor) / SHADOW_DILATE;
    return t > 0 && d < t * t;
  };
  const buckets = projected.map((ring) =>
    ring.map(({ x, y }) => {
      const a = (Math.atan2(y - origin.y, x - origin.x) + TAU) % TAU;
      return Math.floor((a / TAU) * SHADOW_BUCKETS) % SHADOW_BUCKETS;
    }),
  );
  const reach = new Float64Array(SHADOW_BUCKETS);
  let runningMin = 0;
  const sweepEdge = (a: Pt2, b: Pt2, bA: number, bB: number, d2Edge: number): void => {
    if (isHidden(d2Edge, runningMin)) return;
    let span = bB - bA;
    if (span > SHADOW_BUCKETS / 2) span -= SHADOW_BUCKETS;
    else if (span < -240) span += SHADOW_BUCKETS;
    const sign = span < 0 ? -1 : 1;
    const mag = Math.abs(span);
    let near = 1 / 0;
    for (let i = -1; i <= mag + 1; i++) {
      const bkt = (bA + sign * i + SHADOW_BUCKETS) % SHADOW_BUCKETS;
      if (reach[bkt]! < near) near = reach[bkt]!;
    }
    if (isHidden(d2Edge, near)) return;
    const ex = b.x - a.x, ey = b.y - a.y;
    const ox = a.x - origin.x, oy = a.y - origin.y;
    for (let i = -1; i <= mag + 1; i++) {
      const bkt = (bA + sign * i + SHADOW_BUCKETS) % SHADOW_BUCKETS;
      const { x: cx, y: cy } = SHADOW_DIRECTIONS[bkt]!;
      const den = cx * ey - cy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ox * ey - oy * ex) / den;
      const u = (ox * cy - oy * cx) / den;
      if (t > reach[bkt]! && u >= 0 && u <= 1) reach[bkt] = t;
    }
  };
  const order = maxPerRing.map((_v, i) => i).sort((a, b) => maxPerRing[b]! - maxPerRing[a]!);
  for (const ri of order) {
    const ring = projected[ri]!;
    for (let j = 0; j < ring.length; j++) {
      const jn = (j + 1) % ring.length;
      sweepEdge(ring[j]!, ring[jn]!, buckets[ri]![j]!, buckets[ri]![jn]!, Math.max(dist2[ri]![j]!, dist2[ri]![jn]!));
    }
    runningMin = Math.min(...reach);
  }
  for (let ri = 0; ri < projected.length - 1; ri++) {
    const ra = projected[ri]!, rb = projected[ri + 1]!;
    for (let j = 0; j < Math.min(ra.length, rb.length); j++) {
      sweepEdge(ra[j]!, rb[j]!, buckets[ri]![j]!, buckets[ri + 1]![j]!, Math.max(dist2[ri]![j]!, dist2[ri + 1]![j]!));
    }
  }
  return SHADOW_DIRECTIONS.flatMap(({ x, y }, b): Pt2[] =>
    reach[b]! > 0 ? [{ x: origin.x + x * reach[b]!, y: origin.y + y * reach[b]! }] : [],
  );
}

// extrusion: src `a=[i,r]` lists the last and first rings as two independent
// cap faces — essential for solid unions of non-convex stars.
export function renderSilhouettePaths(sil: Silhouette, proj: Projection): Pt2[][] {
  if (sil.kind === `loft`) return [loftRingShadow(sil.rings, proj)];
  if (sil.kind === `solid`) return [renderSolidPaths(sil, proj)];
  const rings = sil.rings.map((ring) => ring.map((p) => proj.project(p)));
  const first = rings[0]!;
  const last = rings[rings.length - 1]!;
  const loops: Pt2[][] = [last, first];
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1]!;
    const b = rings[i]!;
    for (let j = 0; j < b.length; j++) {
      const k = (j + 1) % last.length;
      loops.push([a[j]!, a[k]!, b[k]!, b[j]!]);
    }
  }
  return loops;
}

export function renderBodySilhouette(body: BodyGeom, angles: EulerAngles, view: number): number[][] {
  return renderSilhouettePaths(body.silhouette, makeProjection(body, angles, view)).flatMap((loop) =>
    polygonPath(loop as readonly Pt2[]),
  );
}

export function renderConvexExtrusionPaths(body: BodyGeom, angles: EulerAngles, view: number): number[][] {
  const sil = body.silhouette;
  if (sil.kind !== `extrusion` || !sil.isConvex) return renderBodySilhouette(body, angles, view);
  const { project } = makeProjection(body, angles, view);
  return polygonPath(convexHull2D(sil.rings.flat().map((p) => project(p))));
}

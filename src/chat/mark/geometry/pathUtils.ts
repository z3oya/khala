/**
 * 2D path base layer — PathBuilder / Catmull / arc-length resampling / y-scan span table / ray convex-hull ring / 228.44 normalization pipeline.
 */
import type { BodyId } from "../types";
import { OUTLINE_BUILDERS } from "./outline2d";

export const TAU = Math.PI * 2;
export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// 228.44 reference frame center (canvas midpoint)
export const L = 114.2705;
// Normalized target frame side length
export const Rs = 228.44;

const RAY_COUNT = 96;

export class PathBuilder {
  d = ``;
  move(x: number, y: number): this {
    this.d += `M${round2(x)} ${round2(y)}`;
    return this;
  }
  line(x: number, y: number): this {
    this.d += `L${round2(x)} ${round2(y)}`;
    return this;
  }
  curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.d += `C${round2(x1)} ${round2(y1)} ${round2(x2)} ${round2(y2)} ${round2(x)} ${round2(y)}`;
    return this;
  }
  corner(prev: readonly [number, number], vertex: readonly [number, number], next: readonly [number, number], r: number): this {
    const unit = (a: readonly [number, number], b: readonly [number, number]): [number, number] => {
      const dx = a[0] - b[0], dy = a[1] - b[1], len = Math.hypot(dx, dy) || 1;
      return [dx / len, dy / len];
    };
    const dirIn = unit(prev, vertex), dirOut = unit(next, vertex);
    const entry: [number, number] = [vertex[0] + dirIn[0] * r, vertex[1] + dirIn[1] * r];
    const exit: [number, number] = [vertex[0] + dirOut[0] * r, vertex[1] + dirOut[1] * r];
    if (this.d) this.line(entry[0], entry[1]);
    else this.move(entry[0], entry[1]);
    this.d += `Q${round2(vertex[0])} ${round2(vertex[1])} ${round2(exit[0])} ${round2(exit[1])}`;
    return this;
  }
  // Elliptical arc → cubic bezier (one segment per ≤90°, K = 4/3·tan(θ/4))
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): this {
    const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
    const da = (a1 - a0) / segs;
    const k = (4 / 3) * Math.tan(da / 4);
    let t = a0;
    for (let i = 0; i < segs; i++) {
      const t2 = t + da;
      const p0: [number, number] = [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
      const p1: [number, number] = [cx + rx * Math.cos(t2), cy + ry * Math.sin(t2)];
      this.curve(
        p0[0] - k * rx * Math.sin(t), p0[1] + k * ry * Math.cos(t),
        p1[0] + k * rx * Math.sin(t2), p1[1] - k * ry * Math.cos(t2),
        p1[0], p1[1],
      );
      t = t2;
    }
    return this;
  }
  close(): string {
    return this.d + `Z`;
  }
}

export function catmullClosed(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  let d = `M${round2(pts[0][0])} ${round2(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${round2(p1[0] + (p2[0] - p0[0]) / 6)} ${round2(p1[1] + (p2[1] - p0[1]) / 6)} ${round2(p2[0] - (p3[0] - p1[0]) / 6)} ${round2(p2[1] - (p3[1] - p1[1]) / 6)} ${round2(p2[0])} ${round2(p2[1])}`;
  }
  return d + `Z`;
}

export function sampleParametric(fn: (t: number) => [number, number], count = 128): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) pts.push(fn((i / count) * TAU));
  return catmullClosed(pts);
}

export function parsePath(path: string, step = 4): [number, number][] {
  const tokens = path.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const pts: [number, number][] = [];
  let ti = 0;
  let cmd = ``;
  let x = 0, y = 0, sx = 0, sy = 0;
  const num = (): number => parseFloat(tokens[ti++]!);
  const sample = (fn: (t: number) => [number, number], dist: number): void => {
    const steps = Math.max(2, Math.ceil(dist / step));
    for (let s = 1; s <= steps; s++) pts.push(fn(s / steps));
  };
  for (; ti < tokens.length; ) {
    if (/[a-z]/i.test(tokens[ti]!)) cmd = tokens[ti++]!.toUpperCase();
    if (cmd === `Z`) {
      if (Math.hypot(sx - x, sy - y) > 0.01)
        sample((t) => [x + (sx - x) * t, y + (sy - y) * t], Math.hypot(sx - x, sy - y));
      x = sx; y = sy;
    } else {
      if (ti >= tokens.length) break;
      if (cmd === `M`) {
        x = num(); y = num(); sx = x; sy = y;
        pts.push([x, y]);
        cmd = `L`;
      } else if (cmd === `L`) {
        const nx = num(), ny = num();
        sample((t) => [x + (nx - x) * t, y + (ny - y) * t], Math.hypot(nx - x, ny - y));
        x = nx; y = ny;
      } else if (cmd === `Q`) {
        const cx = num(), cy = num(), nx = num(), ny = num();
        const px = x, py = y;
        sample(
          (t) => {
            const s = 1 - t;
            return [s * s * px + 2 * s * t * cx + t * t * nx, s * s * py + 2 * s * t * cy + t * t * ny];
          },
          Math.hypot(cx - x, cy - y) + Math.hypot(nx - cx, ny - cy),
        );
        x = nx; y = ny;
      } else {
        const c1x = num(), c1y = num(), c2x = num(), c2y = num(), nx = num(), ny = num();
        const px = x, py = y;
        sample(
          (t) => {
            const s = 1 - t;
            return [
              s * s * s * px + 3 * s * s * t * c1x + 3 * s * t * t * c2x + t * t * t * nx,
              s * s * s * py + 3 * s * s * t * c1y + 3 * s * t * t * c2y + t * t * t * ny,
            ];
          },
          Math.hypot(c1x - x, c1y - y) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(nx - c2x, ny - c2y),
        );
        x = nx; y = ny;
      }
    }
  }
  return pts;
}

export interface SpanTable {
  top: number;
  bottom: number;
  spanAt: (y: number) => [number, number];
  outerAt: (y: number) => [number, number];
}

export function spanTable(pts: readonly (readonly [number, number])[], buckets = 160): SpanTable {
  let top = 1 / 0, bottom = -1 / 0;
  for (const p of pts) {
    if (p[1] < top) top = p[1];
    if (p[1] > bottom) bottom = p[1];
  }
  const h = bottom - top;
  const yAt = (b: number): number => top + h * (b + 0.5) / buckets;
  const innerLeft = new Float64Array(buckets), innerRight = new Float64Array(buckets);
  const outerMin = new Float64Array(buckets), outerMax = new Float64Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const y = yAt(b);
    let left = -1 / 0, right = 1 / 0, min = 1 / 0, max = -1 / 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, o = pts[(i + 1) % pts.length]!;
      if (a[1] <= y === o[1] <= y) continue;
      const x = a[0] + ((o[0] - a[0]) * (y - a[1])) / (o[1] - a[1]);
      // The source inlines the literal 114.2705 here (= L)
      if (x <= 114.2705) {
        if (x > left) left = x;
      } else if (x < right) right = x;
      if (x < min) min = x;
      if (x > max) max = x;
    }
    innerLeft[b] = Number.isFinite(left) ? left : L;
    innerRight[b] = Number.isFinite(right) ? right : L;
    outerMin[b] = Number.isFinite(min) ? min : L;
    outerMax[b] = Number.isFinite(max) ? max : L;
  }
  const lerpTable = (u: Float64Array, v: Float64Array) => (yq: number): [number, number] => {
    const t = clamp(((yq - top) / h) * buckets - 0.5, 0, buckets - 1);
    const i0 = Math.floor(t), f = t - i0, i1 = Math.min(i0 + 1, buckets - 1);
    return [u[i0]! + (u[i1]! - u[i0]!) * f, v[i0]! + (v[i1]! - v[i0]!) * f];
  };
  return { top, bottom, spanAt: lerpTable(innerLeft, innerRight), outerAt: lerpTable(outerMin, outerMax) };
}

export function rayHull(pts: readonly (readonly [number, number])[]): [number, number][] {
  return Array.from({ length: RAY_COUNT }, (_t, n) => {
    const ang = (n / RAY_COUNT) * TAU;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      const ax = a[0] - L, ay = a[1] - L, bx = b[0] - L, by = b[1] - L;
      const den = (bx - ax) * cy - (by - ay) * cx;
      if (Math.abs(den) < 1e-9) continue;
      const f = (ax * cy - ay * cx) / -den;
      if (f < 0 || f > 1) continue;
      const proj = (ax + (bx - ax) * f) * cx + (ay + (by - ay) * f) * cy;
      if (proj > best) best = proj;
    }
    return [L + cx * best, L + cy * best];
  });
}

export function fitBox(pts: readonly (readonly [number, number])[]): { k: number; dx: number; dy: number } {
  let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const dx = L - (minX + maxX) / 2;
  const dy = L - (minY + maxY) / 2;
  return { k: clamp(Rs / Math.max(maxX - minX, maxY - minY), 0.9, 1.35), dx, dy };
}

export function translatePathNumbers(path: string, k: number, dx: number, dy: number): string {
  let parity = 0;
  return path.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (tok) => {
    parity ^= 1;
    const v = parseFloat(tok) + (parity ? dx : dy);
    return String(round2(L + (v - L) * k));
  });
}

export function applyFit(path: string, pts: readonly (readonly [number, number])[]): string {
  const { k, dx, dy } = fitBox(pts);
  return Math.abs(k - 1) < 0.005 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5
    ? path
    : translatePathNumbers(path, k, dx, dy);
}

export interface NormalizedOutline {
  path: string;
  ring: [number, number][];
  top: number;
  bottom: number;
  spanAt: (y: number) => [number, number];
  beltRadius: number;
}

export function normalizeOutline(path: string): NormalizedOutline {
  const fitted = applyFit(path, parsePath(path));
  const pts = parsePath(fitted);
  const { top, bottom, spanAt, outerAt } = spanTable(pts);
  let belt = 0;
  for (let y = top; y <= bottom; y += 2) {
    const [lo, hi] = outerAt(y);
    belt = Math.max(belt, (hi - lo) / 2);
  }
  return { path: fitted, ring: rayHull(pts), top: round2(top), bottom: round2(bottom), spanAt, beltRadius: round2(belt) };
}

const shapeCacheMap = new Map<BodyId, NormalizedOutline>();
export function shapeCache(body: BodyId): NormalizedOutline {
  const hit = shapeCacheMap.get(body);
  if (hit != null) return hit;
  // Hs entries are always string (basis of the cast)
  const outline = normalizeOutline(OUTLINE_BUILDERS[body]() as string);
  shapeCacheMap.set(body, outline);
  return outline;
}

export function resampleBody(body: BodyId, step = 4): [number, number][] {
  return parsePath(shapeCache(body).path, step);
}

export function resamplePath(path: string): [number, number][] {
  return parsePath(path);
}

export function ptsOf(flat: readonly number[]): [number, number][] {
  return Array.from({ length: flat.length / 2 }, (_t, i) => [flat[2 * i]!, flat[2 * i + 1]!]);
}

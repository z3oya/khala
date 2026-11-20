/**
 * 3D quickhull — input point set → triangle face index list (3 vertex indices per face, counterclockwise outward).
 */
import type { Vec3 } from "../types";

const COPLANAR_EPS = 1e-10;
const EDGE_KEY_SCALE = 2 ** 26;

interface Face {
  corners: [number, number, number];
  normal: [number, number, number];
  offset: number;
}

function makeFace(pts: readonly Vec3[], idx: readonly [number, number, number]): Face {
  const a = pts[idx[0]]!;
  const nRaw = cross(sub(pts[idx[1]]!, a), sub(pts[idx[2]]!, a));
  const len = norm3(nRaw) || 1;
  const normal: [number, number, number] = [nRaw[0] / len, nRaw[1] / len, nRaw[2] / len];
  return { corners: [idx[0], idx[1], idx[2]], normal, offset: dot(normal, a) };
}

function faceDist(f: Face, p: Vec3): number {
  return dot(f.normal, p) - f.offset;
}

function edgeKey(a: number, b: number): number {
  return a * EDGE_KEY_SCALE + b;
}

function argmax(arr: readonly Vec3[], score: (p: Vec3) => number): number {
  let best = 0, bestV = -1 / 0;
  arr.forEach((p, i) => {
    const v = score(p);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

function centroid(pts: readonly Vec3[]): [number, number, number] {
  const n = pts.length;
  return [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
    pts.reduce((s, p) => s + p[2], 0) / n,
  ];
}

function sub(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function initialSimplex(pts: readonly Vec3[]): [number, number, number, number] | null {
  if (pts.length < 4) return null;
  let i0 = 0;
  pts.forEach((p, r) => {
    if (p[0] < pts[i0]![0]) i0 = r;
  });
  const i1 = argmax(pts, (p) => norm3(sub(p, pts[i0]!)));
  const i2 = argmax(pts, (p) => norm3(cross(sub(pts[i1]!, pts[i0]!), sub(p, pts[i0]!))));
  const nrm = cross(sub(pts[i1]!, pts[i0]!), sub(pts[i2]!, pts[i0]!));
  const i3 = argmax(pts, (p) => Math.abs(dot(nrm, sub(p, pts[i0]!))));
  if (Math.abs(dot(nrm, sub(pts[i3]!, pts[i0]!))) < COPLANAR_EPS) return null;
  return [i0, i1, i2, i3];
}

export function quickhull3D(pts: readonly Vec3[]): [number, number, number][] {
  const simplex = initialSimplex(pts);
  if (simplex == null) return [];
  const center = centroid(simplex.map((i) => pts[i]!));
  const [a, b, c, d] = simplex;
  let faces: Face[] = ([[a, b, c], [a, b, d], [a, c, d], [b, c, d]] as [number, number, number][]).map(
    ([i, j, k]) => {
      const f = makeFace(pts, [i, j, k]);
      return faceDist(f, center) > 0 ? makeFace(pts, [i, k, j]) : f;
    },
  );
  pts.forEach((p, pi) => {
    if (simplex.includes(pi)) return;
    const visible = faces.map((f) => faceDist(f, p) > COPLANAR_EPS);
    if (!visible.includes(true)) return;
    const horizon = new Set<number>();
    faces.forEach((f, fi) => {
      if (!visible[fi]) {
        for (let e = 0; e < 3; e++) horizon.add(edgeKey(f.corners[e]!, f.corners[(e + 1) % 3]!));
      }
    });
    const next: Face[] = [];
    faces.forEach((f, fi) => {
      if (!visible[fi]) {
        next.push(f);
      } else {
        for (let e = 0; e < 3; e++) {
          const c0 = f.corners[e]!, c1 = f.corners[(e + 1) % 3]!;
          if (horizon.has(edgeKey(c1, c0))) next.push(makeFace(pts, [c0, c1, pi]));
        }
      }
    });
    faces = next;
  });
  return faces.map((f) => f.corners);
}

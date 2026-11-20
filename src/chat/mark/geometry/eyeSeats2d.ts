/**
 * Static eye-seat layout (2D eye-local space) — takes EyeShape[], outputs {loops, shiftY}; units = same-family proportions in the eye-local radian space.
 */
import type { BodyId, EyeShape } from "../types";
import { STATIC_EYE_SEATS } from "../data/shapes.generated";

const EYE_WIDTH_REF = 0.26;
const EYE_HEIGHT_REF = 0.57;
const EYE_GAP_REF = 0.64;
const UNIT_SHIFT_Y = 0.04;
const UNIT_SHIFT_X = 0.12;
const BEZIER_STEPS = 11;
const PATH_FLOATS = 18;
const OVAL_STEPS = 48;
const CAP_STEPS = 10;
const RING_STEPS = 64;

interface Pt {
  x: number;
  y: number;
}
interface TanPt extends Pt {
  tx: number;
  ty: number;
}

export interface EyeSeatMetrics {
  width: number;
  height: number;
  gap: number;
  shiftY: number;
}

export interface EyeLayout {
  loops: [number, number][][];
  shiftY: number;
}

const DEFAULT_EYE_APPROX = { on: false, oval: false, width: 0, height: 0, tilt: 0, cx: 0, cy: 0 };
type EyeApprox = typeof DEFAULT_EYE_APPROX;

export function safeNum(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export function isOvalEye(eye: EyeShape): boolean {
  return eye.oval[0] > 1e-4 && eye.oval[1] > 1e-4;
}

export function bezierAnchor(path: readonly number[], seg: number): [number, number] {
  return [path[seg * 6]!, path[seg * 6 + 1]!];
}

export function bezierControl(path: readonly number[], seg: number, k: number): [number, number] {
  return [path[seg * 6]! + path[seg * 6 + k]!, path[seg * 6 + 1]! + path[seg * 6 + k + 1]!];
}

export function bezierPoint(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number,
): [number, number] {
  const s = 1 - t;
  return [
    s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0],
    s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1],
  ];
}

export function bezierDerivative(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number,
): [number, number] {
  const s = 1 - t;
  return [
    3 * s * s * (p1[0] - p0[0]) + 6 * s * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * s * s * (p1[1] - p0[1]) + 6 * s * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ];
}

export function normalizedDir(x: number, y: number): Pt {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

export function capArc(center: Pt, sideEnd: Pt, capEnd: Pt, r: number): Pt[] {
  const out: Pt[] = [];
  const a0 = Math.atan2(sideEnd.y - center.y, sideEnd.x - center.x);
  let sweep = Math.atan2(capEnd.y - center.y, capEnd.x - center.x) - a0;
  for (; sweep > Math.PI; ) sweep -= 2 * Math.PI;
  for (; sweep < -Math.PI; ) sweep += 2 * Math.PI;
  const dir = sweep >= 0 ? 1 : -1;
  for (let i = 1; i < CAP_STEPS; i++) {
    const a = a0 + ((i / CAP_STEPS) * dir * Math.PI);
    out.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return out;
}

export function joinOffsetSides(
  pts: readonly Pt[],
  nx: readonly number[],
  ny: readonly number[],
  offset: number,
  startDir: Pt,
  endDir: Pt,
): Pt[] {
  const n = pts.length;
  const sideA = pts.map((p, i) => ({ x: p.x + nx[i]! * offset, y: p.y + ny[i]! * offset }));
  const sideB = pts.map((p, i) => ({ x: p.x - nx[i]! * offset, y: p.y - ny[i]! * offset }));
  const startCap: Pt = { x: pts[0]!.x - startDir.x * offset, y: pts[0]!.y - startDir.y * offset };
  const endCap: Pt = { x: pts[n - 1]!.x + endDir.x * offset, y: pts[n - 1]!.y + endDir.y * offset };
  return [
    ...sideA,
    ...capArc(pts[n - 1]!, sideA[n - 1]!, endCap, offset),
    ...[...sideB].reverse(),
    ...capArc(pts[0]!, sideB[0]!, startCap, offset),
  ];
}

export function nearCircle(pts: readonly Pt[], offset: number): Pt[] | null {
  let sx = 0, sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  sx /= pts.length;
  sy /= pts.length;
  let maxR = 0;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x - sx, p.y - sy));
  if (offset <= maxR * 1.05) return null;
  const out: Pt[] = [];
  for (let i = 0; i < OVAL_STEPS; i++) {
    const a = (2 * Math.PI * i) / OVAL_STEPS;
    const cx = Math.cos(a), cy = Math.sin(a);
    let best = -1 / 0, bx = 0, by = 0;
    for (const p of pts) {
      const proj = p.x * cx + p.y * cy;
      if (proj > best) {
        best = proj;
        bx = p.x;
        by = p.y;
      }
    }
    out.push({ x: bx + cx * offset, y: by + cy * offset });
  }
  return out;
}

export function capsuleOffset(pts: readonly Pt[], offset: number): Pt[] {
  const deduped: Pt[] = [];
  for (const p of pts) {
    const last = deduped[deduped.length - 1];
    if (last == null || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) deduped.push(p);
  }
  if (deduped.length === 0 || offset <= 0) return [];
  const circle = nearCircle(deduped, offset);
  if (circle != null) return circle;
  const n = deduped.length;
  if (n < 2) return [];
  const nx: number[] = [], ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = deduped[Math.max(0, i - 1)]!;
    const next = deduped[Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    let cx = -(next.y - prev.y) / len;
    let cy = (next.x - prev.x) / len;
    if (i > 0 && cx * nx[i - 1]! + cy * ny[i - 1]! < 0) {
      cx = -cx;
      cy = -cy;
    }
    nx.push(cx);
    ny.push(cy);
  }
  return joinOffsetSides(
    deduped,
    nx,
    ny,
    offset,
    normalizedDir(deduped[1]!.x - deduped[0]!.x, deduped[1]!.y - deduped[0]!.y),
    normalizedDir(deduped[n - 1]!.x - deduped[n - 2]!.x, deduped[n - 1]!.y - deduped[n - 2]!.y),
  );
}

export function pathOffset(path: readonly number[], map: (x: number, y: number) => Pt, offset: number): Pt[] {
  if (offset <= 0) return [];
  const sampled: TanPt[] = [];
  for (let seg = 0; seg < 2; seg++) {
    const p0 = bezierAnchor(path, seg);
    const c1 = bezierControl(path, seg, 4);
    const c2 = bezierControl(path, seg + 1, 2);
    const p1 = bezierAnchor(path, seg + 1);
    for (let i = seg === 0 ? 0 : 1; i < BEZIER_STEPS; i++) {
      const t = i / 10;
      const pos = bezierPoint(p0, c1, c2, p1, t);
      const der = bezierDerivative(p0, c1, c2, p1, t);
      const a = map(pos[0], pos[1]);
      const b = map(pos[0] + der[0], pos[1] + der[1]);
      sampled.push({ x: a.x, y: a.y, tx: b.x - a.x, ty: b.y - a.y });
    }
  }
  const circle = nearCircle(sampled, offset);
  if (circle != null) return circle;
  const n = sampled.length;
  const nx: number[] = [], ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const len = Math.hypot(sampled[i]!.tx, sampled[i]!.ty) || 1;
    let cx = -sampled[i]!.ty / len;
    let cy = sampled[i]!.tx / len;
    if (i > 0 && cx * nx[i - 1]! + cy * ny[i - 1]! < 0) {
      cx = -cx;
      cy = -cy;
    }
    nx.push(cx);
    ny.push(cy);
  }
  const first = sampled[0]!;
  const last = sampled[n - 1]!;
  const fLen = Math.hypot(first.tx, first.ty) || 1;
  const lLen = Math.hypot(last.tx, last.ty) || 1;
  return joinOffsetSides(
    sampled,
    nx,
    ny,
    offset,
    { x: first.tx / fLen, y: first.ty / fLen },
    { x: last.tx / lLen, y: last.ty / lLen },
  );
}

export function eyeApprox(eye: EyeShape): EyeApprox {
  const oval = isOvalEye(eye);
  if (!(eye.wid > 0) && !oval) return DEFAULT_EYE_APPROX;
  const lid = eye.lidY || 1;
  const tiltDeg = (eye.tilt || 0) * (180 / Math.PI);
  if (oval) {
    return { on: true, oval: true, width: 2 * eye.oval[0], height: 2 * eye.oval[1] * lid, tilt: tiltDeg, cx: eye.off[0], cy: eye.off[1] };
  }
  const pts = eye.pts;
  if (pts.length < 2) return { ...DEFAULT_EYE_APPROX, cx: eye.off[0], cy: eye.off[1] };
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const wid = 2 * eye.wid;
  return {
    on: true,
    oval: false,
    width: wid,
    height: (len + wid) * lid,
    tilt: (180 / Math.PI) * Math.atan2(dx, dy) + tiltDeg,
    cx: eye.off[0] + (a[0] + b[0]) / 2,
    cy: eye.off[1] + ((a[1] + b[1]) / 2) * lid,
  };
}

export function stadiumRing(side: number, width: number, height: number, tiltDeg: number, gapH: number): Pt[] {
  const halfW = Math.max(0.01, Math.min(1, width)) / 2;
  const halfH = Math.max(0.02, Math.min(1.8, Math.max(height, width))) / 2;
  const rad = (-tiltDeg * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  return Array.from({ length: RING_STEPS }, (_t, i) => {
    const a = (2 * Math.PI * i) / RING_STEPS;
    const px = side * halfH * Math.cos(a);
    const py = halfW * Math.sin(a);
    return { x: px * c - py * s + (side * gapH) / 2, y: px * s + py * c };
  });
}

export function stadiumPair(
  a: EyeApprox,
  b: EyeApprox,
  seat: EyeSeatMetrics,
  wScale: number,
  hScale: number,
  gScale: number,
): { loops: Pt[][]; shiftY: number } {
  const aw = safeNum(a.width * wScale);
  const ah = safeNum(a.height * wScale);
  const bw = safeNum(b.width * wScale);
  const bh = safeNum(b.height * wScale);
  const aMin = Math.max(0, safeNum(Math.min(aw, ah)));
  const aMax = Math.max(0, safeNum(Math.max(aw, ah)));
  const bMin = Math.max(0, safeNum(Math.min(bw, bh)));
  const bMax = Math.max(0, safeNum(Math.max(bw, bh)));
  const gap = Math.max(0, safeNum((EYE_GAP_REF + (a.on ? safeNum(a.cx) : 0) + (b.on ? safeNum(b.cx) : 0)) * gScale, EYE_GAP_REF * gScale));
  const gapH = Math.max(0.05, Math.min(1.8, gap));
  return {
    loops: [
      stadiumRing(-1, aMin, aMax, -safeNum(safeNum(a.tilt) + (aw >= ah ? 0 : 90)), gapH),
      stadiumRing(1, bMin, bMax, safeNum(safeNum(b.tilt) + (bw >= bh ? 0 : 90)), gapH),
    ],
    shiftY: safeNum(seat.shiftY + ((safeNum(a.cy) + safeNum(b.cy)) / 2) * hScale, seat.shiftY),
  };
}

export function generalLoops(
  eyes: readonly EyeShape[],
  wScale: number,
  gScale: number,
  hScale: number,
  shiftYRad: number,
  shiftXRad: number,
): Pt[][] {
  const loops: Pt[][] = [];
  const sy = Math.sin(shiftYRad);
  const cy = -Math.sin(shiftXRad);
  eyes.forEach((eye, idx) => {
    const oval = isOvalEye(eye);
    if (!(eye.wid > 0) && !oval) return;
    if (!oval && eye.pts.length < 2) return;
    const side = idx === 0 ? -1 : 1;
    const lid = eye.lidY || 1;
    const ct = Math.cos(eye.tilt || 0);
    const st = Math.sin(eye.tilt || 0);
    const px = side * ((EYE_GAP_REF / 2 + safeNum(eye.off[0])) * gScale) + sy;
    const py = cy + safeNum(eye.off[1]) * hScale;
    const map = (mx: number, my: number): Pt => {
      const rx = mx * ct - my * st;
      const ry = mx * st + my * ct;
      return { x: px + side * rx * wScale, y: py + ry * wScale * lid };
    };
    if (eye.fillRing != null && eye.fillRing.length >= 3) {
      const ox = safeNum(eye.off[0]);
      const oy = safeNum(eye.off[1]);
      loops.push(eye.fillRing.map(([x, y]) => map(x - ox, (y - oy) * lid)));
      return;
    }
    if (oval) {
      const ring: Pt[] = [];
      for (let i = 0; i < OVAL_STEPS; i++) {
        const a = (2 * Math.PI * i) / OVAL_STEPS;
        ring.push(map(eye.oval[0] * Math.cos(a), eye.oval[1] * lid * Math.sin(a)));
      }
      loops.push(ring);
      return;
    }
    const offset = eye.wid * wScale;
    const loop =
      eye.path != null && eye.path.length === PATH_FLOATS
        ? pathOffset(eye.path, map, offset)
        : capsuleOffset(eye.pts.map((p) => map(p[0], p[1])), offset);
    if (loop.length > 0) loops.push(loop);
  });
  return loops;
}

export function unitScaleLoops(eyes: readonly EyeShape[]): Pt[][] {
  return generalLoops(eyes, 1, 1, 1, UNIT_SHIFT_Y, UNIT_SHIFT_X);
}

export function layoutEyes(body: Exclude<BodyId, "sphere" | "pumpkin">, eyes: readonly EyeShape[]): EyeLayout {
  const seat = STATIC_EYE_SEATS[body] as EyeSeatMetrics;
  const wScale = seat.width / EYE_WIDTH_REF;
  const hScale = seat.height / EYE_HEIGHT_REF;
  const gScale = seat.gap / EYE_GAP_REF;
  const raw = eyes.every((e) => isOvalEye(e) && !(e.fillRing != null && e.fillRing.length > 0))
    ? stadiumPair(eyeApprox(eyes[0]!), eyeApprox(eyes[1]!), seat, wScale, hScale, gScale)
    : { loops: generalLoops(eyes, wScale, gScale, hScale, 0, seat.shiftY), shiftY: 0 };
  return { loops: raw.loops.map((l) => l.map((p): [number, number] => [p.x, p.y])), shiftY: raw.shiftY };
}

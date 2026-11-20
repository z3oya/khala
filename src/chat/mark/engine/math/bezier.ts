/**
 * Cubic bezier easing evaluation / solving.
 * Fixed endpoints p0=0, p3=1; ease = [x1, y1, x2, y2].
 */

// Curve value y(t)
export function bezierPoint(t: number, y1: number, y2: number): number {
  const r = 1 - t;
  return 3 * r * r * t * y1 + 3 * r * t * t * y2 + t * t * t;
}

// Derivative dy/dt
export function bezierDeriv(t: number, y1: number, y2: number): number {
  const r = 1 - t;
  return 3 * r * r * y1 + 6 * r * t * (y2 - y1) + 3 * t * t * (1 - y2);
}

// Newton 8 iterations to solve x, returns y
export function bezierSolve(x: number, ease: readonly [number, number, number, number]): number {
  const [x1, y1, x2, y2] = ease;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const fx = bezierPoint(t, x1, x2) - x;
    const dfx = bezierDeriv(t, x1, x2);
    if (Math.abs(fx) < 1e-6 || Math.abs(dfx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - fx / dfx));
  }
  return bezierPoint(t, y1, y2);
}

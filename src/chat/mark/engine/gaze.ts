/** Gaze: gaze smoothing, orientation coefficients, pointer mapping. */
import type { BodyId } from "../types";

export const GAZE_FRAME = 1 / 60;
export const GAZE_GAIN = 0.55;
// Non-sphere bodies' part kinds get extra decay
export const BODY_GAZE_MUL: Partial<Record<BodyId, number>> = { heartChubby: 0.6, wedge: 0.55 };
// Pointer normalization span multiplier
export const POINTER_SPAN = 2;
// approach convergence threshold
const GAZE_APPROACH_EPS = 0.001;

// Exponential decay per frame with .86 remaining ratio
export function gazeDecay(e: number): number {
  return 1 - 0.86 ** (e / GAZE_FRAME);
}

export function gazeRotation(e: BodyId, gx: number, gy: number): { rx: number; ry: number; px: number; py: number } {
  const r = e !== "sphere";
  const i = BODY_GAZE_MUL[e] ?? 1;
  return {
    rx: -(r ? 19 : 14) * i * gy,
    ry: (r ? 26 : 18) * i * gx,
    px: (r ? 0.07 : 0.03) * gx,
    py: (r ? 0.055 : 0.024) * gy,
  };
}

// Normalize by max(width,1)*span, y inverted
export function pointerToGaze(
  e: { left: number; top: number; width: number; height: number },
  t: { x: number; y: number },
  n = POINTER_SPAN,
): [number, number] {
  const r = Math.max(e.width, 1) * n;
  const i = (v: number) => Math.max(-1, Math.min(1, v));
  return [i((t.x - (e.left + e.width / 2)) / r), i(-(t.y - (e.top + e.height / 2)) / r)];
}

// Advance toward the target, snap within the convergence threshold
export function approach(e: number, t: number, n: number): number {
  const r = e + (t - e) * n;
  return Math.abs(t - r) < GAZE_APPROACH_EPS ? t : r;
}

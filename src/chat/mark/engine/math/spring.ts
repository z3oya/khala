/**
 * Spring integration and easing functions.
 * springStep's damping term: a = -2·ζ·ω·v - ω²·(x - target).
 */

export interface SpringState {
  x: number;
  v: number;
  t: number;
}

export function makeSpringState(value: number): SpringState {
  return { x: value, v: 0, t: value };
}

export function springStep(s: SpringState, omega: number, zeta: number, dt: number): void {
  s.v += (-2 * zeta * omega * s.v - omega * omega * (s.x - s.t)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = s.t;
    s.v = 0;
  }
}

export const SPRING_SUBSTEP_DT = 1 / 120;

export function springSubsteps(dt: number): number {
  return Math.max(1, Math.ceil(dt / SPRING_SUBSTEP_DT));
}

export function easeInOutCubic(e: number): number {
  return e < 0.5 ? 4 * e * e * e : 1 - (-2 * e + 2) ** 3 / 2;
}

export function cubicOut(e: number): number {
  return 1 - (1 - e) ** 3;
}

export function easeOutBack(e: number): number {
  return 1 + 2.70158 * (e - 1) ** 3 + 1.70158 * (e - 1) ** 2;
}

export function smoothstep01(e: number): number {
  const t = Math.min(1, Math.max(0, e));
  return t * t * (3 - 2 * t);
}

// Duplicated with Mr (unclamped variant), both kept
export function smoothstep(e: number): number {
  return e * e * (3 - 2 * e);
}

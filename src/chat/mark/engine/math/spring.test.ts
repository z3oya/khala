import { describe, expect, test } from "vitest";
import { SPRING_SUBSTEP_DT, makeSpringState, springStep, springSubsteps } from "./spring";

describe("spring", () => {
  test("springStep converges x -> t", () => {
    const s = makeSpringState(0);
    s.t = 1;
    const dt = 1 / 120;
    for (let i = 0; i < 1200; i++) springStep(s, 14, 1, dt);
    expect(Math.abs(s.x - s.t)).toBeLessThan(1e-4);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });

  test("springStep recovers from NaN with reset to target", () => {
    const s = makeSpringState(0);
    s.t = 2;
    s.x = Number.NaN;
    springStep(s, 10, 0.5, 1 / 120);
    expect(s.x).toBe(2);
    expect(s.v).toBe(0);
  });

  test("springSubsteps clamps to >=1 and scales with dt", () => {
    expect(springSubsteps(0)).toBe(1);
    expect(springSubsteps(1 / 120)).toBe(1);
    expect(springSubsteps(1 / 60)).toBe(2);
    expect(springSubsteps(1)).toBe(120);
    expect(SPRING_SUBSTEP_DT).toBeCloseTo(1 / 120, 15);
  });
});

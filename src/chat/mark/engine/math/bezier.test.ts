import { describe, expect, test } from "vitest";
import { bezierSolve } from "./bezier";

const CSS_EASE = [.42, 0, .58, 1] as const;

describe("bezier", () => {
  test("bezierSolve endpoints are exactly 0 and 1", () => {
    expect(bezierSolve(0, CSS_EASE)).toBe(0);
    expect(bezierSolve(1, CSS_EASE)).toBe(1);
  });

  test("bezierSolve is monotonically increasing at midpoints", () => {
    const y25 = bezierSolve(0.25, CSS_EASE);
    const y50 = bezierSolve(0.5, CSS_EASE);
    const y75 = bezierSolve(0.75, CSS_EASE);
    expect(y25).toBeGreaterThan(0);
    expect(y50).toBeGreaterThan(y25);
    expect(y75).toBeGreaterThan(y50);
    expect(y75).toBeLessThan(1);
    expect(y25 + y75).toBeCloseTo(1, 6);
  });
});

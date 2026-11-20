import { describe, expect, it } from "vitest";
import type { BodyId } from "../types";
import { L, parsePath } from "./pathUtils";
import {
  HEART_PATH,
  OUTLINE_BUILDERS,
  SPARKLE_PATH,
  STAR6_PATH,
  roundedRect,
  superellipse,
} from "./outline2d";

const ALL_BODIES: BodyId[] = [
  "sphere", "cloud", "square", "sparkle", "clover", "heartChubby",
  "starFlower", "teardrop", "tablet", "wedge", "house", "star6",
  "pebble", "bean", "egg", "squircle", "capsule", "cylinder",
  "hex", "gem", "crystal", "shield", "dome", "arch", "leaf",
];

function bbox(path: string, step = 4) {
  const pts = parsePath(path, step);
  let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, count: pts.length };
}

describe("outline2d", () => {
  it("every BodyId (except pumpkin) constructor produces a non-empty path starting with M", () => {
    expect(ALL_BODIES.length).toBe(25);
    for (const body of ALL_BODIES) {
      const built = OUTLINE_BUILDERS[body]();
      const path = typeof built === `string` ? built : built.close();
      expect(path.length, body).toBeGreaterThan(0);
      expect(path.startsWith(`M`), body).toBe(true);
      expect(bbox(path).count, body).toBeGreaterThan(3);
    }
  });

  it("roundedRect(107,28): width = 2·107 = 214, min ≈ L−107", () => {
    const { minX, maxX, minY, maxY } = bbox(roundedRect(107, 28));
    expect(maxX - minX).toBeCloseTo(214, 1);
    expect(maxY - minY).toBeCloseTo(214, 1);
    expect(minX).toBeCloseTo(L - 107, 1);
  });

  it("superellipse(107,107,3.2): 45° diagonal point offset ≈ 107·2^(−1/3.2)", () => {
    const pts = parsePath(superellipse(107, 107, 3.2), 1);
    let best: [number, number] = pts[0]!;
    let bestSkew = 1 / 0;
    for (const p of pts) {
      const skew = Math.abs(p[0] - L - (p[1] - L));
      if (skew < bestSkew) {
        bestSkew = skew;
        best = p;
      }
    }
    const expected = 107 * Math.pow(2, -1 / 3.2);
    expect(Math.abs(best[0] - L - expected)).toBeLessThan(1);
    expect(Math.abs(best[1] - L - expected)).toBeLessThan(1);
    const b = bbox(superellipse(107, 107, 3.2));
    expect(b.maxX - L).toBeCloseTo(107, 1);
  });

  it("three hand-drawn path literals start with M and end with Z", () => {
    for (const p of [HEART_PATH, SPARKLE_PATH, STAR6_PATH]) {
      expect(p.startsWith(`M`)).toBe(true);
      expect(p.endsWith(`Z`)).toBe(true);
      expect(bbox(p).count).toBeGreaterThan(50);
    }
    expect(HEART_PATH.startsWith(`M79.4511 11.5693`)).toBe(true);
    expect(STAR6_PATH.startsWith(`M58.9438 9.25323`)).toBe(true);
    expect(SPARKLE_PATH.startsWith(`M93.9365 0.100586`)).toBe(true);
  });
});

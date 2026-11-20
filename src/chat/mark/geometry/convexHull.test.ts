import { describe, expect, it } from "vitest";
import type { Vec3 } from "../types";
import { quickhull3D } from "./convexHull";

const CUBE: Vec3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];

describe("quickhull3D", () => {
  it("cube's 8 points → 12 triangle faces, all vertices on the hull", () => {
    const faces = quickhull3D(CUBE);
    expect(faces.length).toBe(12);
    const onHull = new Set<number>();
    for (const f of faces) {
      expect(f.length).toBe(3);
      for (const idx of f) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(7);
        onHull.add(idx);
      }
    }
    expect(onHull.size).toBe(8);
  });

  it("coplanar point set returns empty", () => {
    const flat: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    expect(quickhull3D(flat)).toEqual([]);
  });

  it("interior points add no extra faces", () => {
    const pts: Vec3[] = [...CUBE, [0, 0, 0]];
    expect(quickhull3D(pts).length).toBe(12);
    const onHull = new Set(quickhull3D(pts).flat());
    expect(onHull.has(8)).toBe(false);
  });
});

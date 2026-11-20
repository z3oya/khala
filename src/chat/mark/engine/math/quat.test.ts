import { describe, expect, test } from "vitest";
import { quatAxisAngle, quatFromEulerXYZ, quatToEuler, quatToMat3 } from "./quat";

describe("quat", () => {
  test("euler roundtrip: quatFromEulerXYZ(10,20,30 deg) -> quatToEuler", () => {
    const degIn = [10, 20, 30] as const;
    const q = quatFromEulerXYZ(degIn[0] * (Math.PI / 180), degIn[1] * (Math.PI / 180), degIn[2] * (Math.PI / 180));
    const out = quatToEuler(q);
    const degOut = out.map((r) => r * 180 / Math.PI);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(degOut[i] - degIn[i])).toBeLessThan(1e-6);
    }
  });

  test("euler roundtrip with negative angles", () => {
    const degIn = [-35, 12, -80] as const;
    const q = quatFromEulerXYZ(degIn[0] * (Math.PI / 180), degIn[1] * (Math.PI / 180), degIn[2] * (Math.PI / 180));
    const degOut = quatToEuler(q).map((r) => r * 180 / Math.PI);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(degOut[i] - degIn[i])).toBeLessThan(1e-6);
    }
  });

  test("quatToMat3 produces orthonormal columns", () => {
    const q = quatFromEulerXYZ(0.3, 0.5, 0.9);
    const m = quatToMat3(q);
    const col0 = [m[0], m[3], m[6]];
    const col1 = [m[1], m[4], m[7]];
    const col2 = [m[2], m[5], m[8]];
    const norm = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2]);
    const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const col of [col0, col1, col2]) {
      expect(Math.abs(norm(col) - 1)).toBeLessThan(1e-12);
    }
    expect(Math.abs(dot(col0, col1))).toBeLessThan(1e-12);
    expect(Math.abs(dot(col0, col2))).toBeLessThan(1e-12);
    expect(Math.abs(dot(col1, col2))).toBeLessThan(1e-12);
  });

  test("quatAxisAngle(180deg about z) matches euler construction", () => {
    const q = quatAxisAngle([0, 0, 1], Math.PI);
    expect(q[0]).toBeCloseTo(0, 12);
    expect(q[3]).toBeCloseTo(1, 12);
  });
});

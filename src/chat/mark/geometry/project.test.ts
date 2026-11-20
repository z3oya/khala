import { describe, expect, it } from "vitest";
import {
  bodyRadius,
  convexHull2D,
  eulerRotate,
  makeProjection,
  polygonPath,
  renderBodySilhouette,
  renderConvexExtrusionPaths,
} from "./project";
import { getSilhouette } from "./silhouette3d";

const VIEW = 200;

function bboxCenter(polys: number[][]): { cx: number; cy: number; span: number } {
  let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
  for (const loop of polys) {
    for (let i = 0; i + 1 < loop.length; i += 2) {
      minX = Math.min(minX, loop[i]!);
      maxX = Math.max(maxX, loop[i]!);
      minY = Math.min(minY, loop[i + 1]!);
      maxY = Math.max(maxY, loop[i + 1]!);
    }
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, span: Math.max(maxX - minX, maxY - minY) };
}

describe("project", () => {
  it("bodyRadius: size floor .2, ratio .36·view/1.18", () => {
    expect(bodyRadius({ size: 1, silhouette: {} as never, seat: null }, 1.18)).toBeCloseTo(0.36, 12);
    expect(bodyRadius({ size: 0.01, silhouette: {} as never, seat: null }, 1.18)).toBeCloseTo(0.2 * 0.36, 12);
  });

  it("eulerRotate zero rotation is identity; yaw 90° takes +x to −z", () => {
    const id = eulerRotate(0, 0, 0);
    const p = id({ x: 1, y: 2, z: 3 });
    expect(p.x).toBeCloseTo(1, 12);
    expect(p.y).toBeCloseTo(2, 12);
    expect(p.z).toBeCloseTo(3, 12);
    const yaw = eulerRotate(Math.PI / 2, 0, 0);
    const q = yaw({ x: 1, y: 0, z: 0 });
    expect(q.x).toBeCloseTo(0, 12);
    expect(q.z).toBeCloseTo(-1, 12);
  });

  it("hex (convex extrusion) yaw=0 and yaw=90 projected bboxes both centered on the viewport center", () => {
    const hex = getSilhouette(`hex`);
    for (const yaw of [0, 90]) {
      const polys = renderConvexExtrusionPaths(hex, { yaw, pitch: 0, roll: 0 }, VIEW);
      expect(polys.length).toBeGreaterThan(0);
      const { cx, cy, span } = bboxCenter(polys);
      expect(Math.abs(cx - VIEW / 2), `yaw=${yaw}`).toBeLessThan(0.5);
      expect(Math.abs(cy - VIEW / 2), `yaw=${yaw}`).toBeLessThan(0.5);
      expect(span, `yaw=${yaw}`).toBeGreaterThan(10);
    }
  });

  it("renderBodySilhouette: solid (squircle) and loft (cloud) produce centered polygons", () => {
    for (const body of [`squircle`, `cloud`, `bean`, `crystal`, `pumpkin`] as const) {
      const polys = renderBodySilhouette(getSilhouette(body), { yaw: 30, pitch: 15, roll: 0 }, VIEW);
      expect(polys.length, body).toBeGreaterThan(0);
      for (const loop of polys) {
        expect(loop.length, body).toBeGreaterThanOrEqual(6);
        expect(loop.length % 2, body).toBe(0);
      }
      const { cx, cy } = bboxCenter(polys);
      expect(Math.abs(cx - VIEW / 2), body).toBeLessThan(VIEW / 4);
      expect(Math.abs(cy - VIEW / 2), body).toBeLessThan(VIEW / 4);
    }
  });

  it("makeProjection: origin = viewport center, radius = bodyRadius", () => {
    const hex = getSilhouette(`hex`);
    const proj = makeProjection(hex, { yaw: 0, pitch: 0, roll: 0 }, VIEW);
    expect(proj.origin.x).toBe(VIEW / 2);
    expect(proj.origin.y).toBe(VIEW / 2);
    expect(proj.radius).toBeCloseTo(bodyRadius(hex, VIEW), 12);
    const q = proj.project({ x: 0, y: 0, z: 0 });
    expect(q.x).toBeCloseTo(VIEW / 2, 12);
    expect(q.y).toBeCloseTo(VIEW / 2, 12);
  });

  it("polygonPath: fewer than 3 points forms no ring; convexHull2D square keeps 4 corners", () => {
    expect(polygonPath([])).toEqual([]);
    expect(polygonPath([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toEqual([]);
    // 3 points = 6 floats: forms a ring (source rule ≥6)
    expect(polygonPath([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toEqual([[1, 1, 2, 2, 3, 3]]);
    const hull = convexHull2D([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 },
      { x: 1, y: 1 }, { x: 5, y: 0.5 },
    ]);
    expect(hull.length).toBe(4);
  });
});

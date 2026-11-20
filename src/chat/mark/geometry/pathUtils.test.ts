import { describe, expect, it } from "vitest";
import {
  L,
  Rs,
  catmullClosed,
  clamp,
  fitBox,
  normalizeOutline,
  parsePath,
  ptsOf,
  rayHull,
  round2,
  shapeCache,
  spanTable,
  translatePathNumbers,
} from "./pathUtils";

describe("pathUtils", () => {
  it("round2 / clamp basic constants", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.236)).toBe(1.24);
    expect(clamp(0.5, 0.9, 1.35)).toBe(0.9);
    expect(clamp(2, 0.9, 1.35)).toBe(1.35);
    expect(L).toBe(114.2705);
    expect(Rs).toBe(228.44);
  });

  it("parsePath arc-length resampling: triangle M0 0L10 0L10 10Z has more than 3 points", () => {
    const pts = parsePath(`M0 0L10 0L10 10Z`);
    expect(pts.length).toBeGreaterThan(3);
    // 1 + 3 + 3 + 4 = 11
    expect(pts.length).toBe(11);
    expect(pts[0]).toEqual([0, 0]);
  });

  it("catmullClosed keeps the first point and ends with Z", () => {
    const d = catmullClosed([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(d.startsWith(`M0 0`)).toBe(true);
    expect(d.endsWith(`Z`)).toBe(true);
  });

  it("rayHull: square outline → 96-point closed ring, corner distance = 107√2", () => {
    const sq: [number, number][] = [
      [L - 107, L - 107],
      [L + 107, L - 107],
      [L + 107, L + 107],
      [L - 107, L + 107],
    ];
    const ring = rayHull(sq);
    expect(ring.length).toBe(96);
    let maxR = 0, minR = 1 / 0;
    for (const [x, y] of ring) {
      const r = Math.hypot(x - L, y - L);
      maxR = Math.max(maxR, r);
      minR = Math.min(minR, r);
    }
    // 45° falls exactly on the 96-ray grid (every 3.75°), corners hit precisely
    expect(maxR).toBeCloseTo(107 * Math.SQRT2, 6);
    expect(minR).toBeGreaterThanOrEqual(107);
    // Head-tail closure: ring[95] (356.25°) and ring[0] (0°) land on the same right edge
    const [x0, y0] = ring[0]!;
    const [x1, y1] = ring[ring.length - 1]!;
    expect(Math.abs(x0 - x1)).toBeLessThan(0.5);
    expect(Math.abs(y0 - y1)).toBeLessThan(10); // span of the 3.75° aperture across the edge
    expect(Math.hypot(x0 - x1, y0 - y1)).toBeLessThan((2 * 107 * Math.SQRT2) / 4);
  });

  it("fitBox: square → k = 228.44/214 (inside the clamp), centered dx/dy", () => {
    const sq: [number, number][] = [
      [0, 0],
      [214, 0],
      [214, 214],
      [0, 214],
    ];
    const { k, dx, dy } = fitBox(sq);
    expect(k).toBeCloseTo(Rs / 214, 12);
    expect(dx).toBeCloseTo(L - 107, 12);
    expect(dy).toBeCloseTo(L - 107, 12);
  });

  it("translatePathNumbers: x/y alternating translation + scaling around L", () => {
    const out = translatePathNumbers(`M10 20L30 40`, 2, 5, -3);
    const nums = out.match(/-?[\d.]+/g)!.map(Number);
    expect(nums[0]).toBeCloseTo(L + (15 - L) * 2, 1);
    expect(nums[1]).toBeCloseTo(L + (17 - L) * 2, 1);
    expect(nums[2]).toBeCloseTo(L + (35 - L) * 2, 1);
    expect(nums[3]).toBeCloseTo(L + (37 - L) * 2, 1);
  });

  it("spanTable: mid-band span of a square = full width", () => {
    const sq: [number, number][] = [
      [L - 50, L - 50],
      [L + 50, L - 50],
      [L + 50, L + 50],
      [L - 50, L + 50],
    ];
    const st = spanTable(sq);
    const [lo, hi] = st.spanAt(L);
    expect(lo).toBeCloseTo(L - 50, 6);
    expect(hi).toBeCloseTo(L + 50, 6);
    const [olo, ohi] = st.outerAt(L);
    expect(ohi - olo).toBeCloseTo(100, 6);
  });

  it("normalizeOutline: after roundedRect the bbox lands in [0, 228.44]±1", () => {
    const outline = normalizeOutline(`M${L - 107} ${L - 107}L${L + 107} ${L - 107}L${L + 107} ${L + 107}L${L - 107} ${L + 107}Z`);
    const pts = parsePath(outline.path);
    let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(minX).toBeGreaterThanOrEqual(-1);
    expect(minY).toBeGreaterThanOrEqual(-1);
    expect(maxX).toBeLessThanOrEqual(Rs + 1);
    expect(maxY).toBeLessThanOrEqual(Rs + 1);
    expect(maxX - minX).toBeGreaterThan(226);
    expect(maxY - minY).toBeGreaterThan(226);
    expect(outline.ring.length).toBe(96);
  });

  it("shapeCache cache hit (same object)", () => {
    expect(shapeCache(`square`)).toBe(shapeCache(`square`));
  });

  it("ptsOf: flat array → point pairs", () => {
    expect(ptsOf([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });
});

import { describe, expect, test } from "vitest";
import { getSilhouette } from "./geometry/silhouette3d";
import { renderBodySilhouette } from "./geometry/project";
import { resampleBody, L } from "./geometry/pathUtils";
import { bubbleShape } from "./geometry/outline2d";
import { layoutEyes } from "./geometry/eyeSeats2d";
import { FACE_PRESETS } from "./engine/faces";
import { renderMarkToNode } from "./render/renderFrame";
import { polygonsUnion } from "./render/bodyPaths";
import type { MarkFrame, MarkAppearance, SvgNode } from "./types";
import { quatFromEulerXYZ } from "./engine/math/quat";

function frameFor(): MarkFrame {
  return {
    body: "bubble",
    quat: quatFromEulerXYZ(0, 0, 0),
    zoom: 0.6,
    offset: [0, 0],
    squash: [1, 1],
    squashAnchor: 0,
    eyes: FACE_PRESETS.neutral.map((e) => ({ ...e, pts: e.pts.map((p) => [...p] as [number, number]) })),
    glow: null,
    inspectWeight: 0,
    bodies: [{ body: "bubble", weight: 1 }],
    morph: null,
  };
}

function collectFirstBodyPath(node: SvgNode): string {
  for (const attr of Object.values(node.attrs)) {
    if (typeof attr === "string" && attr.startsWith("M")) return attr;
  }
  for (const c of node.children) {
    const hit = collectFirstBodyPath(c);
    if (hit) return hit;
  }
  return "";
}

const APPEARANCE: MarkAppearance = { inkPaint: "#07C160", spotPaint: "#FFFFFF", cutout: false };

describe("bubble (wechat extension, docs/wechat-bot-mark-design.md)", () => {
  test("outline: closed path inside the 228.44 frame", () => {
    const d = bubbleShape();
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const nums = (d.match(/[-\d.]+/g) ?? []).map(Number).filter(Number.isFinite);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(228.44 + 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(228.44 + 1);
  });

  test("silhouette: extrusion with front seat", () => {
    const g = getSilhouette("bubble");
    expect(g.size).toBeCloseTo(1.21, 6);
    expect(g.silhouette.kind).toBe("extrusion");
    expect(g.seat?.kind).toBe("front");
    if (g.seat?.kind === "front") expect(g.seat.faceZ).toBeCloseTo(0.36, 10);
  });

  test("union: single solid outline (area/res^2 in [.30,.45])", () => {
    const polys = renderBodySilhouette(getSilhouette("bubble"), { yaw: 0, pitch: 0, roll: 0 }, 200);
    const path = polygonsUnion(polys);
    expect(path.startsWith("M")).toBe(true);
    const subs = path.split("M").filter((s) => s.length > 0);
    expect(subs.length).toBe(1);
    const nums = (subs[0]!.match(/[-\d.]+/g) ?? []).map(Number).filter(Number.isFinite);
    let area = 0;
    const n = nums.length / 2;
    for (let j = 0; j < n; j++) {
      const x1 = nums[j * 2]!;
      const y1 = nums[j * 2 + 1]!;
      const x2 = nums[((j + 1) % n) * 2]!;
      const y2 = nums[((j + 1) % n) * 2 + 1]!;
      area += x1 * y2 - x2 * y1;
    }
    area /= 2;
    expect(area / (200 * 200)).toBeGreaterThan(0.3);
    expect(area / (200 * 200)).toBeLessThan(0.45);
  });

  test("layoutEyes returns two eye loops for bubble", () => {
    const layout = layoutEyes("bubble", FACE_PRESETS.neutral);
    expect(layout.loops.length).toBe(2);
    expect(layout.loops[0]!.length).toBeGreaterThan(10);
  });

  test("eye group sits on the ellipse center, not the outline bbox center", () => {
    // Ellipse center from the normalized outline: the topmost point gives cx,
    // the rightmost point gives cy (the tail only occupies the lower-left).
    const pts = resampleBody("bubble");
    const top = pts.reduce((a, b) => (b[1]! < a[1]! ? b : a));
    const right = pts.reduce((a, b) => (b[0]! > a[0]! ? b : a));
    const cxUnit = (top[0]! - L) / L;
    const cyUnit = -(right[1]! - L) / L;
    const layout = layoutEyes("bubble", FACE_PRESETS.neutral);
    const all = layout.loops.flat();
    const ex = all.reduce((s, p) => s + p[0]!, 0) / all.length;
    const ey = all.reduce((s, p) => s + p[1]!, 0) / all.length;
    expect(Math.abs(ex - cxUnit)).toBeLessThan(0.015);
    expect(Math.abs(ey - cyUnit)).toBeLessThan(0.015);
  });

  test("renderMarkToNode renders the bubble body path", () => {
    const node = renderMarkToNode(frameFor(), APPEARANCE, 160, "wechat-diag");
    const d = collectFirstBodyPath(node);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});

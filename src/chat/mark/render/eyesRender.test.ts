import { describe, expect, test } from "vitest";
import type { EyeShape, MarkFrame, Mat3, Vec2, Vec3 } from "../types";
import { quatAxisAngle, quatToMat3 } from "../engine/math/quat";
import {
  arcToPolyline,
  clipHemisphere,
  distToSegments,
  ellipseTwoArcs,
  eyeOutline,
  eyeOutlineCache,
  eyeSdf,
  eyeSdfData,
  mapEyePoint,
  mapEyeToSphere,
  marchingSquares,
  renderEyes,
  renderMarkEyesForSphere,
  squashClip,
  type EyeFrame,
} from "./eyesRender";

// Synthetic ortho frame {M:[0,0,1],T:[0,1,0],C:[1,0,0]} (M·T=M·C=T·C=0)
const FRONT_FRAME: EyeFrame = { M: [0, 0, 1], T: [0, 1, 0], C: [1, 0, 0] };

// neutral baseline eye pi(.26,.57,0°,0): wid=.13, axis half-length a=(.57-.26)/2=.155
const NEUTRAL_PTS: Vec2[] = [
  [0, -0.155],
  [0, 0.155],
];
function makeEye(over: Partial<EyeShape> = {}): EyeShape {
  return {
    off: [0, 0],
    tilt: 0,
    wid: 0.13,
    lidY: 1,
    oval: [0, 0],
    ovalMix: 0,
    pts: NEUTRAL_PTS,
    path: null,
    fillRing: null,
    ...over,
  };
}

const IDENT: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe("eyeSdf", () => {
  test("capsule eye: mid-axis point inside (≈ -halfWidth), far point outside", () => {
    const eye = makeEye();
    const data = eyeSdfData(eye);
    expect(data.halfWidth).toBe(0.13);
    expect(data.segments.length).toBe(5);
    expect(eyeSdf(data, 0, 0)).toBeCloseTo(-0.13, 10);
    expect(eyeSdf(data, 0, 0)).toBeLessThan(0);
    expect(eyeSdf(data, 0.1, 0)).toBeCloseTo(-0.03, 10); // .1 from the axis is still inside (y within the axis length)
    expect(eyeSdf(data, 0.3, 0)).toBeCloseTo(0.17, 10);
  });

  test("distToSegments endpoint distance", () => {
    const { segments } = eyeSdfData(makeEye());
    expect(distToSegments(segments, 0, 0)).toBeCloseTo(0, 12);
    expect(distToSegments(segments, 0, 0.5)).toBeCloseTo(0.345, 12);
    expect(distToSegments(segments, 0.2, 0)).toBeCloseTo(0.2, 12);
  });
});

describe("marchingSquares", () => {
  test("unit circle SDF → single closed polyline, point spacing ~ grid step", () => {
    const loops = marchingSquares(
      (x, y) => Math.hypot(x, y) - 1,
      { x0: -1.3, y0: -1.3, step: 0.1, nx: 26, ny: 26 },
      { deviation: 1e-4, edge: 0.12 },
    );
    expect(loops.length).toBe(1);
    const ring = loops[0];
    expect(ring.length).toBeGreaterThanOrEqual(40);
    for (const p of ring) expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 2);
    let maxGap = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      maxGap = Math.max(maxGap, Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    expect(maxGap).toBeLessThanOrEqual(0.16); // ~ grid-step magnitude
  });
});

describe("eyeOutline cache", () => {
  test("key = `${level}|wid|oval|ovalMix|pts`: same level hits the same reference, new levels add entries", () => {
    eyeOutlineCache.clear();
    const eye = makeEye();
    const a = eyeOutline(eye, 60);
    expect(eyeOutlineCache.size).toBe(1);
    expect([...eyeOutlineCache.keys()][0]).toBe("6|0.13|0,0|0|0,-0.155,0,0.155");
    const b = eyeOutline(eye, 61);
    expect(b).toBe(a);
    expect(eyeOutlineCache.size).toBe(1);
    eyeOutline(eye, 2);
    expect(eyeOutlineCache.size).toBe(2);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a[0].length).toBeGreaterThanOrEqual(3);
  });
});

describe("mapEyePoint (closure m of gh)", () => {
  test("eye origin (0,0) → exactly the M vector", () => {
    const p = mapEyePoint(makeEye(), FRONT_FRAME, IDENT, [0, 0]);
    expect(p[0]).toBe(0);
    expect(p[1]).toBe(0);
    expect(p[2]).toBe(1);
  });

  test("lidY=.5 → y radian coordinate halved (y=sin(n·lidY))", () => {
    const half = mapEyePoint(makeEye({ lidY: 0.5 }), FRONT_FRAME, IDENT, [0, 0.4]);
    const full = mapEyePoint(makeEye({ lidY: 1 }), FRONT_FRAME, IDENT, [0, 0.4]);
    expect(half[1]).toBeCloseTo(Math.sin(0.2), 12);
    expect(half[2]).toBeCloseTo(Math.cos(0.2), 12);
    expect(full[1]).toBeCloseTo(Math.sin(0.4), 12);
    expect(half[1]).toBeLessThan(full[1]);
  });

  test("tilt rotation: at tilt=π/2 local x → spherical -T direction component", () => {
    const p = mapEyePoint(makeEye({ tilt: Math.PI / 2 }), FRONT_FRAME, IDENT, [0.2, 0]);
    // i=cos(π/2)·0.2≈0, a=-sin(π/2)·0.2=-0.2 → P=cos(.2)M - sin(.2)T
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(-Math.sin(0.2), 12);
    expect(p[2]).toBeCloseTo(Math.cos(0.2), 12);
  });
});

describe("hemisphere clipping", () => {
  test("fully front → pure line ring; fully back → null; crossing → arc containing the horizon line", () => {
    const front: Vec3[] = [
      [1, 0, 1],
      [0, 1, 1],
    ];
    const allLines = clipHemisphere(front, 0);
    expect(allLines).not.toBeNull();
    expect(allLines!.every((s) => s.kind === "line")).toBe(true);
    expect(clipHemisphere(
      [
        [1, 0, -1],
        [0, 1, -1],
      ],
      0,
    )).toBeNull();
    const mixed: Vec3[] = [
      [0, 1, -0.2],
      [1, 0, 0.3],
      [0, -1, -0.2],
      [-1, 0, 0.3],
    ];
    const clipped = clipHemisphere(mixed, 0);
    expect(clipped).not.toBeNull();
    expect(clipped!.some((s) => s.kind === "arc")).toBe(true);
  });

  test("mapEyeToSphere: eye rotated to the back (yaw 180°) outputs empty, front outputs non-empty", () => {
    const eye = makeEye();
    const back = quatToMat3(quatAxisAngle([0, 1, 0], Math.PI));
    const frontPaths = mapEyeToSphere(eye, FRONT_FRAME, false, IDENT, 60);
    expect(frontPaths.length).toBeGreaterThanOrEqual(1);
    const backPaths = mapEyeToSphere(eye, FRONT_FRAME, false, back, 60);
    expect(backPaths.length).toBe(0);
    expect(backPaths.length).toBeLessThan(frontPaths.length);
  });
});

describe("squashClip / arcToPolyline", () => {
  test("squashClip returns the original path when fully inside; arcToPolyline arc step ≤ π/48+ε", () => {
    const smallPath = [
      { kind: "line", to: [0.2, 0.3] },
      { kind: "line", to: [-0.2, 0.3] },
      { kind: "line", to: [-0.2, -0.3] },
      { kind: "line", to: [0.2, -0.3] },
    ] as { kind: "line"; to: Vec2 }[];
    expect(squashClip(smallPath, [1, 1])).toBe(smallPath);
    const poly = arcToPolyline(ellipseTwoArcs([1, 1], 1));
    expect(poly.length).toBeGreaterThanOrEqual(2);
    let maxStep = 0;
    const full = [poly[poly.length - 1], ...poly];
    for (let i = 1; i < full.length; i++) {
      const d = Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]);
      maxStep = Math.max(maxStep, d);
    }
    expect(maxStep).toBeLessThanOrEqual(2 * Math.sin(Math.PI / 96) + 1e-9); // chord length of the π/48 step angle
  });
});

describe("renderEyes（fh）", () => {
  test("both-eye assembly: squash=[1,1] skips clipping; squash<1 still produces output via Cm", () => {
    const eye = makeEye();
    const mk = (squash: Vec2): Parameters<typeof renderEyes>[0] => ({
      body: "sphere",
      quat: [1, 0, 0, 0],
      zoom: 1,
      offset: [0, 0],
      squash,
      squashAnchor: 0,
      eyes: [eye, eye],
      glow: null,
      inspectWeight: 0,
      bodies: [],
      morph: null,
    });
    const plain = renderEyes(mk([1, 1]), 60, [FRONT_FRAME, FRONT_FRAME], [false, false]);
    expect(plain.length).toBeGreaterThanOrEqual(2);
    const squashed = renderEyes(mk([0.5, 1]), 60, [FRONT_FRAME, FRONT_FRAME], [false, false]);
    expect(squashed.length).toBeGreaterThanOrEqual(1);
  });

  test("eyes=null → empty array", () => {
    const frame: MarkFrame = {
      body: "sphere",
      quat: [1, 0, 0, 0],
      zoom: 1,
      offset: [0, 0],
      squash: [1, 1],
      squashAnchor: 0,
      eyes: null,
      glow: null,
      inspectWeight: 0,
      bodies: [],
      morph: null,
    };
    expect(renderEyes(frame, 60, [FRONT_FRAME], [false])).toEqual([]);
  });

  test("renderMarkEyesForSphere (real anchor frames from faces): non-empty d, two subpaths for two eyes", () => {
    const frame: MarkFrame = {
      body: "sphere",
      quat: [1, 0, 0, 0],
      zoom: 1,
      offset: [0, 0],
      squash: [1, 1],
      squashAnchor: 0,
      eyes: [makeEye(), makeEye()],
      glow: null,
      inspectWeight: 0,
      bodies: [],
      morph: null,
    };
    const d = renderMarkEyesForSphere(frame, 120);
    expect(d).not.toBe("");
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect(renderMarkEyesForSphere({ ...frame, eyes: null }, 120)).toBe("");
  });
});

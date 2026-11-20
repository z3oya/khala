import { describe, expect, it } from "vitest";
import type { EyeShape } from "../types";
import {
  bezierAnchor,
  bezierControl,
  capArc,
  capsuleOffset,
  eyeApprox,
  generalLoops,
  isOvalEye,
  joinOffsetSides,
  layoutEyes,
  nearCircle,
  pathOffset,
  safeNum,
  stadiumPair,
  stadiumRing,
  unitScaleLoops,
} from "./eyeSeats2d";

// Inline hex Oo entry for tests (the official table lives in data/shapes.generated)
const OO_HEX = { width: 0.26, height: 0.57, gap: 0.64, shiftY: 0.12 };
const EYE_WIDTH_REF = 0.26;
const EYE_HEIGHT_REF = 0.57;
const EYE_GAP_REF = 0.64;

function capsuleEye(off: [number, number] = [0, 0], wid = 0.13): EyeShape {
  return {
    off,
    tilt: 0,
    wid,
    lidY: 1,
    oval: [0, 0],
    ovalMix: 0,
    pts: [
      [-wid, 0],
      [wid, 0],
    ],
    path: null,
    fillRing: null,
  };
}

function ovalEye(off: [number, number] = [0, 0], rx = 0.2, ry = 0.25): EyeShape {
  return {
    off,
    tilt: 0,
    wid: 0,
    lidY: 1,
    oval: [rx, ry],
    ovalMix: 1,
    pts: [],
    path: null,
    fillRing: null,
  };
}

describe("eyeSeats2d", () => {
  it("safeNum / isOvalEye", () => {
    expect(safeNum(1)).toBe(1);
    expect(safeNum(Number.NaN)).toBe(0);
    expect(safeNum(Number.NaN, 7)).toBe(7);
    expect(isOvalEye(ovalEye())).toBe(true);
    expect(isOvalEye(capsuleEye())).toBe(false);
  });

  it("two neutral capsule eyes → loops length 2 (general branch)", () => {
    const layout = layoutEyes(`cloud`, [capsuleEye(), capsuleEye()]);
    expect(layout.loops.length).toBe(2);
    expect(layout.shiftY).toBe(0);
    for (const loop of layout.loops) {
      expect(loop.length).toBeGreaterThan(10);
      for (const [x, y] of loop) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
    const l0 = layout.loops[0]!;
    const l1 = layout.loops[1]!;
    expect(Math.min(...l0.map((p) => p[0]))).toBeLessThan(Math.max(...l1.map((p) => p[0])));
  });

  it("hex Oo entry converts to r=i=a=1 (.26/.26, .57/.57, .64/.64)", () => {
    expect(OO_HEX.width / EYE_WIDTH_REF).toBe(1);
    expect(OO_HEX.height / EYE_HEIGHT_REF).toBe(1);
    expect(OO_HEX.gap / EYE_GAP_REF).toBe(1);
  });

  it("hex elliptical eyes take the stadium branch: 2 rings × 64 points, left/right separated by ±gap/2", () => {
    const layout = layoutEyes(`hex`, [ovalEye(), ovalEye()]);
    expect(layout.loops.length).toBe(2);
    expect(layout.loops[0]!.length).toBe(64);
    expect(layout.loops[1]!.length).toBe(64);
    const mean = (loop: [number, number][]) => loop.reduce((s, p) => s + p[0], 0) / loop.length;
    expect(mean(layout.loops[0]!)).toBeCloseTo(-0.32, 6);
    expect(mean(layout.loops[1]!)).toBeCloseTo(0.32, 6);
    expect(layout.shiftY).toBeCloseTo(OO_HEX.shiftY, 12);
  });

  it("eyeApprox: capsule bounding (width=2·wid, length=axis+wid)", () => {
    const a = eyeApprox(capsuleEye([0.05, -0.02], 0.13));
    expect(a.on).toBe(true);
    expect(a.oval).toBe(false);
    expect(a.width).toBeCloseTo(0.26, 12);
    expect(a.height).toBeCloseTo(0.26 + 0.26, 12);
    expect(a.cx).toBeCloseTo(0.05, 12);
    expect(a.cy).toBeCloseTo(-0.02, 12);
  });

  it("stadiumRing: 64 points, includes the ±gap/2 center offset", () => {
    const ring = stadiumRing(1, 0.4, 0.5, 0, 0.64);
    expect(ring.length).toBe(64);
    expect(ring[0]!.x).toBeCloseTo(0.25 + 0.32, 12);
    expect(ring[0]!.y).toBeCloseTo(0, 12);
  });

  it("stadiumPair: shiftY uses the seat value (when cy=0)", () => {
    const out = stadiumPair(eyeApprox(ovalEye()), eyeApprox(ovalEye()), OO_HEX, 1, 1, 1);
    expect(out.loops.length).toBe(2);
    expect(out.shiftY).toBeCloseTo(0.12, 12);
  });

  it("capsuleOffset: horizontal segment → parallel top/bottom edges + round caps", () => {
    const pts = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const loop = capsuleOffset(pts, 0.3);
    expect(loop.length).toBeGreaterThan(6);
    const ys = loop.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(0.3, 9);
    expect(Math.min(...ys)).toBeCloseTo(-0.3, 9);
  });

  it("nearCircle: when the offset far exceeds the shape, extrapolates along the support point", () => {
    const tiny = [
      { x: -0.01, y: 0 },
      { x: 0.01, y: 0 },
    ];
    const circle = nearCircle(tiny, 1);
    expect(circle).not.toBeNull();
    expect(circle!.length).toBe(48);
    expect(nearCircle(tiny, 0.001)).toBeNull();
  });

  it("pathOffset: 18-float bezier path offset is non-empty", () => {
    // Two segments: anchor P, control points are relative offsets ([+4,+5]=c1, next segment [+2,+3]=c2)
    const path = [
      0, 0, 1, 1, 1, 0, // segment0: P=(0,0); next segment's c2 relative to (1,1), this segment's c1 relative to (1,0)
      2, 0, 1, -1, 1, -1, // segment1: P=(2,0)
      4, 0, 0, 0, 0, 0,
    ];
    const loop = pathOffset(path, (x, y) => ({ x, y }), 0.1);
    expect(loop.length).toBeGreaterThan(10);
  });

  it("joinOffsetSides / capArc end-cap semicircles", () => {
    const caps = capArc({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, 1);
    expect(caps.length).toBe(9);
    const joined = joinOffsetSides(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [0, 0],
      [1, 1],
      0.5,
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    );
    expect(joined.length).toBeGreaterThan(4);
  });

  it("bezierAnchor / bezierControl relative control-point layout", () => {
    const path = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(bezierAnchor(path, 0)).toEqual([1, 2]);
    expect(bezierControl(path, 0, 4)).toEqual([1 + 5, 2 + 6]);
    expect(bezierControl(path, 1, 2)).toEqual([7 + 9, 8 + 10]);
  });

  it("generalLoops / unitScaleLoops: elliptical eyes use 48-point rings", () => {
    const loops = generalLoops([ovalEye(), ovalEye()], 1, 1, 1, 0, 0);
    expect(loops.length).toBe(2);
    expect(loops[0]!.length).toBe(48);
    const unit = unitScaleLoops([capsuleEye(), capsuleEye()]);
    expect(unit.length).toBe(2);
  });

  it("fillRing maps eyes directly (no offset dilation)", () => {
    const ringEye: EyeShape = {
      ...capsuleEye(),
      fillRing: [
        [-0.2, -0.1],
        [0.2, -0.1],
        [0, 0.2],
      ],
      wid: 0.13,
    };
    const loops = generalLoops([ringEye, ringEye], 1, 1, 1, 0, 0);
    expect(loops.length).toBe(2);
    expect(loops[0]!.length).toBe(3);
  });
});

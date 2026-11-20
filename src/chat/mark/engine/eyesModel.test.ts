import { describe, expect, test } from "vitest";
import {
  INSPECTING_PRESET,
  PATH_FLOATS,
  alignVertical,
  anchorAt,
  blendOval,
  blendStadium,
  boundsBox,
  buildEyePath,
  capsuleApprox,
  capsuleX,
  collapseEye,
  inspectScale,
  isClosedShape,
  isOvalEye,
  lidAnchor,
  lidDrop,
  lerpNum,
  lerpVec,
  makeEye,
  resamplePts,
  resetOval,
  stadiumRing,
  widenToOval,
} from "./eyesModel";
import { FACE_PRESETS } from "./faces";

const closeTo = (a: number, b: number, digits = 10) => expect(a).toBeCloseTo(b, digits);

describe("eyesModel / 9-expression configurations (spec §4.2)", () => {
  test("neutral: wid=.13, pts 21, path 18, endpoint anchors [0,±.155]", () => {
    const eye = FACE_PRESETS.neutral[0];
    expect(eye.wid).toBeCloseTo(0.13, 15);
    // Source sampling idiom: segment1 has 11 points, segment2 starts at 1 (step 1/10) → 11+10=21 (spec §4.1's "22" is a typo, same convention as eyeSeats2d.ts)
    expect(eye.pts.length).toBe(21);
    expect(eye.path?.length).toBe(PATH_FLOATS);
    expect(eye.lidY).toBe(1);
    closeTo(anchorAt(eye.path!, 0)[0], 0, 6);
    closeTo(anchorAt(eye.path!, 0)[1], -0.155);
    closeTo(anchorAt(eye.path!, 2)[0], 0, 6);
    closeTo(anchorAt(eye.path!, 2)[1], 0.155);
  });

  test("squinted: eye bbox wider than tall (horizontal capsule .5×.26)", () => {
    const box = boundsBox(FACE_PRESETS.squinted[0]);
    closeTo(box.w, 0.5, 6);
    closeTo(box.h, 0.26, 6);
    expect(box.w).toBeGreaterThan(box.h);
  });

  test("inspecting: both eyes wid .27/.18, both shifted right by .04", () => {
    const [a, b] = FACE_PRESETS.inspecting;
    expect(a.wid).toBeCloseTo(0.27, 15);
    expect(b.wid).toBeCloseTo(0.18, 15);
    closeTo(a.off[0], 0.04);
    closeTo(b.off[0], 0.04);
    expect(FACE_PRESETS.inspecting).toBe(INSPECTING_PRESET);
  });

  test("calm：oval=[.296,.247]，wid=.247", () => {
    const eye = FACE_PRESETS.calm[0];
    expect(eye.oval[0]).toBeCloseTo(0.296, 15);
    expect(eye.oval[1]).toBeCloseTo(0.247, 15);
    expect(eye.wid).toBeCloseTo(0.247, 15);
    expect(isOvalEye(eye)).toBe(true);
  });

  test("happy/sleepy/confused: path 18 floats and a closed shape; straight capsules are not", () => {
    for (const face of ["happy", "sleepy", "confused"] as const) {
      const eye = FACE_PRESETS[face][0];
      expect(eye.path?.length).toBe(18);
      expect(isClosedShape(eye)).toBe(true);
    }
    for (const face of ["neutral", "surprised", "sad", "squinted"] as const) {
      expect(isClosedShape(FACE_PRESETS[face][0])).toBe(false);
    }
    expect(isClosedShape(FACE_PRESETS.calm[0])).toBe(false);
  });

  test("happy/sad both eyes isomorphic (same object reference)", () => {
    expect(FACE_PRESETS.happy[0]).toBe(FACE_PRESETS.happy[1]);
    expect(FACE_PRESETS.sad[0]).toBe(FACE_PRESETS.sad[1]);
  });
});

describe("eyesModel / path primitives", () => {
  test("buildEyePath non-arc: midpoint method (p0=[0,-1],p1=[0,0],p2=[0,1] → anchor1=[0,0], out-handle 1/3)", () => {
    const u = buildEyePath({ p0: [0, -1], p1: [0, 0], p2: [0, 1], isArc: false });
    expect(anchorAt(u, 0)).toEqual([0, -1]);
    expect(anchorAt(u, 1)).toEqual([0, 0]);
    expect(anchorAt(u, 2)).toEqual([0, 1]);
    closeTo(u[4], 0, 12);
    closeTo(u[5], 1 / 3);
  });

  test("buildEyePath circular arc: upper semicircle → 3 equal segments, K=4/3·tan(π/8)", () => {
    const u = buildEyePath({ p0: [1, 0], p1: [0, 1], p2: [-1, 0], isArc: true });
    expect(anchorAt(u, 0)[0]).toBeCloseTo(1, 12);
    expect(anchorAt(u, 0)[1]).toBeCloseTo(0, 12);
    expect(anchorAt(u, 1)[0]).toBeCloseTo(0, 12);
    expect(anchorAt(u, 1)[1]).toBeCloseTo(1, 12);
    expect(anchorAt(u, 2)[0]).toBeCloseTo(-1, 12);
    expect(anchorAt(u, 2)[1]).toBeCloseTo(0, 12);
    const K = (4 / 3) * Math.tan(Math.PI / 8);
    closeTo(u[8], K, 12);
    closeTo(u[9], 0, 12);
  });

  test("buildEyePath degenerate arc (collinear) lands in the chord-midpoint branch", () => {
    const u = buildEyePath({ p0: [-1, 0], p1: [0, 0], p2: [1, 0], isArc: true });
    expect(anchorAt(u, 1)).toEqual([0, 0]);
    closeTo(u[8], -1 / 3);
  });

  test("samplePath: 21 points (11+10), first=p0, last=p2", () => {
    const eye = capsuleX(0.26, 0.57, 0, 0);
    expect(eye.pts.length).toBe(21);
    expect(eye.pts[0][0]).toBeCloseTo(0, 12);
    expect(eye.pts[0][1]).toBeCloseTo(-0.155, 12);
    expect(eye.pts[20][1]).toBeCloseTo(0.155, 12);
  });

  test("makeEye：lidY=1、ovalMix=0、fillRing=null", () => {
    const eye = makeEye([1, 2], 0.5, 0.1, { p0: [0, -1], p1: [0, 0], p2: [0, 1], isArc: false }, [0, 0]);
    expect(eye.off).toEqual([1, 2]);
    expect(eye.tilt).toBe(0.5);
    expect(eye.wid).toBe(0.1);
    expect(eye.lidY).toBe(1);
    expect(eye.ovalMix).toBe(0);
    expect(eye.fillRing).toBeNull();
  });
});

describe("eyesModel / transforms and metrics", () => {
  test("lerpNum/lerpVec/resamplePts boundaries", () => {
    expect(lerpNum(0, 1, 0.25)).toBe(0.25);
    expect(lerpVec([0, 2], [4, 2], 0.5)).toEqual([2, 2]);
    expect(resamplePts([], 0, 4)).toEqual([0, 0]);
    expect(resamplePts([[3, 4]], 2, 5)).toEqual([3, 4]);
    expect(resamplePts([[0, 0], [10, 0]], 1, 5)).toEqual([2.5, 0]);
  });

  test("capsuleApprox: calm takes the oval axis (ang=π/2), neutral takes the endpoint chord+wid", () => {
    const calm = capsuleApprox(FACE_PRESETS.calm[0]);
    expect(calm.ang).toBe(Math.PI / 2);
    expect(calm.halfLen).toBeCloseTo(0.296, 15);
    expect(calm.halfW).toBeCloseTo(0.247, 15);
    const neutral = capsuleApprox(FACE_PRESETS.neutral[0]);
    expect(neutral.ang).toBeCloseTo(0, 12);
    expect(neutral.halfLen).toBeCloseTo(0.155 + 0.13, 12);
    expect(neutral.halfW).toBeCloseTo(0.13, 15);
  });

  test("stadiumRing: 48 points; mix=0 lands on the capsule, mix=1 on the rounded rectangle", () => {
    const r0 = stadiumRing(0.3, 0.1, 0);
    expect(r0.length).toBe(48);
    expect(r0[0][0]).toBeCloseTo(0.1, 12);
    expect(r0[0][1]).toBeCloseTo(0, 12);
    expect(Math.abs(r0[12][0])).toBeLessThan(1e-6);
    expect(r0[12][1]).toBeCloseTo(0.3, 12);
    const r1 = stadiumRing(0.3, 0.1, 1);
    expect(r1[24][0]).toBeCloseTo(-0.1, 12);
    expect(Math.abs(r1[24][1])).toBeLessThan(1e-12);
    for (const [x, y] of r1) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  test("blendOval neutral→calm@.5: ovalMix=.875, fillRing 48 points, oval≈[.1885,.2905]", () => {
    const out = blendOval(FACE_PRESETS.neutral[0], FACE_PRESETS.calm[0], 0.5);
    expect(out.ovalMix).toBeCloseTo(0.875, 12);
    expect(out.fillRing?.length).toBe(48);
    expect(out.oval[0]).toBeCloseTo(0.1885, 12);
    expect(out.oval[1]).toBeCloseTo(0.2905, 12);
    expect(blendOval(FACE_PRESETS.neutral[0], FACE_PRESETS.calm[0], 0).wid).toBeCloseTo(0.13, 12);
  });

  test("blendStadium neutral→surprised@.5：wid=.17、off=[.015,0]、path 18", () => {
    const out = blendStadium(FACE_PRESETS.neutral[0], FACE_PRESETS.surprised[0], 0.5);
    expect(out.wid).toBeCloseTo(0.17, 12);
    expect(out.off[0]).toBeCloseTo(0.015, 12);
    expect(out.off[1]).toBeCloseTo(0, 12);
    expect(out.path?.length).toBe(18);
  });

  test("widenToOval(neutral,1): squashed to a horizontal ellipse with height=width·.42", () => {
    const out = widenToOval(FACE_PRESETS.neutral[0], 1);
    const box = boundsBox(out);
    closeTo(box.w, 0.26, 6);
    closeTo(box.h, 0.26 * 0.42, 6);
    expect(widenToOval(FACE_PRESETS.neutral[0], 0)).toBe(FACE_PRESETS.neutral[0]);
  });

  test("lidAnchor(neutral)=bottom+40% height; lidDrop(neutral,1): lidY=.03, moved up along the axis", () => {
    const eye = FACE_PRESETS.neutral[0];
    expect(lidAnchor(eye)).toBeCloseTo(-0.057, 12);
    const dropped = lidDrop(eye, 1);
    expect(dropped.lidY).toBeCloseTo(0.03, 15);
    expect(dropped.off[0]).toBeCloseTo(0, 12);
    expect(dropped.off[1]).toBeCloseTo(-0.057 * 0.97, 12);
    expect(lidDrop(eye, 0)).toBe(eye);
  });

  test("alignVertical: vertical spine straightened (tilt folded into 10°), horizontal spine untouched", () => {
    const tilted = capsuleX(0.26, 0.5, 10, 0);
    const aligned = alignVertical(tilted);
    expect(aligned.tilt).toBeCloseTo((10 * Math.PI) / 180, 10);
    const first = aligned.pts[0];
    const last = aligned.pts[aligned.pts.length - 1];
    expect(Math.abs(last[0] - first[0])).toBeLessThan(1e-9);
    expect(alignVertical(FACE_PRESETS.squinted[0])).toBe(FACE_PRESETS.squinted[0]);
  });

  test("collapseEye / resetOval", () => {
    const closed = collapseEye(FACE_PRESETS.calm[0]);
    expect(closed.wid).toBe(0);
    expect(closed.oval).toEqual([0, 0]);
    expect(resetOval({ ...FACE_PRESETS.calm[0], ovalMix: 0.7 }).ovalMix).toBe(0);
  });

  test("inspectScale: bias=0 equalizes both eyes to √(.27·.18); following turn=±20 swaps them fully", () => {
    const even = inspectScale(INSPECTING_PRESET, 1, { bias: 0 }, 0);
    expect(even[0].wid).toBeCloseTo(Math.sqrt(0.27 * 0.18), 12);
    expect(even[1].wid).toBeCloseTo(Math.sqrt(0.27 * 0.18), 12);
    const swapped = inspectScale(INSPECTING_PRESET, 1, { isFollowingTurn: true }, 20);
    expect(swapped[0].wid).toBeCloseTo(0.18, 12);
    expect(swapped[1].wid).toBeCloseTo(0.27, 12);
    const src = [FACE_PRESETS.neutral[0], FACE_PRESETS.neutral[0]];
    expect(inspectScale(src, 0, { bias: 0 }, 0)).toBe(src);
  });
});

import { describe, expect, test } from "vitest";
import type { EyeShape, MarkAppearance, MarkFrame } from "../types";
import type { Seat } from "../geometry/silhouette3d";
import { getSilhouette } from "../geometry/silhouette3d";
import { makeProjection, renderBodySilhouette } from "../geometry/project";
import {
  attachEyeLoops,
  bodyGeometry,
  buildBlendGeometry,
  buildBodySprite,
  eulerFromQuatAny,
  eyeLoopsFor,
  flatLoopsPath,
  lodStep,
  pathToPolylines,
  polygonsUnion,
  polygonsToPath,
  poseFromQuat,
  quantizeEuler,
  seatWrap,
  spriteToSvgNode,
  spriteTransform,
  wrap180,
  type PoseEuler,
} from "./bodyPaths";
import { quatFromEulerXYZ } from "../engine/math/quat";
import { serializeSvg } from "./svgTree";

const FRONT: PoseEuler = { yaw: 0, pitch: 0, roll: 0 };

const OVAL_EYE: EyeShape = {
  off: [0, 0],
  tilt: 0,
  wid: 0,
  lidY: 1,
  oval: [0.12, 0.18],
  ovalMix: 1,
  pts: [],
  path: null,
  fillRing: null,
};
const EYES: EyeShape[] = [OVAL_EYE, { ...OVAL_EYE }];

function makeFrame(over: Partial<MarkFrame> = {}): MarkFrame {
  return {
    body: "hex",
    quat: [1, 0, 0, 0],
    zoom: 1,
    offset: [0, 0],
    squash: [1, 1],
    squashAnchor: 0,
    eyes: EYES,
    glow: null,
    inspectWeight: 0,
    bodies: [],
    morph: null,
    ...over,
  };
}

const CUTOUT: MarkAppearance = { inkPaint: "#101010", spotPaint: null, cutout: true };
const SPOT: MarkAppearance = { inkPaint: "#101010", spotPaint: "#f5f5f5", cutout: false };

function circleFlat(cx: number, cy: number, r: number, n = 16): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

describe("LOD and pose quantization (Ip/Fp/Pp/Mp/Np)", () => {
  test("lodStep is always a power of 2; smaller sprite radius means a coarser step (size·zoom≤2 clamps to 32°)", () => {
    const clamped = lodStep(2, 1);
    const small = lodStep(16, 1);
    const mid = lodStep(256, 1);
    const fine = lodStep(256, 4);
    expect(clamped).toBe(32);
    expect(small).toBe(4);
    expect(mid).toBe(0.25);
    expect(fine).toBe(0.0625);
    for (const v of [clamped, small, mid, fine]) expect(Number.isInteger(Math.log2(v))).toBe(true);
    expect(fine).toBeLessThan(mid);
    expect(mid).toBeLessThan(small);
    expect(small).toBeLessThan(clamped);
  });

  test("wrap180: 90±.5 dead zone pushed away (≤90 pressed to 89.5, >90 pushed to 90.5), others unchanged", () => {
    expect(wrap180(90)).toBe(89.5);
    expect(wrap180(90.3)).toBeCloseTo(90.5, 10);
    expect(wrap180(89.6)).toBeCloseTo(89.5, 10);
    expect(wrap180(91)).toBe(91);
    expect(wrap180(-90)).toBe(-90.5);
    expect(wrap180(0)).toBe(0);
  });

  test("quantizeEuler rounds to the step (yaw/pitch go through wrap180, roll does not)", () => {
    const m = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
    const pose = quantizeEuler(m, 10);
    expect(pose.yaw).toBeCloseTo(0, 10);
    expect(pose.pitch).toBeCloseTo(0, 10);
    expect(pose.roll).toBeCloseTo(0, 10);
    const rad = (12 * Math.PI) / 180;
    const rz = [Math.cos(rad), -Math.sin(rad), 0, Math.sin(rad), Math.cos(rad), 0, 0, 0, 1] as const;
    expect(quantizeEuler(rz, 10).roll).toBe(10);
  });

  test("poseFromQuat: identity quat gives the 0 pose; non-hard-edge bodies take the complementary flip path", () => {
    const zero = poseFromQuat(makeFrame(), 256);
    expect(zero.yaw).toBeCloseTo(0, 10);
    expect(zero.pitch).toBeCloseTo(0, 10);
    expect(zero.roll).toBeCloseTo(0, 10);
    // rotY(180°): m22<0 → the Mp sign-flip matrix is exactly identity (back-facing pose folds back to front)
    const back = poseFromQuat(makeFrame({ quat: [0, 0, 1, 0] }), 1024);
    expect(back.yaw).toBeCloseTo(0, 10);
    expect(back.pitch).toBeCloseTo(0, 10);
    expect(back.roll).toBeCloseTo(0, 10);
    // rotY(100°): m22<0 → complementary flip to front-facing; the source pipeline ground truth is yaw=-80
    const r50 = (50 * Math.PI) / 180;
    const flipped = poseFromQuat(makeFrame({ quat: [Math.cos(r50), 0, Math.sin(r50), 0] }), 1024);
    expect(flipped.yaw).toBeCloseTo(-80, 1);
    expect(flipped.pitch).toBeCloseTo(0, 10);
    expect(flipped.roll).toBeCloseTo(0, 10);
  });

  // Regression: the complementary flip must negate the full third row AND column
  // (indices 0/2/3/5/6/8) so the matrix stays a proper rotation for tilted poses.
  // Ground truth (pitch 20, yaw 100, roll 10 in; m22<0) from the original engine
  // pipeline (Hr/Vr/Mp/Ur): pitch=-20, yaw=-80, roll=10.
  test("eulerFromQuatAny general pose (m22<0 with row/column coupling) gives the correct pose", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    const q = quatFromEulerXYZ(deg(20), deg(100), deg(10));
    const pose = eulerFromQuatAny(q, 0);
    expect(pose.pitch).toBeCloseTo(-20, 4);
    expect(pose.yaw).toBeCloseTo(-80, 4);
    expect(pose.roll).toBeCloseTo(10, 4);
  });
});

describe("eye rings (zp/tl/fl)", () => {
  test("eyeLoopsFor('hex', front pose) produces 2 ring paths (stadium layout)", () => {
    const loops = eyeLoopsFor("hex", FRONT, 256, EYES);
    expect(loops).toHaveLength(2);
    for (const d of loops) {
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
    }
  });

  test("eyeLoopsFor('bean') takes the puff branch and still produces 2 rings (ball-cloud puffAt)", () => {
    const loops = eyeLoopsFor("bean", FRONT, 256, EYES);
    expect(loops).toHaveLength(2);
    for (const d of loops) expect(d.endsWith("Z")).toBe(true);
  });

  test("eyeLoopsFor cache hit (same key returns the same reference)", () => {
    const a = eyeLoopsFor("hex", FRONT, 256, EYES);
    const b = eyeLoopsFor("hex", FRONT, 256, EYES);
    expect(b).toBe(a);
    const c = eyeLoopsFor("hex", FRONT, 128, EYES);
    expect(c).not.toBe(a);
  });

  test("back-facing pose makes the front seat invisible → empty rings", () => {
    expect(eyeLoopsFor("hex", { yaw: 0, pitch: 180, roll: 0 }, 256, EYES)).toEqual([]);
  });

  test("attachEyeLoops: seat=null (sphere stub) always empty", () => {
    const geom = getSilhouette("pumpkin");
    expect(geom.seat).toBeNull();
    expect(attachEyeLoops(geom, FRONT, 256, { loops: [], shiftY: 0 })).toEqual([]);
  });
});

describe("seat attachment thresholds (ml/hl, D:260-270)", () => {
  test("seatWrap angle clamp ±2.6: x=5 and x=2.6·radiusAt give the same output", () => {
    const geom = getSilhouette("pebble");
    const seat = geom.seat as Extract<Seat, { kind: "wrap" }>;
    expect(seat.kind).toBe("wrap");
    expect(seat.radiusAt).toBeDefined();
    const pose = { yaw: 180, pitch: 0, roll: 0 }; // yaw180 flips back-side points with z=cos(u)<0 onto the visible side
    const proj = makeProjection(geom, pose, 256);
    // Ring y all 0: after baseY clamping all points sit on the same latitude and radiusAt is identical (three fully isomorphic points, clamping equivalent and exactly comparable)
    const baseY = Math.min(seat.wrapY1 - 0.02, Math.max(seat.wrapY0 + 0.02, seat.eyeY));
    const yy = Math.min(seat.wrapY1, Math.max(seat.wrapY0, baseY));
    const radius = seat.radiusAt!(yy);
    const clamped = 2.6 * Math.max(0.12, radius);
    const over = seatWrap(seat, { loops: [[[5, 0], [5, 0], [5, 0]]], shiftY: 0 }, proj);
    const atClamp = seatWrap(seat, { loops: [[[clamped, 0], [clamped, 0], [clamped, 0]]], shiftY: 0 }, proj);
    expect(over.length).toBeGreaterThan(0);
    expect(atClamp.length).toBe(over.length);
    expect(over[0]!.length).toBe(atClamp[0]!.length);
    for (let i = 0; i < over[0]!.length; i++) {
      expect(over[0]![i]!.x).toBeCloseTo(atClamp[0]![i]!.x, 6);
      expect(over[0]![i]!.y).toBeCloseTo(atClamp[0]![i]!.y, 6);
    }
  });
});

describe("polygon union (nu/ru family, D:304-327)", () => {
  test("two overlapping circles → single path (one M)", () => {
    const union = polygonsUnion([circleFlat(100, 100, 30), circleFlat(130, 100, 30)]);
    expect(union).not.toBe("");
    expect(union.startsWith("M")).toBe(true);
    expect(union.endsWith("Z")).toBe(true);
    expect((union.match(/M/g) ?? []).length).toBe(1);
  });

  test("two disjoint circles → two M subpaths", () => {
    const union = polygonsUnion([circleFlat(60, 100, 30), circleFlat(260, 100, 30)]);
    expect((union.match(/M/g) ?? []).length).toBe(2);
    expect((union.match(/Z/g) ?? []).length).toBe(2);
  });

  test("polygonsToPath: single ring emitted directly; multiple rings go through the union", () => {
    const single = polygonsToPath([circleFlat(100, 100, 30)]);
    expect(single).toHaveLength(1);
    expect(single[0]!.startsWith("M")).toBe(true);
    const merged = polygonsToPath([circleFlat(100, 100, 30), circleFlat(130, 100, 30)]);
    expect(merged).toHaveLength(1);
    expect((merged[0]!.match(/M/g) ?? []).length).toBe(1);
  });

  test("flatLoopsPath with an empty ring group is an empty string", () => {
    expect(flatLoopsPath([])).toBe("");
  });

  // Golden ratios come from running the original source directly (res=160): sparkle .394, star6 .403, starFlower .395.
  for (const body of ["sparkle", "star6", "starFlower"] as const) {
    test(`${body} union is a single solid outline (area/res² ∈ [.35,.45])`, () => {
      const polys = renderBodySilhouette(getSilhouette(body), { yaw: 0, pitch: 0, roll: 0 }, 200);
      // The first two are complete cap-face rings (hundreds of points), not 4-point quads — direct evidence the cap face is present
      expect(polys[0]!.length / 2, `${body} first entry should be a complete ring`).toBeGreaterThan(100);
      expect(polys[1]!.length / 2, `${body} second entry should be a complete ring`).toBeGreaterThan(100);
      const path = polygonsUnion(polys);
      expect(path.startsWith("M")).toBe(true);
      const subs = path.split("M").filter((s) => s.length > 0);
      expect(subs.length, `${body} should be a single subpath`).toBe(1);
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
      expect(area, `${body} should have positive area`).toBeGreaterThan(0);
      expect(area / (200 * 200), `${body} solid coverage ratio`).toBeGreaterThan(0.35);
      expect(area / (200 * 200), `${body} solid coverage upper bound`).toBeLessThan(0.45);
    });
  }
});

describe("body paths (Lp/Bp, pumpkin stub)", () => {
  test("pumpkin stub = sphere result (body path fully equal at the same pose/res)", () => {
    const pumpkin = bodyGeometry("pumpkin", FRONT, 256, EYES);
    const sphere = bodyGeometry("sphere", FRONT, 256, null);
    expect(pumpkin.body).toEqual(sphere.body);
    expect(pumpkin.stem).toEqual([]);
    expect(pumpkin.eyes).toEqual([]);
  });

  test("bodyPathCache yawPeriod folding: yaw 0 and 5.625° (360/64) share the same key and reference", () => {
    const a = bodyGeometry("pebble", FRONT, 256, null).body;
    const b = bodyGeometry("pebble", { yaw: 360 / 64, pitch: 0, roll: 0 }, 256, null).body;
    expect(b).toBe(a);
  });
});

describe("sprite assembly (Up/Wp/kp/Ap/jp)", () => {
  test("spriteTransform: [sx,sy,tx,ty] hand-computed cross-check", () => {
    const frame = makeFrame();
    expect(spriteTransform(frame, 100, 50, 100)).toEqual([0.5, 0.5, 25, 25]);
    const moved = makeFrame({ zoom: 2, offset: [0.1, 0.2], squash: [1, 0.5], squashAnchor: 0.5 });
    expect(spriteTransform(moved, 100, 50, 100)).toEqual([0.5, 0.25, 35, -7.5]);
  });

  test("pathToPolylines: splits on Z into paired point arrays", () => {
    expect(pathToPolylines("M0 0 10 0 10 10Z")).toEqual([[[0, 0], [10, 0], [10, 10]]]);
    expect(pathToPolylines("M0 0 10 0 10 10ZM5 5 6 6 7 7Z")).toHaveLength(2);
    expect(pathToPolylines("M0 0 1 1Z")).toEqual([]);
  });

  test("buildBodySprite: size/sprite/transform and cutout eye fill", () => {
    const sprite = buildBodySprite(makeFrame(), CUTOUT, 256);
    expect(sprite.size).toBe(256);
    expect(sprite.sprite).toBe(Math.max(Math.round(256 / (184 / 256)), 144));
    expect(sprite.transform).toMatch(/^matrix\(/);
    expect(sprite.body.length).toBeGreaterThan(0);
    expect(sprite.eyes.length).toBe(2);
    expect(sprite.eyeFill).toBeNull();
    const spotSprite = buildBodySprite(makeFrame(), SPOT, 256);
    expect(spotSprite.eyeFill).toBe("#f5f5f5");
  });

  test("buildBlendGeometry: center/radius/polyline body and eyes", () => {
    const geo = buildBlendGeometry(makeFrame(), 256);
    expect(geo.radius).toBe(128);
    expect(geo.body.length).toBeGreaterThan(0);
    expect(geo.eyes).toHaveLength(2);
    for (const poly of geo.eyes) expect(poly.length).toBeGreaterThanOrEqual(3);
  });

  test("spriteToSvgNode: with cutout defs contains mask and body g; with spot contains inside fill", () => {
    const svg = serializeSvg(spriteToSvgNode(buildBodySprite(makeFrame(), CUTOUT, 256), "mk"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('<g id="mk-body"');
    expect(svg).toContain('<mask id="mk-holes"');
    expect(svg).toContain('mask="url(#mk-holes)"');
    const spot = serializeSvg(spriteToSvgNode(buildBodySprite(makeFrame(), SPOT, 256), "mk2"));
    expect(spot).toContain('<mask id="mk2-inside"');
    expect(spot).toContain("#f5f5f5");
    expect(spot).not.toContain("mk2-holes");
  });
});

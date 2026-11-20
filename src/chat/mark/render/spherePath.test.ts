import { describe, expect, test } from "vitest";
import type { EyeShape, GlowSpec, MarkAppearance, MarkFrame, Quat, Vec2 } from "../types";
import {
  buildSphereSprite,
  glowGradient,
  mixColor,
  paintHex,
  rgbPaint,
  sphereGeometry,
  sphereSpriteToSvgNode,
  sphereToSvg,
} from "./spherePath";
import type { EyeFrame } from "./eyesRender";
import { serializeSvg } from "./svgTree";

const IDENT: Quat = [1, 0, 0, 0];

const NEUTRAL_PTS: Vec2[] = [
  [0, -0.155],
  [0, 0.155],
];
const EYE: EyeShape = {
  off: [0, 0],
  tilt: 0,
  wid: 0.13,
  lidY: 1,
  oval: [0, 0],
  ovalMix: 0,
  pts: NEUTRAL_PTS,
  path: null,
  fillRing: null,
};

// Synthetic both-eye frame: eye0 front, eye1 tilted (flip=(C×T)·M<0 → true)
const FRAMES: EyeFrame[] = [
  { M: [0, 0, 1], T: [0, 1, 0], C: [1, 0, 0] },
  { M: [0.5, 0, 0.866], T: [0, 1, 0], C: [-0.866, 0, 0.5] },
];
const FLIP = [false, true];

function makeFrame(over: Partial<MarkFrame> = {}): MarkFrame {
  return {
    body: "sphere",
    quat: IDENT,
    zoom: 1,
    offset: [0, 0],
    squash: [1, 1],
    squashAnchor: 0,
    eyes: [EYE, EYE],
    glow: null,
    inspectWeight: 0,
    bodies: [],
    morph: null,
    ...over,
  };
}

const CUTOUT: MarkAppearance = { inkPaint: "#101010", spotPaint: null, cutout: true };
const SPOT: MarkAppearance = { inkPaint: "#101010", spotPaint: "#f5f5f5", cutout: false };

const GLOW: GlowSpec = {
  inner: [0.1, 0.2, 0.3],
  mid: [0.4, 0.5, 0.6],
  rim: [0.9, 0.9, 0.95],
  midT: 0.25,
  halo: 0,
};

describe("buildSphereSprite（dh）", () => {
  test("idle (identity quat) spot mode: body starts with M and ends with Z, contains A commands; eyes non-empty", () => {
    const sprite = buildSphereSprite(makeFrame(), SPOT, 120, FRAMES, FLIP);
    expect(sprite.size).toBe(120);
    expect(sprite.body.startsWith("M")).toBe(true);
    expect(sprite.body.endsWith("Z")).toBe(true);
    // Tm's two arcs (sweep=π) are each split by yh at π·.999 into two segments → 4 A commands
    expect(sprite.body.match(/A/g)?.length).toBe(4);
    expect(sprite.eyes).not.toBe("");
    expect(sprite.eyes.startsWith("M")).toBe(true);
    expect(sprite.eyes.endsWith("Z")).toBe(true);
    expect(sprite.glow).toBeNull();
  });

  test("cutout mode: eyes is an empty string, body carries the eye-cutout subpaths", () => {
    const sprite = buildSphereSprite(makeFrame(), CUTOUT, 120, FRAMES, FLIP);
    expect(sprite.eyes).toBe("");
    expect(sprite.body.endsWith("Z")).toBe(true);
    expect((sprite.body.match(/M/g) ?? []).length).toBe(3); // body ellipse + 2 eye holes
    expect(sprite.body.includes("A")).toBe(true);
  });

  test("zoom=0 / squash=0 degrades to an empty sprite", () => {
    const s1 = buildSphereSprite(makeFrame({ zoom: 0 }), CUTOUT, 120, FRAMES, FLIP);
    expect(s1).toEqual({ size: 120, body: "", eyes: "", glow: null });
    const s2 = buildSphereSprite(makeFrame({ squash: [0, 1] }), CUTOUT, 120, FRAMES, FLIP);
    expect(s2.body).toBe("");
  });
});

describe("sphereGeometry（ph）", () => {
  test("center / radius / 192-point body ring / both-eye polyline", () => {
    const geo = sphereGeometry(makeFrame(), 120, FRAMES, FLIP);
    expect(geo.center).toEqual([60, 60]);
    expect(geo.radius).toBe(60);
    expect(geo.body.length).toBe(192);
    expect(geo.body[0][0]).toBeCloseTo(120, 6);
    expect(geo.body[0][1]).toBeCloseTo(60, 6);
    expect(geo.eyes.length).toBe(2);
    for (const poly of geo.eyes) {
      expect(poly.length).toBeGreaterThanOrEqual(3);
      for (const p of poly) {
        expect(p[0]).toBeGreaterThan(0);
        expect(p[0]).toBeLessThan(120);
        expect(p[1]).toBeGreaterThan(0);
        expect(p[1]).toBeLessThan(120);
      }
    }
  });
});

describe("glow", () => {
  test("paintHex / rgbPaint / glowGradient stops", () => {
    expect(paintHex([1, 0, 0.5])).toBe("#ff0080");
    expect(rgbPaint([0, 0, 0])).toBe("rgb(0, 0, 0)");
    const g = glowGradient(GLOW, 100);
    expect(g.cx).toBe(50);
    expect(g.stops.map((s) => s.offset)).toEqual([0, 0.42 + 0.16 * 0.25, 0.93, 1]);
  });

  test("mixColor at offset=0 is exactly inner", () => {
    const blend = 0.42 + 0.16 * GLOW.midT;
    expect(mixColor(GLOW, blend, 0)).toEqual(GLOW.inner);
  });

  test("halo=0 → no halo; halo>0 → two-ring halo path", () => {
    const noHalo = buildSphereSprite(makeFrame({ glow: GLOW }), SPOT, 120, FRAMES, FLIP);
    expect(noHalo.glow).not.toBeNull();
    expect(noHalo.glow!.halo).toBeNull();
    const withHalo = buildSphereSprite(
      makeFrame({ glow: { ...GLOW, halo: 0.5 } }),
      SPOT,
      120,
      FRAMES,
      FLIP,
    );
    expect(withHalo.glow!.halo).not.toBeNull();
    expect((withHalo.glow!.halo!.d.match(/M/g) ?? []).length).toBe(2);
    expect(withHalo.glow!.halo!.gradient.stops.length).toBe(12); // 0..HALO_STOPS inclusive
  });
});

describe("sphereToSvg / sphereSpriteToSvgNode", () => {
  test("glow=null: no <radialGradient, body filled with ink; cutout has no eye path", () => {
    const sprite = buildSphereSprite(makeFrame(), CUTOUT, 120, FRAMES, FLIP);
    const svg = serializeSvg(sphereSpriteToSvgNode(sprite, CUTOUT));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("<radialGradient"); // glow=null → no gradient
    expect(svg).toContain('fill="#101010"');
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
  });

  test("glow present: exactly one body gradient; halo>0: an extra -halo gradient and halo path", () => {
    const withGlow = serializeSvg(
      sphereToSvg(buildSphereSprite(makeFrame({ glow: GLOW }), SPOT, 120, FRAMES, FLIP), SPOT),
    );
    expect((withGlow.match(/<radialGradient/g) ?? []).length).toBe(1);
    expect(withGlow).toContain('id="grok-sphere-body"');
    expect(withGlow).not.toContain("-halo");
    expect(withGlow).toContain('fill="url(#grok-sphere-body)"');

    const withHalo = serializeSvg(
      sphereToSvg(
        buildSphereSprite(makeFrame({ glow: { ...GLOW, halo: 0.5 } }), SPOT, 120, FRAMES, FLIP),
        SPOT,
      ),
    );
    expect((withHalo.match(/<radialGradient/g) ?? []).length).toBe(2);
    expect(withHalo).toContain('id="grok-sphere-halo"');
  });

  test("spot mode: eye path filled with spotPaint", () => {
    const svg = serializeSvg(
      sphereSpriteToSvgNode(buildSphereSprite(makeFrame(), SPOT, 120, FRAMES, FLIP), SPOT),
    );
    expect((svg.match(/<path/g) ?? []).length).toBe(2);
    expect(svg).toContain('fill="#f5f5f5"');
  });
});

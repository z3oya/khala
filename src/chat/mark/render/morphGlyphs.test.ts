import { describe, expect, test } from "vitest";
import type { EyeShape, MarkAppearance, MarkFrame, MorphSnapshot } from "../types";
import { renderMarkToNode } from "./renderFrame";
import {
  blendGeometry,
  closeRing,
  fillNaN,
  glyphToSvg,
  lerpOutline,
  polylinePath,
  renderGlyphs,
  signedArea,
  uniqueAngles,
} from "./morphGlyphs";
import { serializeSvg } from "./svgTree";

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
    bodies: [{ body: "hex", weight: 1 }],
    morph: null,
    ...over,
  };
}

function makeSnapshot(over: Partial<MorphSnapshot> = {}): MorphSnapshot {
  return {
    amount: 1,
    spin: 0,
    kind: null,
    outgoing: null,
    swap: 1,
    clock: { stateTime: 1, shotTime: 1 },
    outgoingClock: { stateTime: 0, shotTime: 0 },
    isReducedMotion: false,
    isSettled: true,
    ...over,
  };
}

const CUTOUT: MarkAppearance = { inkPaint: "#101010", spotPaint: null, cutout: true };

describe("renderGlyphs（Rg）", () => {
  test("progress: contains the progress.arc ring part, SVG has stroke-dasharray", () => {
    const layer = renderGlyphs(makeSnapshot({ kind: "progress" }), 256);
    const arc = layer.parts.find((p) => p.key === "progress.arc");
    expect(arc).toBeDefined();
    expect(arc!.type).toBe("ring");
    const node = glyphToSvg(arc!, "#000");
    expect(node.attrs["stroke-dasharray"]).toBeDefined();
    expect(String(node.attrs["stroke-dasharray"])).toContain(" ");
    expect(layer.parts.some((p) => p.key === "progress.track")).toBe(true);
  });

  test("dots: produces 2 discs", () => {
    const layer = renderGlyphs(makeSnapshot({ kind: "dots" }), 256);
    expect(layer.parts).toHaveLength(2);
    for (const p of layer.parts) {
      expect(p.type).toBe("disc");
      expect(p.key).toMatch(/^dots\.[01]$/);
      expect(p.opacity).toBeGreaterThan(0);
    }
  });

  test("standby: has the standby.halo disc", () => {
    const layer = renderGlyphs(makeSnapshot({ kind: "standby" }), 256);
    expect(layer.parts).toHaveLength(1);
    expect(layer.parts[0]!.key).toBe("standby.halo");
    expect(layer.parts[0]!.type).toBe("disc");
  });

  test("amount=0: parts empty after filtering, isFaceVisible=true", () => {
    const layer = renderGlyphs(makeSnapshot({ kind: "dots", amount: 0 }), 256);
    expect(layer.parts).toHaveLength(0);
    expect(layer.isFaceVisible).toBe(true);
    expect(renderGlyphs(makeSnapshot({ kind: "dots" }), 256).isFaceVisible).toBe(false);
  });

  test("swap overlap: parts of outgoing and kind appear at the same time", () => {
    const layer = renderGlyphs(
      makeSnapshot({ kind: "progress", outgoing: "dots", swap: 0.5 }),
      256,
    );
    const keys = layer.parts.map((p) => p.key);
    expect(keys.some((k) => k.startsWith("dots."))).toBe(true);
    expect(keys).toContain("progress.arc");
  });

  test("core.round goes from 0 to 1 with amount (easeInOutCubic)", () => {
    expect(renderGlyphs(makeSnapshot({ kind: "dots", amount: 0 }), 256).core.round).toBe(0);
    expect(renderGlyphs(makeSnapshot({ kind: "dots", amount: 1 }), 256).core.round).toBe(1);
    const half = renderGlyphs(makeSnapshot({ kind: "dots", amount: 0.31 }), 256).core.round;
    expect(half).toBeCloseTo(4 * 0.5 ** 3, 5);
  });
});

describe("polar resampling family", () => {
  test("signedArea / closeRing / polylinePath basics", () => {
    const cw: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    expect(signedArea(cw)).toBe(-1); // clockwise is negative in y-down screen coordinates
    const path = closeRing(cw);
    expect(path.stations[0]).toBe(0);
    expect(path.stations[path.stations.length - 1]).toBe(1);
    expect(polylinePath(path.points)).toMatch(/^M/);
    expect(polylinePath([])).toBe("");
  });

  test("fillNaN: fills holes with nearest-ring interpolation", () => {
    expect(fillNaN([NaN, 1, NaN, 3])).toEqual([2, 1, 2, 3]);
  });

  test("uniqueAngles / lerpOutline", () => {
    expect(uniqueAngles([[0], [0.0000000001], [1], [1.5]])).toEqual([0, 1, 1.5]);
    expect(lerpOutline([[0, 0], [10, 20]], [[10, 10], [30, 40]], 0.5)).toEqual([[5, 5], [20, 30]]);
  });
});

describe("blendGeometry（Ug）", () => {
  test("multi-body: weighted silhouette point count = angle column length; eyes go through blendEyes", () => {
    const frame = makeFrame({
      bodies: [
        { body: "hex", weight: 0.7 },
        { body: "square", weight: 0.3 },
      ],
    });
    const geom = blendGeometry(frame, 256);
    expect(geom.body.length).toBeGreaterThan(32);
    expect(geom.eyes.length).toBeGreaterThan(0);
    expect(geom.painted).toEqual([]);
    expect(geom.markScale).toBeCloseTo((0.6 * 256) / 2 / 114.2705, 6);
    expect(geom.head).toBeNull();
  });

  test("with morph: head non-empty, parts non-empty, body blended via round", () => {
    const frame = makeFrame({ morph: makeSnapshot({ kind: "progress" }) });
    // glyphSize 120: sizeFade>0 ((120-44)/90≈.84), zoom gate open → zoom>1 (progress Ih=1.32)
    const geom = blendGeometry(frame, 256, 120);
    expect(geom.head).not.toBeNull();
    expect(geom.parts.length).toBeGreaterThan(0);
    expect(geom.paintedOpacity).toBe(0);
    expect(geom.zoom).toBeGreaterThan(1);
  });
});

describe("renderMarkToNode (Qg dispatch)", () => {
  test("single sphere: svg contains path; with eye cutout defs contains mask", () => {
    const svg = serializeSvg(renderMarkToNode(makeFrame({ body: "sphere", bodies: [{ body: "sphere", weight: 1 }] }), CUTOUT, 120, "m1"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
    expect(svg).toContain("evenodd");
    expect(svg).toContain('id="m1"');
  });

  test("single hex: cutout → defs contains holes mask; spot → inside-mask fill", () => {
    const svg = serializeSvg(renderMarkToNode(makeFrame(), CUTOUT, 256, "m2"));
    expect(svg).toContain('id="m2-body"');
    expect(svg).toContain('<mask id="m2-holes"');
    expect(svg).toContain('mask="url(#m2-holes)"');
    // spot mode of the jp sprite path uses the inside mask (only the blend path uses clipPath)
    const spot = serializeSvg(
      renderMarkToNode(makeFrame(), { inkPaint: "#101010", spotPaint: "#fff", cutout: false }, 256, "m3"),
    );
    expect(spot).toContain('<mask id="m3-inside"');
    expect(spot).toContain('mask="url(#m3-inside)"');
    expect(spot).toContain('fill="#fff"');
    expect(spot).not.toContain("m3-holes");
  });

  test("morph frame: parts appear and body scaling applies (g transform contains scale)", () => {
    const frame = makeFrame({ morph: makeSnapshot({ kind: "progress" }) });
    const svg = serializeSvg(renderMarkToNode(frame, CUTOUT, 256, "m4"));
    expect(svg).toMatch(/<g transform="[^"]*scale\(/);
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain('id="m4-holes"');
  });

  test("displaySize passes through as SVG width/height", () => {
    const svg = serializeSvg(renderMarkToNode(makeFrame(), CUTOUT, 256, "m5", { displaySize: 64 }));
    expect(svg).toContain('width="64"');
    expect(svg).toContain('height="64"');
    expect(svg).toContain('viewBox="0 0 256 256"');
  });

  test("multi-body without morph → blend path (single-path body)", () => {
    const frame = makeFrame({
      bodies: [
        { body: "hex", weight: 0.5 },
        { body: "sphere", weight: 0.5 },
      ],
    });
    const svg = serializeSvg(renderMarkToNode(frame, CUTOUT, 256, "m6"));
    expect(svg).toContain("<path");
    expect(svg).not.toContain('id="m6-glow"');
  });
});

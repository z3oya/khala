import { describe, expect, it } from "vitest";
import { approach, gazeDecay, gazeRotation, GAZE_GAIN, pointerToGaze } from "./gaze";
import { LOOK_PRESETS } from "./looks";

describe("gaze", () => {
  it("gazeDecay keeps 86% per frame", () => {
    expect(gazeDecay(1 / 60)).toBeCloseTo(0.14);
    expect(gazeDecay(0)).toBe(0);
  });

  it("gazeRotation sphere and non-sphere coefficients", () => {
    expect(gazeRotation("sphere", 1, 1)).toEqual({ rx: -14, ry: 18, px: 0.03, py: 0.024 });
    expect(gazeRotation("cloud", 1, 1)).toEqual({ rx: -19, ry: 26, px: 0.07, py: 0.055 });
    expect(gazeRotation("heartChubby", 1, 1).rx).toBeCloseTo(-19 * 0.6);
  });

  it("pointerToGaze zero at center, y inverted, clamped to 1 out of range", () => {
    const rect = { left: 0, top: 0, width: 100, height: 50 };
    const center = pointerToGaze(rect, { x: 50, y: 25 });
    expect(center[0]).toBeCloseTo(0);
    expect(Math.abs(center[1])).toBeCloseTo(0);
    expect(pointerToGaze(rect, { x: 150, y: 0 })).toEqual([0.5, 0.125]);
    expect(pointerToGaze(rect, { x: 1e4, y: -1e4 })).toEqual([1, 1]);
  });

  it("approach snaps to the target within the convergence threshold", () => {
    expect(approach(0, 1, 0.5)).toBe(0.5);
    expect(approach(0.9996, 1, 0)).toBe(1);
    expect(approach(0.99, 1, 0)).toBe(0.99);
    expect(GAZE_GAIN).toBe(0.55);
  });
});

describe("LOOK_PRESETS (Ua)", () => {
  it("five direction presets", () => {
    expect(LOOK_PRESETS.left).toEqual({ rot: [0, -20, 0], pos: [-0.1, 0] });
    expect(LOOK_PRESETS.right).toEqual({ rot: [0, 20, 0], pos: [0.1, 0] });
    expect(LOOK_PRESETS.up).toEqual({ rot: [-20, 0, 0], pos: [0, 0.1] });
    expect(LOOK_PRESETS.down).toEqual({ rot: [20, 0, 0], pos: [0, -0.1] });
    expect(LOOK_PRESETS.center).toEqual({ rot: [0, 0, 0], pos: [0, 0] });
  });
});

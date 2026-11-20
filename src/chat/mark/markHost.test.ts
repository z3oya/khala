/** markHost pure logic: props normalization / resolution / diff dispatch decision / smoke test of handles without DOM. */
import { describe, expect, it } from "vitest";
import type { MarkAppearance, MarkHostProps } from "./types";
import {
  computeResolution,
  createMarkHost,
  normalizeMarkHostProps,
  planUpdate,
} from "./markHost";
import type { NormalizedMarkHostProps } from "./markHost";

const APP: MarkAppearance = { inkPaint: "#17171c", spotPaint: null, cutout: true };

function norm(patch: Partial<MarkHostProps> = {}): NormalizedMarkHostProps {
  return normalizeMarkHostProps({
    id: "t",
    body: "sphere",
    appearance: APP,
    size: 100,
    ...patch,
  });
}

describe("normalizeMarkHostProps", () => {
  it("fills in defaults", () => {
    const p = norm();
    expect(p.id).toBe("t");
    expect(p.body).toBe("sphere");
    expect(p.clip).toBeNull();
    expect(p.morph).toBeNull();
    expect(p.fill).toBe(0.6);
    expect(p.resolution).toBeUndefined();
    expect(p.maxFrameRate).toBe(60);
    expect(p.isPlaying).toBe(true);
    expect(p.isEmphasized).toBe(false);
    expect(p.isFollowingPointer).toBe(false);
    expect(p.isStatic).toBe(false);
    expect(p.isProof).toBe(false);
  });

  it("keeps explicit values with state/resolution defaulted", () => {
    const clip = { duration: 1, tracks: {} };
    const p = norm({ fill: 1, maxFrameRate: 30, isPlaying: false, state: "idle", clip, resolution: 42 });
    expect(p.fill).toBe(1);
    expect(p.maxFrameRate).toBe(30);
    expect(p.isPlaying).toBe(false);
    expect(p.state).toBe("idle");
    expect(p.clip).toBe(clip);
    expect(p.resolution).toBe(42);
    expect(norm().state).toBeUndefined();
  });
});

describe("computeResolution", () => {
  it("explicit resolution wins", () => {
    expect(computeResolution(160, 0.6, 42)).toBe(42);
  });

  it("fill=.6 equals size (BASE_ZOOM cancels out)", () => {
    expect(computeResolution(160, 0.6)).toBe(160);
    expect(computeResolution(56, 0.6)).toBe(56);
  });

  it("other fill values scale by fill/BASE_ZOOM and round to two decimals", () => {
    expect(computeResolution(100, 1)).toBe(166.67); // 100/.6 = 166.666…
    expect(computeResolution(100, 0.3)).toBe(50);
  });

  it("size 0 → 0 (the render guard skips it)", () => {
    expect(computeResolution(0, 0.6)).toBe(0);
  });
});

describe("planUpdate (O diff decision, C:197-199)", () => {
  const NO_PLAN = {
    body: false, clip: false, morph: false, state: false, isEmphasized: false,
    playing: false, repaint: false, size: false, isFollowingPointer: false, loop: false,
  };

  it("identical props dispatch nothing", () => {
    const a = norm();
    const t = norm();
    expect(planUpdate(a, t, false)).toEqual(NO_PLAN);
  });

  it("single-field changes each hit (body/clip/morph/state/isEmphasized)", () => {
    expect(planUpdate(norm(), norm({ body: "cloud" }), false)).toEqual({ ...NO_PLAN, body: true });
    const clip = { duration: 1, tracks: {} };
    expect(planUpdate(norm(), norm({ clip }), false)).toEqual({ ...NO_PLAN, clip: true });
    expect(planUpdate(norm(), norm({ morph: "orbit" }), false)).toEqual({ ...NO_PLAN, morph: true });
    expect(planUpdate(norm(), norm({ state: "idle" }), false)).toEqual({ ...NO_PLAN, state: true });
    expect(planUpdate(norm(), norm({ isEmphasized: true }), false)).toEqual({ ...NO_PLAN, isEmphasized: true });
  });

  it("any change to appearance/fill/resolution/isProof → repaint", () => {
    const other: MarkAppearance = { inkPaint: "#000", spotPaint: "#fff", cutout: false };
    expect(planUpdate(norm(), norm({ appearance: other }), false)).toEqual({ ...NO_PLAN, repaint: true });
    expect(planUpdate(norm(), norm({ fill: 1 }), false)).toEqual({ ...NO_PLAN, repaint: true });
    expect(planUpdate(norm(), norm({ resolution: 42 }), false)).toEqual({ ...NO_PLAN, repaint: true });
    expect(planUpdate(norm(), norm({ isProof: true }), false)).toEqual({ ...NO_PLAN, repaint: true });
  });

  it("isPlaying flip → playing (active state only)", () => {
    expect(planUpdate(norm(), norm({ isPlaying: false }), false)).toEqual({ ...NO_PLAN, playing: true });
    // In the degraded (isStatic) path live is always false, so a playing flip is swallowed
    expect(planUpdate(norm({ isStatic: true }), norm({ isStatic: true, isPlaying: false }), false))
      .toEqual(NO_PLAN);
  });

  it("maxFrameRate / isStatic flip → loop rebuild", () => {
    expect(planUpdate(norm(), norm({ maxFrameRate: 30 }), false)).toEqual({ ...NO_PLAN, loop: true });
    // An isStatic flip also flips live true→false: both playing and loop fire
    expect(planUpdate(norm(), norm({ isStatic: true }), false))
      .toEqual({ ...NO_PLAN, playing: true, loop: true });
    // Under reducedMotion an isStatic flip does not change the degraded state
    expect(planUpdate(norm(), norm({ isStatic: true }), true)).toEqual(NO_PLAN);
  });

  it("size / isFollowingPointer each hit", () => {
    expect(planUpdate(norm(), norm({ size: "fill" }), false)).toEqual({ ...NO_PLAN, size: true });
    expect(planUpdate(norm(), norm({ isFollowingPointer: true }), false))
      .toEqual({ ...NO_PLAN, isFollowingPointer: true });
  });
});

describe("createMarkHost (no attach, DOM observers not created)", () => {
  const fakeRenderer = () => ({ tag: "svg", attrs: {}, children: [] });

  it("all handles usable and nothing rendered before attach", () => {
    const host = createMarkHost(
      { id: "t", body: "sphere", appearance: APP, state: "idle", size: 100, seed: "x" },
      fakeRenderer,
    );
    expect(() => {
      host.setState("working");
      host.setBody("cloud");
      host.setPlaying(false);
      host.setPlaying(true);
      host.setExpression("happy");
      host.blink();
      host.look("left");
      host.restart();
      host.poke("spin", { turns: 2 });
      host.gaze([0.5, -0.5]);
      host.update({ size: "fill", isFollowingPointer: true, fill: 1 });
      host.update({ isStatic: true, body: "egg" });
    }).not.toThrow();
  });

  it("isStatic host takes the degraded path (pause+seek+advance×60) without throwing", () => {
    const host = createMarkHost(
      { id: "t", body: "sphere", appearance: APP, state: "idle", size: 100, isStatic: true },
      fakeRenderer,
    );
    expect(() => host.update({ body: "cloud" })).not.toThrow();
  });
});

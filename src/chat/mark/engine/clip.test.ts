import { describe, expect, it } from "vitest";
import { CLIPS } from "../data/clips.generated";
import type { FaceName } from "../types";
import {
  angleDelta,
  BASE_ZOOM,
  blinkEnvelope,
  BRIDGE_EASE,
  DEFAULT_EASE,
  makeBridge,
  normalizeClip,
  restPose,
  sampleTrack,
  wrapAngle,
} from "./clip";

const blockedRaw = CLIPS[0]!;
const blocked = normalizeClip(blockedRaw);

describe("normalizeClip (Ia)", () => {
  it("CLIPS[0]=Blocked_A: duration 2.12, body sphere, rotation 7 keys", () => {
    expect(blockedRaw.name).toBe("Blocked_A");
    expect(blocked.duration).toBe(2.12);
    expect(blocked.body).toBe("sphere");
    expect(blocked.rotation).toHaveLength(7);
  });

  it("scale track normalized to zoom", () => {
    expect(Object.keys(blockedRaw.tracks)).toContain("scale");
    expect(Object.keys(blockedRaw.tracks)).not.toContain("zoom");
    expect(blocked.zoom).toHaveLength(blockedRaw.tracks.scale!.length);
    expect(blocked.zoom[0]!.t).toBe(blockedRaw.tracks.scale![0]!.t);
  });

  it("expression v:'blink' injects the lids envelope and sorts it", () => {
    const idleB = CLIPS.find((c) => c.name === "Idle_B")!;
    const rawBlink = idleB.tracks.expression!.filter((k) => k.v === "blink");
    expect(rawBlink.length).toBeGreaterThan(0);
    const clip = normalizeClip(idleB);
    for (const k of rawBlink) {
      const [a, b, c] = blinkEnvelope(k.t);
      const ts = clip.lids.map((f) => f.t);
      expect(ts).toContain(a.t);
      expect(ts).toContain(b.t);
      expect(ts).toContain(c.t);
    }
    const lidsTs = clip.lids.map((f) => f.t);
    expect([...lidsTs].sort((x, y) => x - y)).toEqual(lidsTs);
    expect(clip.lids.some((f) => f.v[0] === 1)).toBe(true);
  });

  it("expression events normalized to names and cut mapped to isThroughBlink", () => {
    const wf = CLIPS.find((c) => c.name === "Working_F")!;
    const clip = normalizeClip(wf);
    const last = clip.expression[clip.expression.length - 1]!;
    expect(last.name).toBe("neutral");
    expect(last.isThroughBlink).toBe(false);
    expect(clip.expression[0]!.isThroughBlink).toBe(false);
    const synth = normalizeClip({ duration: 1, tracks: { expression: [{ t: 0, v: "happy", cut: false }] } });
    expect(synth.expression[0]!.isThroughBlink).toBe(true);
    expect(synth.expression[0]!.name).toBe("happy");
  });

  it("blinkEnvelope is the 3-key [0,1,0]", () => {
    const env = blinkEnvelope(1);
    expect(env.map((k) => k.v[0])).toEqual([0, 1, 0]);
    expect(env[1]!.t).toBeCloseTo(1 + 0.26 * 0.45);
    expect(env[2]!.t).toBeCloseTo(1.26);
  });
});

describe("sampleTrack (La)", () => {
  const track = [
    { t: 0, v: [1], ease: DEFAULT_EASE },
    { t: 1, v: [3], ease: DEFAULT_EASE },
  ];

  it("endpoint sampling", () => {
    expect(sampleTrack(track, -1)).toEqual([1]);
    expect(sampleTrack(track, 0)).toEqual([1]);
    expect(sampleTrack(track, 2)).toEqual([3]);
  });

  it("midpoint interpolation", () => {
    expect(sampleTrack(track, 0.5)![0]).toBeCloseTo(2);
  });

  it("empty track returns null", () => {
    expect(sampleTrack([], 0)).toBeNull();
  });
});

describe("bridge (za/Ba/Ha)", () => {
  const pose = (over: Partial<ReturnType<typeof restPose>> = {}) => ({
    rot: [0, 0, 0],
    pos: [0, 0],
    scl: [1, 1],
    zoom: BASE_ZOOM,
    lids: 0,
    expr: "neutral" as FaceName,
    squashAnchor: 0,
    ...over,
  });

  it("wrapAngle wraps to the nearer side", () => {
    expect(wrapAngle(350, 0)).toBe(-10);
    expect(wrapAngle(0, 350)).toBe(360);
    expect(angleDelta(350, 10)).toBeCloseTo(20);
  });

  it("makeBridge 0.35s two keys, rotation target wraps", () => {
    const from = pose();
    const to = pose({ rot: [350, -350, 10], pos: [0.2, 0.2] });
    const bridge = makeBridge(from, to);
    expect(bridge.duration).toBe(0.35);
    expect(bridge.position).toHaveLength(2);
    expect(bridge.rotation[0]!.t).toBe(0);
    expect(bridge.rotation[1]!.t).toBeCloseTo(0.35);
    expect(bridge.rotation[0]!.v).toEqual([0, 0, 0]);
    expect(bridge.rotation[1]!.v).toEqual([-10, 10, 10]);
    expect(bridge.rotation[0]!.ease).toEqual(BRIDGE_EASE);
    expect(bridge.rotation[1]!.ease).toEqual(DEFAULT_EASE);
    expect(bridge.lids).toEqual([]);
  });
});

describe("restPose (Ra)", () => {
  it("Blocked_A restTime=0 takes the first key", () => {
    const pose = restPose(blocked);
    expect(pose.rot).toEqual(blocked.rotation[0]!.v);
    expect(pose.pos).toEqual(blocked.position[0]!.v);
    expect(pose.zoom).toBeCloseTo(blocked.zoom[0]!.v[0]!);
    expect(pose.expr).toBe(blocked.expression[0]!.name);
    expect(pose.expr).toBe("confused");
  });
});

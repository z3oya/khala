import { describe, expect, it } from "vitest";
import { CLIPS } from "../data/clips.generated";
import { createPuppet } from "./puppet";

const blocked = CLIPS[0]!;

function advance(p: ReturnType<typeof createPuppet>, dt: number, steps: number): void {
  for (let i = 0; i < steps; i++) p.advance(dt);
}

describe("createPuppet (eo)", () => {
  it("load + advance(1/60)×130: loops, pose finite, body sphere", () => {
    const p = createPuppet();
    p.load(blocked);
    expect(p.isPlaying).toBe(true);
    expect(p.duration).toBe(2.12);
    advance(p, 1 / 60, 130);
    expect(p.loopCount).toBeGreaterThanOrEqual(1);
    const f = p.frame();
    expect(f.body).toBe("sphere");
    for (const q of f.quat) expect(Number.isFinite(q)).toBe(true);
    expect(f.eyes).not.toBeNull();
    expect(f.eyes!.length).toBe(2);
    expect(f.bodies).toEqual([{ body: "sphere", weight: 1 }]);
  });

  it("after setGaze the pose offsets (pe pulls the pose directly while not playing)", () => {
    const p = createPuppet();
    p.load(blocked);
    advance(p, 1 / 60, 30);
    p.stop();
    const before = p.frame().quat;
    p.setGaze([0.5, 0.5]);
    advance(p, 1 / 60, 30);
    const after = p.frame().quat;
    expect(after).not.toEqual(before);
  });

  it("poke('spin') changes the pose", () => {
    const p = createPuppet();
    p.load(blocked);
    p.stop();
    advance(p, 1 / 60, 5);
    const before = p.frame().quat;
    p.poke("spin");
    advance(p, 1 / 60, 10);
    expect(p.frame().quat).not.toEqual(before);
  });

  it("rest(): bridges first (0.35s while playing) then stops on completion", () => {
    const p = createPuppet();
    p.load(blocked);
    expect(p.isPlaying).toBe(true);
    p.rest();
    expect(p.isPlaying).toBe(true);
    expect(p.duration).toBe(0.35);
    advance(p, 1 / 60, 25);
    expect(p.isPlaying).toBe(false);
    expect(Number.isFinite(p.frame().quat[0])).toBe(true);
  });

  it("loading the same clip name twice does not bridge; different names bridge", () => {
    const p = createPuppet();
    p.load(blocked);
    p.load(blocked);
    expect(p.loopCount).toBe(0);
    const idleB = CLIPS.find((c) => c.name === "Idle_B")!;
    p.load(idleB);
    expect(p.duration).toBe(0.35);
    advance(p, 1 / 60, 30);
    expect(p.duration).toBe(idleB.duration);
    expect(p.isPlaying).toBe(true);
  });

  it("after setMorph frame().morph is non-empty and advances", () => {
    const p = createPuppet();
    p.load(blocked);
    p.setMorph("orbit");
    p.advance(1 / 60);
    const snap = p.frame().morph;
    expect(snap).not.toBeNull();
    expect(snap!.kind).toBe("orbit");
    expect(snap!.amount).toBeGreaterThan(0);
    advance(p, 1 / 60, 60);
    expect(p.frame().morph!.amount).toBeGreaterThan(0.5);
    expect(p.frame().eyes).toBeNull();
  });

  it("look triggers the orientation animation then falls back", () => {
    const p = createPuppet();
    p.load(blocked);
    p.stop();
    advance(p, 1 / 60, 5);
    const before = p.frame().quat;
    p.look("left");
    advance(p, 1 / 60, 40);
    const after = p.frame().quat;
    expect(after).not.toEqual(before);
  });

  it("setBody enters the blend list and converges", () => {
    const p = createPuppet();
    p.load(blocked);
    p.setBody("cloud");
    advance(p, 1 / 60, 10);
    const mix = p.frame().bodies;
    expect(mix.map((b) => b.body).sort()).toEqual(["cloud", "sphere"]);
    advance(p, 1 / 60, 200);
    expect(p.frame().bodies).toEqual([{ body: "cloud", weight: 1 }]);
    expect(p.frame().body).toBe("cloud");
  });

  it("glow clock drives midT", () => {
    const p = createPuppet();
    p.load(blocked);
    p.setGlow({ inner: [0, 0, 0], mid: [0, 0, 0], rim: [0, 0, 0], midT: 0, halo: 1 });
    p.advance(0.43);
    expect(p.frame().glow!.midT).toBeCloseTo(0.5 + 0.5 * Math.sin(0.5));
  });
});

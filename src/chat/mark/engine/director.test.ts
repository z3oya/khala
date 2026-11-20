import { describe, expect, it } from "vitest";
import { DIRECTOR_TABLE } from "../data/director.generated";
import { createPuppet } from "./puppet";
import { createDirector } from "./director";

describe("createDirector (go)", () => {
  it("blocked: after advance(121) transitions to drowsy (holdSeconds=120)", () => {
    const p = createPuppet();
    const d = createDirector(p, "blocked", { seed: 7 });
    expect(d.state).toBe("blocked");
    expect(p.isPlaying).toBe(true);
    d.advance(121);
    expect(d.state).toBe("drowsy");
  });

  it("waking: after advance(1.7) transitions to idle (holdSeconds=1.6)", () => {
    const p = createPuppet();
    const d = createDirector(p, "waking", { seed: 1 });
    d.advance(1.7);
    expect(d.state).toBe("idle");
  });

  it("same-seed shuffle is reproducible: same first clip name", () => {
    const a = createDirector(createPuppet(), "idle", { seed: 42 });
    const b = createDirector(createPuppet(), "idle", { seed: 42 });
    expect(a.clip).toBe(b.clip);
    expect(DIRECTOR_TABLE.idle.clips).toContain(a.clip);
  });

  it("isCompact gates compactClips", () => {
    const p = createPuppet();
    const d = createDirector(p, "idle", { seed: 9, isCompact: true });
    expect(d.clip).toBe("Idle_B");
    expect(DIRECTOR_TABLE.idle.compactClips).toEqual(["Idle_B"]);
  });

  it("isResting: constructed at rest, loads a clip once released", () => {
    const p = createPuppet();
    const d = createDirector(p, "idle", { seed: 3, isResting: true });
    expect(p.isPlaying).toBe(false);
    expect(d.clip).toBeNull();
    d.setResting(false);
    expect(p.isPlaying).toBe(true);
    expect(d.clip).not.toBeNull();
  });

  it("morph state passes through the director table", () => {
    const p = createPuppet();
    createDirector(p, "thinking", { seed: 1 });
    p.advance(1 / 60);
    expect(p.frame().morph).not.toBeNull();
    expect(p.frame().morph!.kind).toBe("dots");
  });

  it("face holding: blocked has no face → after emphasis opens, falls back to surprised and suppresses clip events", () => {
    const p = createPuppet();
    const d = createDirector(p, "blocked", { seed: 1 });
    d.setEmphasis(true);
    expect(p.face).toBe("surprised");
    advanceTo(p, 2);
    expect(p.face).toBe("surprised");
  });
});

function advanceTo(p: ReturnType<typeof createPuppet>, seconds: number): void {
  const steps = Math.ceil(seconds / (1 / 60));
  for (let i = 0; i < steps; i++) p.advance(1 / 60);
}

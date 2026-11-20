import { describe, expect, it } from "vitest";
import { bell, pokeContribution, pokeDuration } from "./pokes";

describe("pokeDuration (ra)", () => {
  it("spin linear in turns", () => {
    expect(pokeDuration({ poke: "spin", turns: 1 })).toBeCloseTo(0.9);
    expect(pokeDuration({ poke: "spin", turns: 2 })).toBeCloseTo(1.3);
    expect(pokeDuration({ poke: "spin", turns: 3 })).toBeCloseTo(1.7);
  });
  it("bounce/nod fixed", () => {
    expect(pokeDuration({ poke: "bounce", turns: 1 })).toBe(0.62);
    expect(pokeDuration({ poke: "nod", turns: 1 })).toBe(0.5);
  });
});

describe("pokeContribution (ia)", () => {
  it("spin turns=2 gives yaw=360 at e=.5", () => {
    const dur = pokeDuration({ poke: "spin", turns: 2 });
    const r = pokeContribution([{ poke: "spin", t: dur * 0.5, turns: 2 }]);
    expect(r.yaw).toBeCloseTo(360);
    expect(r.pitch).toBe(0);
    expect(r.squash).toEqual([1, 1]);
  });

  it("bounce at e=.5 has lift>0 and a biased squash", () => {
    const dur = pokeDuration({ poke: "bounce", turns: 1 });
    const r = pokeContribution([{ poke: "bounce", t: dur * 0.5, turns: 1 }]);
    expect(r.lift).toBeCloseTo(0.3, 5);
    expect(r.squash[0]).toBeCloseTo(0.96);
    expect(r.squash[1]).toBeCloseTo(1.06);
  });

  it("nod peaks at pitch=16 degrees", () => {
    const dur = pokeDuration({ poke: "nod", turns: 1 });
    const r = pokeContribution([{ poke: "nod", t: dur * 0.5, turns: 1 }]);
    expect(r.pitch).toBeCloseTo(16);
  });

  it("after finishing: bounce/nod contributions zero, spin's final value exactly a full 360", () => {
    const r = pokeContribution([{ poke: "nod", t: 10, turns: 1 }, { poke: "bounce", t: 10, turns: 1 }]);
    expect(r.pitch).toBe(0);
    expect(r.yaw).toBe(0);
    expect(r.lift).toBeCloseTo(0);
    expect(r.squash).toEqual([1, 1]);
    const spin = pokeContribution([{ poke: "spin", t: 10, turns: 1 }]);
    expect(spin.yaw).toBeCloseTo(360);
    expect(spin.pitch).toBe(0);
    expect(spin.lift).toBeCloseTo(0);
  });
});

describe("bell (aa)", () => {
  it("0 outside the interval, 1 at the midpoint", () => {
    expect(bell(-1, 0, 1)).toBe(0);
    expect(bell(0, 0, 1)).toBe(0);
    expect(bell(1, 0, 1)).toBe(0);
    expect(bell(0.5, 0, 1)).toBeCloseTo(1);
    expect(bell(0.5, 0.18, 0.82)).toBeCloseTo(1);
  });
});

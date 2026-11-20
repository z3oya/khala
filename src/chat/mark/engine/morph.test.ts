import { describe, expect, it } from "vitest";
import type { GlyphKind } from "../types";
import { createMorphController, holdFor, MORPH_STATE_TO_GLYPH } from "./morph";

describe("createMorphController (Sa)", () => {
  it("after set, amount rises from 0", () => {
    const c = createMorphController();
    c.set("progress");
    expect(c.snapshot().amount).toBe(0);
    for (let i = 0; i < 30; i++) c.advance(1 / 60);
    const s = c.snapshot();
    expect(s.amount).toBeGreaterThan(0);
    expect(s.amount).toBeLessThan(1.0001);
    expect(s.kind).toBe("progress");
    expect(MORPH_STATE_TO_GLYPH.progress).toBe("progress");
  });

  it("kind converted to GlyphKind via pa", () => {
    const c = createMorphController();
    c.set("powering-down");
    c.advance(1 / 60);
    expect(c.snapshot().kind).toBe("standby");
  });

  it("HOLD duty cycle: progress holds 2.5s then amount hides, returns after RESUME_AFTER 1.5s", () => {
    const c = createMorphController();
    c.set("progress");
    const amounts: number[] = [];
    const kinds: (GlyphKind | null)[] = [];
    for (let i = 0; i < 55; i++) {
      c.advance(0.1);
      amounts.push(c.snapshot().amount);
      kinds.push(c.snapshot().kind);
    }
    expect(kinds.every((k) => k === "progress")).toBe(true);
    expect(Math.min(...amounts.slice(26, 44))).toBeLessThan(0.05);
    expect(amounts[amounts.length - 1]).toBeGreaterThan(0.9);
    expect(holdFor("progress")).toBe(2.5);
    expect(holdFor("spawning")).toBe(2);
  });

  it("set(null) settles after converging", () => {
    const c = createMorphController();
    c.set("orbit");
    c.advance(1 / 60);
    c.set(null);
    c.settle();
    const s = c.snapshot();
    expect(s.kind).toBeNull();
    expect(s.outgoing).toBeNull();
    expect(s.isSettled).toBe(true);
    expect(s.amount).toBe(0);
  });

  it("reducedMotion lands immediately", () => {
    const c = createMorphController({ isReducedMotion: true });
    c.set("orbit");
    c.advance(1 / 60);
    const s = c.snapshot();
    expect(s.amount).toBe(1);
    expect(s.isReducedMotion).toBe(true);
    expect(s.isSettled).toBe(true);
  });

  it("settle forces all three springs into place", () => {
    const c = createMorphController();
    c.set("radar");
    c.settle();
    expect(c.snapshot().amount).toBe(1);
  });
});

/** agentIdentity resolution determinism tests: any drift in the hash chain shifts the default shape/color for the same agentId. */
import { describe, expect, it } from "vitest";
import { defaultColorFor, defaultShapeFor, resolveAgentIdentity, resolveMenuIdentity } from "./agentIdentity";
import { PICKER_SHAPES, MENUBAR_SHAPE_SET, DEFAULT_SHAPE_SET } from "../data/shapes.generated";

const IDS = ["bot-1", "alpha", "café-bot", "", "x".repeat(64)];

describe("agentIdentity", () => {
  it("determinism: two resolutions of the same agentId are fully equal", () => {
    for (const id of IDS) {
      expect(resolveAgentIdentity({ agentId: id })).toEqual(resolveAgentIdentity({ agentId: id }));
    }
  });

  it("explicit preferences win; invalid values fall back to hash defaults", () => {
    const withShape = resolveAgentIdentity({ agentId: "bot-1", avatarShape: "hex", avatarColor: "red" });
    expect(withShape).toEqual({ shape: "hex", color: "red" });
    const bad = resolveAgentIdentity({ agentId: "bot-1", avatarShape: "horseshoe", avatarColor: "crimson" });
    expect(bad).toEqual(resolveAgentIdentity({ agentId: "bot-1" }));
  });

  it("default landing: shape ∈ picker vocabulary (or pumpkin), color ≠ black", () => {
    for (const id of IDS) {
      const { shape, color } = resolveAgentIdentity({ agentId: id });
      expect([...PICKER_SHAPES, "pumpkin"]).toContain(shape);
      expect(color).not.toBe("black");
    }
  });

  it("menu-scope default shape comes from the 13-shape set; main scope from the 8-shape set", () => {
    for (const id of IDS.slice(0, 3)) {
      expect(MENUBAR_SHAPE_SET).toContain(resolveMenuIdentity({ agentId: id }).shape);
      expect(DEFAULT_SHAPE_SET).toContain(resolveAgentIdentity({ agentId: id }).shape);
    }
    expect(new Set(IDS.map(defaultShapeFor)).size).toBeGreaterThan(1);
    expect(new Set(IDS.map(defaultColorFor)).size).toBeGreaterThan(1);
  });
});

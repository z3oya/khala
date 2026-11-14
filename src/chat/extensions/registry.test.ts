/* Registry + routing tests over fixture providers; the suite holds with and
 * without providers/ present because it never imports providers/*. */
import { describe, expect, it } from "vitest";
import { createFencedRegistry, resolveCodeRoute } from "./registry";
import type { FencedBlockExtension } from "./types";

const fixture = (id: string, langs: string[]): FencedBlockExtension => ({
  id,
  langs,
  load: async () => {
    throw new Error("fixtures are never loaded");
  },
});

describe("createFencedRegistry", () => {
  it("looks up by any declared lang", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa", "bbb"]));
    expect(reg.lookup("aaa")?.id).toBe("a");
    expect(reg.lookup("bbb")?.id).toBe("a");
  });

  it("normalizes the lookup lang (case + surrounding whitespace)", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa"]));
    expect(reg.lookup("  AAA ")).toBe(reg.lookup("aaa"));
    expect(reg.lookup("  AAA ")?.id).toBe("a");
  });

  it("misses for unclaimed langs", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa"]));
    expect(reg.lookup("ts")).toBeUndefined();
    expect(reg.lookup("")).toBeUndefined();
  });

  it("first registration wins on a lang collision", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("first", ["aaa"]));
    reg.register(fixture("second", ["aaa", "ccc"]));
    expect(reg.lookup("aaa")?.id).toBe("first");
    expect(reg.lookup("ccc")?.id).toBe("second");
  });

  it("skips empty normalized langs", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["  "]));
    expect(reg.lookup("")).toBeUndefined();
  });
});

describe("resolveCodeRoute", () => {
  it("routes a closed fence with a claimed lang to the extension", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa"]));
    expect(resolveCodeRoute(true, "aaa", reg)?.id).toBe("a");
  });

  it("routes by normalized lang", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa"]));
    expect(resolveCodeRoute(true, "AAA", reg)?.id).toBe("a");
  });

  it("routes an unclosed fence to plain code even when the lang is claimed", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa"]));
    expect(resolveCodeRoute(false, "aaa", reg)).toBeNull();
  });

  it("routes a closed fence with an unclaimed lang to plain code", () => {
    const reg = createFencedRegistry();
    reg.register(fixture("a", ["aaa"]));
    expect(resolveCodeRoute(true, "ts", reg)).toBeNull();
  });
});

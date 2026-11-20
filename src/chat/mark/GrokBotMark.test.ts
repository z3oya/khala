/** GrokBotMark props → MarkHostProps mapping (pure function buildHostProps); DOM behavior is out of vitest scope. */
import { describe, expect, it } from "vitest";
import { buildHostProps, DEFAULT_MARK_SIZE_PX } from "./GrokBotMark";

describe("buildHostProps defaults", () => {
  it("empty props → sphere/idle/playing/default size", () => {
    const h = buildHostProps({}, "inst1");
    expect(h.id).toBe("inst1");
    expect(h.body).toBe("sphere"); // blob → sphere (pickerToBody alias)
    expect(h.state).toBe("idle");
    expect(h.size).toBe(DEFAULT_MARK_SIZE_PX);
    expect(h.isPlaying).toBe(true);
    expect(h.isEmphasized).toBe(false);
    expect(h.isFollowingPointer).toBe(false);
    expect(h.maxFrameRate).toBeUndefined();
    expect(h.seed).toBeUndefined();
  });

  it("default appearance ink uses the CSS var with cutout eyes", () => {
    const h = buildHostProps({}, "i");
    expect(h.appearance.inkPaint).toBe("var(--grok-bot-ink)");
    expect(h.appearance.spotPaint).toBeNull();
    expect(h.appearance.cutout).toBe(true);
  });
});

describe("buildHostProps mapping", () => {
  it("ink/eyeColor overrides (eyeColor given → filled eyes)", () => {
    const h = buildHostProps({ ink: "#123456", eyeColor: "#fff" }, "i");
    expect(h.appearance.inkPaint).toBe("#123456");
    expect(h.appearance.spotPaint).toBe("#fff");
    expect(h.appearance.cutout).toBe(false);
  });

  it("shape mapped through pickerToBody aliases", () => {
    expect(buildHostProps({ shape: "flower" }, "i").body).toBe("starFlower");
    expect(buildHostProps({ shape: "heart" }, "i").body).toBe("heartChubby");
    expect(buildHostProps({ shape: "star" }, "i").body).toBe("star6");
    expect(buildHostProps({ shape: "pebble" }, "i").body).toBe("pebble"); // same-name pass-through
  });

  it("isPaused → isPlaying=false；sourceId → seed", () => {
    const h = buildHostProps({ isPaused: true, sourceId: "agent-42" }, "i");
    expect(h.isPlaying).toBe(false);
    expect(h.seed).toBe("agent-42");
  });

  it("size resolution: sizePx / pure px string value / fill and non-px strings go to fill / fallback constant", () => {
    expect(buildHostProps({ sizePx: 160 }, "i").size).toBe(160);
    expect(buildHostProps({ sizeCss: "120px" }, "i").size).toBe(120);
    expect(buildHostProps({ sizeCss: "fill" }, "i").size).toBe("fill");
    expect(buildHostProps({ sizeCss: "50%" }, "i").size).toBe("fill"); // non-px strings are measured by ResizeObserver
    expect(buildHostProps({}, "i").size).toBe(DEFAULT_MARK_SIZE_PX);
  });

  it("passes through maxFrameRate/isEmphasized/isFollowingPointer/state", () => {
    const h = buildHostProps(
      { maxFrameRate: 30, isEmphasized: true, isFollowingPointer: true, state: "working" },
      "i",
    );
    expect(h.maxFrameRate).toBe(30);
    expect(h.isEmphasized).toBe(true);
    expect(h.isFollowingPointer).toBe(true);
    expect(h.state).toBe("working");
  });
});

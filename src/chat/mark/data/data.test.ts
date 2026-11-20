/* Generated-data contract tests (pure import assertions, no SRC dependency; numeric baselines = spec §8 + research §4.1).
 * SRC-side extraction/assertions are handled by tools/extractEngineData.mjs. */
import { describe, expect, it } from "vitest";
import { CLIPS } from "./clips.generated";
import { DIRECTOR_TABLE, WORKING_CLIPS } from "./director.generated";
import { EYE_ANCHORS } from "./eyeAnchors.generated";
import {
  ALL_SHAPE_IDS,
  BODY_VOCAB,
  DEFAULT_SHAPE_SET,
  MENUBAR_SHAPE_SET,
  PICKER_SHAPES,
  RECIPE_BODY_ALIAS,
  SEASONAL_SHAPES,
  STATES,
  STATIC_EYE_SEATS,
} from "./shapes.generated";
import { FLAT_COLORS, GRADIENT_PAIRS, PALETTE } from "./appearance.generated";

/** types.ts MarkState union (53 members; same set as SRC sn/lo). */
const MARK_STATES = [
  "idle", "listening", "thinking", "streaming", "searching", "reading",
  "working", "coding", "running", "computing", "controlling", "waiting",
  "blocked", "finished", "failed", "sleeping", "waking",
  "happy", "excited", "laughing", "proud", "curious", "playful",
  "shy", "surprised", "suspicious", "angry", "confused", "sad",
  "drowsy", "bored", "scared", "celebrate", "approving",
  "orbit", "radar", "progress", "spawning", "loading", "dictating",
  "sending", "receiving", "uploading", "writing", "alerting",
  "bouncing", "powering-down",
  "humming", "notifying", "dragging",
  "logo", "showcase", "turntable",
] as const;

/** The 28 clips of research §4.1 (name → duration seconds). */
const EXPECTED_CLIPS: Record<string, number> = {
  Idle_A: 6, Idle_B: 4, Idle_D: 6,
  Working_A: 8, Working_B: 4.8, Working_C: 5, Working_D: 5, Working_E: 4, Working_F: 5,
  Streaming_A: 2.6, Streaming_B: 2.6, Streaming_C: 2.4,
  Blocked_A: 2.12, Blocked_B: 3, Blocked_C: 1.4,
  Done_A: 3.7, Done_B: 1.8, Done_C: 2,
  Logo_A: 4, Logo_B: 4,
  Marketing_A: 4, Marketing_B: 4, Marketing_C: 4, Marketing_D: 4,
  Rotation_A: 6, Rotation_B: 10, Rotation_C: 4,
  Bodymoves_A: 5,
};

describe("clips.generated (src: oo)", () => {
  it("has exactly the 28 clips from research §4.1 with matching durations", () => {
    expect(CLIPS).toHaveLength(28);
    expect(new Set(CLIPS.map((c) => c.name))).toEqual(new Set(Object.keys(EXPECTED_CLIPS)));
    for (const c of CLIPS) {
      expect(c.duration, c.name ?? "?").toBe(EXPECTED_CLIPS[c.name ?? ""]);
    }
  });

  it("CLIPS[0] is Blocked_A with duration 2.12 and full-precision ease curves", () => {
    const first = CLIPS[0];
    expect(first.name).toBe("Blocked_A");
    expect(first.duration).toBeCloseTo(2.12, 10);
    const kf = first.tracks.position?.[0];
    expect(kf?.t).toBe(0);
    expect(kf?.ease).toEqual([0.7968976121829217, 0.023358873568246466, 0.25805236576790014, 0.9399472349279558]);
  });

  it("keeps raw track names and string expression values", () => {
    const trackNames = new Set(CLIPS.flatMap((c) => Object.keys(c.tracks)));
    for (const name of trackNames) {
      expect(["position", "rotation", "squash", "scale", "zoom", "lids", "expression"]).toContain(name);
    }
    const exprEvents = CLIPS.flatMap((c) => c.tracks.expression ?? []).map((e) => e.v);
    expect(exprEvents.length).toBeGreaterThan(0);
    expect(exprEvents.every((v) => typeof v === "string")).toBe(true);
  });
});

describe("director.generated (src: co + lo)", () => {
  it("WORKING_CLIPS is the Working_A..F pool", () => {
    expect(WORKING_CLIPS).toEqual(["Working_A", "Working_B", "Working_C", "Working_D", "Working_E", "Working_F"]);
  });

  it("covers exactly the 53 MarkState keys", () => {
    expect(Object.keys(DIRECTOR_TABLE)).toHaveLength(53);
    expect(new Set(Object.keys(DIRECTOR_TABLE))).toEqual(new Set(MARK_STATES));
  });

  it("blocked: next=drowsy with holdSeconds=120; waking holds 1.6s to idle", () => {
    expect(DIRECTOR_TABLE.blocked.next).toBe("drowsy");
    expect(DIRECTOR_TABLE.blocked.holdSeconds).toBe(120);
    expect(DIRECTOR_TABLE.waking).toMatchObject({ face: "surprised", next: "idle", holdSeconds: 1.6 });
  });

  it("idle plays a 5-clip weighted playlist with 1 compact clip", () => {
    expect(DIRECTOR_TABLE.idle.clips).toHaveLength(5);
    expect(DIRECTOR_TABLE.idle.compactClips).toEqual(["Idle_B"]);
  });

  it("working-family states share the Working pool; every clips list is non-empty", () => {
    for (const s of ["reading", "working", "coding", "running", "computing", "controlling"] as const) {
      expect(DIRECTOR_TABLE[s].clips).toEqual(WORKING_CLIPS);
    }
    for (const s of MARK_STATES) {
      expect(DIRECTOR_TABLE[s].clips.length, s).toBeGreaterThan(0);
      const clipNames = new Set(CLIPS.map((c) => c.name));
      for (const n of DIRECTOR_TABLE[s].clips) expect(clipNames.has(n), `${s}:${n}`).toBe(true);
    }
  });

  it("face/morph/next values stay inside their unions", () => {
    const faces = new Set(["neutral", "happy", "surprised", "sad", "sleepy", "squinted", "calm", "inspecting", "confused"]);
    const morphs = new Set([
      "thinking", "orbit", "radar", "progress", "spawning", "dictating", "sending", "receiving",
      "uploading", "bouncing", "writing", "alerting", "powering-down",
    ]);
    for (const s of MARK_STATES) {
      const e = DIRECTOR_TABLE[s];
      if (e.face !== undefined) expect(faces.has(e.face), `${s}.face=${e.face}`).toBe(true);
      if (e.morph !== undefined) expect(morphs.has(e.morph), `${s}.morph=${e.morph}`).toBe(true);
      if (e.next !== undefined) expect(MARK_STATES.includes(e.next), `${s}.next=${e.next}`).toBe(true);
    }
  });
});

describe("eyeAnchors.generated (src: qr)", () => {
  it("holds the two eye capsules' nine spec §3.1 numbers each", () => {
    expect(EYE_ANCHORS).toHaveLength(2);
    expect(EYE_ANCHORS[0]).toEqual({
      A: [0.01722, 0.45638, 0.88962],
      B: [0.186, 0.20949, 0.95996],
      N: [0.82924, 0.4906, -0.26773],
    });
    expect(EYE_ANCHORS[1]).toEqual({
      A: [0.48863, 0.67924, 0.54762],
      B: [0.65674, 0.43195, 0.61815],
      N: [0.60389, 0.18972, -0.77416],
    });
  });
});

describe("shapes.generated (src: ei/wa/sn/cn/ln/un/fn/pn/Oo)", () => {
  it("BODY_VOCAB has the 26 engine body ids", () => {
    expect(BODY_VOCAB).toHaveLength(26);
    expect(BODY_VOCAB[0]).toBe("sphere");
    expect(BODY_VOCAB).toContain("pumpkin");
    expect(new Set(BODY_VOCAB).size).toBe(26);
  });

  it("RECIPE_BODY_ALIAS keeps 7 source aliases incl. arch→horseshoe verbatim", () => {
    expect(RECIPE_BODY_ALIAS).toEqual({
      blob: "sphere",
      sphereWide: "sphere",
      arch: "horseshoe",
      spark: "sparkle",
      star: "star6",
      heart: "heartChubby",
      hexagon: "hex",
    });
  });

  it("STATES flattens to the 53 states in group order", () => {
    expect(STATES).toEqual(MARK_STATES);
    expect(STATES[0]).toBe("idle");
    expect(STATES[STATES.length - 1]).toBe("turntable");
  });

  it("shape sets: picker 25, seasonal 1 gated pumpkin, all 26, default 8, menubar 13", () => {
    expect(PICKER_SHAPES).toHaveLength(25);
    expect(SEASONAL_SHAPES).toEqual([{ shape: "pumpkin", pickerGate: "sand_pumpkin_2026", pickerColor: "orange" }]);
    expect(ALL_SHAPE_IDS).toHaveLength(26);
    expect(ALL_SHAPE_IDS[ALL_SHAPE_IDS.length - 1]).toBe("pumpkin");
    expect(DEFAULT_SHAPE_SET).toEqual(["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"]);
    expect(MENUBAR_SHAPE_SET).toEqual([
      "blob", "cloud", "square", "sparkle", "clover", "heart", "flower",
      "teardrop", "tablet", "wedge", "house", "star", "hex",
    ]);
  });

  it("STATIC_EYE_SEATS covers the 24 non-sphere bodies; hex is the base ratios", () => {
    const seats = Object.keys(STATIC_EYE_SEATS);
    expect(seats).toHaveLength(24);
    expect(seats).not.toContain("sphere");
    expect(seats).not.toContain("pumpkin");
    expect(STATIC_EYE_SEATS.hex).toEqual({ width: 0.26, height: 0.57, gap: 0.64, shiftY: 0.12 });
    expect(STATIC_EYE_SEATS.cloud.width).toBeCloseTo(0.21294, 10);
  });
});

describe("appearance.generated (src: rn/lr/dr)", () => {
  it("PALETTE is the 11 colors with exact hex values", () => {
    expect(PALETTE).toHaveLength(11);
    expect(PALETTE[0]).toEqual({ id: "black", label: "Black", value: "#000" });
    expect(PALETTE.map((p) => p.value).join(",")).toBe(
      "#000,#936439,#FF263C,#FF6700,#FF9800,#00C972,#00BCA6,#1084FE,#9159FE,#FF309B,#777777",
    );
  });

  it("gradient and flat pairs cover all 11 color ids", () => {
    expect(Object.keys(GRADIENT_PAIRS)).toHaveLength(11);
    expect(GRADIENT_PAIRS.black).toEqual({ lightFrom: "#585858", lightTo: "#000000", darkFrom: "#FFFFFF", darkTo: "#C2C2C2" });
    expect(Object.keys(FLAT_COLORS)).toHaveLength(11);
    expect(FLAT_COLORS.black).toEqual({ light: "#000000", dark: "#FFFFFF" });
  });
});

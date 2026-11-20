import { describe, expect, test } from "vitest";
import {
  FACE_ALIAS,
  FACE_NAMES,
  FACE_PRESETS,
  SLEEPY_CLASS,
  blinkEnvelopeAt,
  blinkOpenCurve,
  blinkWindow,
  canDirectMorph,
  createFaceModule,
  getAlignQuat,
  getEyeFlip,
  getEyeFrames,
  getMeanEyeDir,
  getRestEuler,
  isSleepyClass,
  normalizeFace,
  selectMorphPath,
} from "./faces";
import type { ExpressionEvent } from "../types";

describe("faces / vocabulary", () => {
  test("FACE_NAMES 9 items, FACE_ALIAS 8 items, SLEEPY_CLASS 5 items", () => {
    expect(FACE_NAMES.length).toBe(9);
    expect(FACE_NAMES[0]).toBe("neutral");
    expect(FACE_ALIAS.size).toBe(8);
    expect(FACE_ALIAS.get("thinking")).toBe("sad");
    expect(FACE_ALIAS.get("sleep")).toBe("sleepy");
    expect(SLEEPY_CLASS.size).toBe(5);
    for (const n of ["sad", "happy", "confused", "squinted", "sleepy"]) expect(isSleepyClass(n)).toBe(true);
    for (const n of ["neutral", "surprised", "calm", "inspecting"]) expect(isSleepyClass(n)).toBe(false);
  });

  test("normalizeFace: alias/case/whitespace/unknown", () => {
    expect(normalizeFace("smile")).toBe("happy");
    expect(normalizeFace("  HAPPY ")).toBe("happy");
    expect(normalizeFace("inspect")).toBe("inspecting");
    expect(normalizeFace("unknown-face")).toBe("neutral");
    expect(normalizeFace("squint")).toBe("squinted");
  });

  test("canDirectMorph: through-blink class and oval eyes are false", () => {
    for (const f of ["neutral", "surprised", "inspecting"] as const) expect(canDirectMorph(f)).toBe(true);
    for (const f of ["sad", "happy", "confused", "squinted", "sleepy", "calm"] as const) expect(canDirectMorph(f)).toBe(false);
  });

  test("selectMorphPath: oval/spine/stadium three branches", () => {
    const neutral = FACE_PRESETS.neutral;
    const happy = FACE_PRESETS.happy;
    const calm = FACE_PRESETS.calm;
    expect(selectMorphPath(neutral, calm, false)).toBe("oval");
    expect(selectMorphPath(neutral, happy, true)).toBe("spine");
    expect(selectMorphPath(neutral, FACE_PRESETS.surprised, false)).toBe("stadium");
    expect(selectMorphPath(calm, happy, true)).toBe("spine");
  });
});

describe("faces / blink envelope", () => {
  test("blinkWindow：min(.28, (isBlink?Dr:Er)/max(dur,.05))", () => {
    const blink = blinkWindow(true, 0.26);
    expect(blink.u1).toBeCloseTo(0.36615384615384617, 12);
    expect(blink.u2 - blink.u1).toBeCloseTo((2 / 60) / 0.26, 12);
    const morph = blinkWindow(false, 0.28);
    expect(morph.u2 - morph.u1).toBeCloseTo((4.25 / 60) / 0.28, 12);
    const capped = blinkWindow(true, 0.001);
    expect(capped.u2 - capped.u1).toBeCloseTo(0.28, 12);
  });

  test("blinkOpenCurve: 0→0, .35→.795, .7→1.06 overshoot, 1→1", () => {
    expect(blinkOpenCurve(0)).toBeCloseTo(0, 12);
    expect(blinkOpenCurve(0.35)).toBeCloseTo(0.75 * 1.06, 12);
    expect(blinkOpenCurve(0.7)).toBeCloseTo(1.06, 12);
    expect(blinkOpenCurve(1)).toBeCloseTo(1, 10);
  });

  test("blinkEnvelopeAt: sampled at t=0/.45/1 (dur=Tr)", () => {
    const win = blinkWindow(true, 0.26);
    expect(blinkEnvelopeAt(0, win)).toBeCloseTo(0, 12);
    expect(blinkEnvelopeAt(0.45, win)).toBe(1);
    const end = blinkEnvelopeAt(1, win);
    expect(end).toBeGreaterThanOrEqual(0);
    expect(end).toBeLessThanOrEqual(1e-9);
  });
});

describe("faces / eye anchor derivation", () => {
  test("getEyeFrames: 2 frames, M/T/C normalized and mutually orthogonal", () => {
    const frames = getEyeFrames();
    expect(frames.length).toBe(2);
    const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const { M, T, C } of frames) {
      for (const v of [M, T, C]) expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 10);
      expect(Math.abs(dot(M, T))).toBeLessThan(1e-10);
      expect(Math.abs(dot(M, C))).toBeLessThan(1e-10);
      expect(Math.abs(dot(T, C))).toBeLessThan(1e-10);
    }
  });

  test("getMeanEyeDir / getAlignQuat: unit quantities, mean direction toward +Z", () => {
    const dir = getMeanEyeDir();
    expect(Math.hypot(dir[0], dir[1], dir[2])).toBeCloseTo(1, 12);
    expect(dir[2]).toBeGreaterThan(0);
    const q = getAlignQuat();
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 12);
  });

  test("getRestEuler components finite; getEyeFlip boolean array length 2", () => {
    for (const v of getRestEuler()) expect(Number.isFinite(v)).toBe(true);
    const flip = getEyeFlip();
    expect(flip.length).toBe(2);
    for (const v of flip) expect(typeof v).toBe("boolean");
  });
});

describe("faces / createFaceModule", () => {
  test("initial state: neutral, no transition, blinkAmount=null", () => {
    const face = createFaceModule();
    expect(face.name).toBe("neutral");
    expect(face.isMorphing).toBe(false);
    expect(face.blinkAmount()).toBeNull();
    expect(face.inspectWeight()).toBe(0);
    const eyes = face.eyes();
    expect(eyes.length).toBe(2);
    expect(eyes[0].wid).toBeCloseTo(0.13, 12);
  });

  test("morph('happy'): isMorphing=true, after step(.3) converges to name='happy'", () => {
    const face = createFaceModule();
    face.morph("happy");
    expect(face.isMorphing).toBe(true);
    expect(face.name).toBe("happy");
    expect(face.eyes()[0].wid).toBeCloseTo(0.13, 6);
    face.step(0.3);
    expect(face.isMorphing).toBe(false);
    expect(face.name).toBe("happy");
    const eyes = face.eyes();
    expect(eyes[0].path?.length).toBe(18);
    expect(eyes[1].wid).toBeCloseTo(0.1305, 12);
  });

  test("morph('inspecting'): inspectWeight converges to 1, both eyes .27/.18", () => {
    const face = createFaceModule();
    face.morph("inspecting");
    expect(face.inspectWeight()).toBeGreaterThanOrEqual(0);
    face.step(0.28);
    expect(face.inspectWeight()).toBe(1);
    expect(face.eyes()[0].wid).toBeCloseTo(0.27, 12);
    expect(face.eyes()[1].wid).toBeCloseTo(0.18, 12);
    face.morph("neutral");
    face.step(0.28);
    expect(face.inspectWeight()).toBe(0);
  });

  test("blink() has no effect during morph; after commit blink runs the envelope and resets", () => {
    const face = createFaceModule();
    face.morph("calm");
    face.blink();
    expect(face.blinkAmount()).toBeNull();
    face.step(0.3);
    face.blink();
    expect(face.blinkAmount()).toBeCloseTo(0, 12);
    face.step(0.1);
    expect(face.blinkAmount()).toBeCloseTo(1, 6);
    face.step(0.16);
    expect(face.blinkAmount()).toBeNull();
    expect(face.isMorphing).toBe(false);
    expect(face.name).toBe("calm");
  });

  test("play: same name/target does not retrigger; isThroughBlink goes through lidMorph (the current face must also be non-through-blink)", () => {
    const face = createFaceModule();
    face.morph("happy");
    face.play({ t: 0, name: "happy", isThroughBlink: false });
    expect(face.isMorphing).toBe(true);
    face.step(0.3);
    face.play({ t: 0, name: "surprised", isThroughBlink: true });
    face.step(0.3);
    expect(face.name).toBe("surprised");

    const fresh = createFaceModule();
    fresh.play({ t: 0, name: "surprised", isThroughBlink: true });
    expect(fresh.isMorphing).toBe(true);
    fresh.step(0.1);
    expect(fresh.eyes()[0].lidY).toBeLessThan(1);
    fresh.step(0.3);
    expect(fresh.name).toBe("surprised");
    expect(fresh.isMorphing).toBe(false);
    expect(fresh.eyes()[0].wid).toBeCloseTo(0.21, 12);
  });

  test("seek replays the expression sequence and holds", () => {
    const face = createFaceModule();
    const events: ExpressionEvent[] = [
      { t: 0, name: "happy", isThroughBlink: false },
      { t: 0.5, name: "surprised", isThroughBlink: true },
    ];
    face.seek(events, 1.2);
    expect(face.name).toBe("surprised");
    expect(face.isMorphing).toBe(false);
    expect(face.eyes()[0].wid).toBeCloseTo(0.21, 12);
    expect(face.blinkAmount()).toBeNull();
  });

  test("seek mid-hold: step does not advance, continues after release", () => {
    const face = createFaceModule();
    const events: ExpressionEvent[] = [{ t: 0, name: "surprised", isThroughBlink: true }];
    face.seek(events, 0.2);
    expect(face.name).toBe("surprised");
    expect(face.isMorphing).toBe(false);
    const heldLid = face.eyes()[0].lidY;
    expect(heldLid).toBeGreaterThan(0.03);
    expect(heldLid).toBeLessThan(1);
    face.step(0.5);
    expect(face.eyes()[0].lidY).toBeCloseTo(heldLid, 12);
    face.release();
    face.step(0.5);
    expect(face.eyes()[0].lidY).toBe(1);
    expect(face.eyes()[0].path?.length).toBe(18);
  });
});

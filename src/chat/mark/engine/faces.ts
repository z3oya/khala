/**
 * Expression presets + expression module + eye anchor derived frames. Preset angle units = radians, geometry units = eye-local coordinates.
 */
import type { EyeShape, ExpressionEvent, FaceModule, FaceName, Quat, Vec3 } from "../types";
import { EYE_ANCHORS } from "../data/eyeAnchors.generated";
import { DEG, mat3MulVec, quatAxisAngle, quatBetween, quatMul, quatToEuler, quatToMat3 } from "./math/quat";
import { bezierSolve } from "./math/bezier";
import { smoothstep01 } from "./math/spring";
import {
  INSPECTING_PRESET,
  NEUTRAL_WID,
  STROKE_WID,
  blendOval,
  blendSpine,
  blendStadium,
  bothEyes,
  capsuleX,
  collapseEye,
  isClosedShape,
  isInspectingFlag,
  isOvalEye,
  lidDrop,
  makeEye,
  ovalEye,
  pairMap,
  resetOval,
} from "./eyesModel";

// ── Blink/blend envelope constants ───────────────

// morph progress easing / morph duration / lidMorph (through-blink switch) duration / blink duration
const MORPH_EASE: readonly [number, number, number, number] = [0.4, 0.06, 0.18, 1];
const MORPH_DUR = 0.28;
const LID_MORPH_DUR = 0.35;
const BLINK_DUR = 0.26;
// Closed-phase durations: lidMorph uses 4.25/60, blink uses 2/60; open-phase overshoot amplitude 1.06
const MORPH_CLOSE_DUR = 4.25 / 60;
const BLINK_CLOSE_DUR = 2 / 60;
const OVERSHOOT = 1.06;

/** Closed window. */
export interface BlinkWindow {
  u1: number;
  u2: number;
}

// Closed-window width = min(.28, (isBlink ? blink closed phase : lidMorph closed phase) / max(dur,.05))
export function blinkWindow(isBlink: boolean, dur: number): BlinkWindow {
  const n = Math.min(0.28, (isBlink ? BLINK_CLOSE_DUR : MORPH_CLOSE_DUR) / Math.max(dur, 0.05));
  const r = (1 - n) * 0.42;
  return { u1: r, u2: r + n };
}

// Open-phase curve: t<.7 parabolic rise to 1.06, then falls back to 1 (the 6% overshoot is source semantics)
export function blinkOpenCurve(e: number): number {
  const t = Math.min(1, Math.max(0, e));
  if (t < 0.7) {
    const n = t / 0.7;
    return (1 - (1 - n) * (1 - n)) * OVERSHOOT;
  }
  return OVERSHOOT + -0.06000000000000005 * smoothstep01((t - 0.7) / 0.3);
}

// Blink envelope: rises before u1 / flat 1 over u1..u2 / falls after u2
export function blinkEnvelopeAt(e: number, win: BlinkWindow): number {
  return e < win.u1
    ? smoothstep01(e / win.u1)
    : e <= win.u2
      ? 1
      : 1 - smoothstep01((e - win.u2) / Math.max(1e-6, 1 - win.u2));
}

// morph progress → eased value
function morphEaseAt(st: { t: number; dur: number }): number {
  return bezierSolve(Math.min(Math.max(st.t / st.dur, 0), 1), MORPH_EASE);
}

// ── Expression vocabulary ────────────────

export const FACE_NAMES: readonly FaceName[] = [
  "neutral", "happy", "surprised", "sad", "sleepy", "squinted", "calm", "inspecting", "confused",
];

// Clip expression name → face alias
export const FACE_ALIAS: ReadonlyMap<string, FaceName> = new Map([
  ["thinking", "sad"],
  ["strange", "inspecting"],
  ["angry", "neutral"],
  ["inspect", "inspecting"],
  ["squint", "squinted"],
  ["idle", "neutral"],
  ["smile", "happy"],
  ["sleep", "sleepy"],
]);

// Through-blink set (these switches go through lidMorph to avoid closed-eye glitches)
export const SLEEPY_CLASS: ReadonlySet<string> = new Set(["sad", "happy", "confused", "squinted", "sleepy"]);

function isFaceName(e: string): e is FaceName {
  return FACE_NAMES.some((t) => t === e);
}

// Alias expansion + vocabulary validation, unknown falls to neutral
export function normalizeFace(name: string): FaceName {
  const t = name.trim().toLowerCase();
  const n = FACE_ALIAS.get(t) ?? t;
  return isFaceName(n) ? n : "neutral";
}

export function isSleepyClass(e: string): boolean {
  return SLEEPY_CLASS.has(e);
}

// Can morph directly (non-through-blink class and target has no oval eyes)
export function canDirectMorph(e: FaceName): boolean {
  return !isSleepyClass(e) && !FACE_PRESETS[e].some(isOvalEye);
}

// ── 9 expression presets ──────────────

// 9 expression presets (parameters verbatim from source)
export const FACE_PRESETS: Record<FaceName, EyeShape[]> = {
  neutral: bothEyes(capsuleX(NEUTRAL_WID, 0.57, 0, 0)),
  happy: bothEyes(
    makeEye([0.03, 0.03], 0, STROKE_WID, { p0: [0.16, -0.04], p1: [0, 0.12], p2: [-0.16, -0.04], isArc: true }, [0, 0]),
  ),
  surprised: bothEyes(capsuleX(0.42, 0.86, 0, 0.03)),
  inspecting: INSPECTING_PRESET,
  sad: bothEyes(capsuleX(NEUTRAL_WID, 0.5, -28, -0.05)),
  sleepy: bothEyes(
    makeEye([0.01, 0], 0, NEUTRAL_WID / 2, { p0: [-0.11, 0.025], p1: [0, -0.05], p2: [0.11, 0.025], isArc: false }, [0, 0]),
  ),
  squinted: bothEyes(capsuleX(NEUTRAL_WID, 0.5, 90, 0.01)),
  calm: bothEyes(ovalEye(0.296, 0.247, 0.05)),
  confused: bothEyes(
    makeEye([-0.1, 0], 0, STROKE_WID, { p0: [0.01, 0.16], p1: [-0.17, 0], p2: [0.01, -0.16], isArc: false }, [0, 0]),
  ),
};

// Blend path selection: both sides without a closed shape and either side elliptical → oval; closed shape present → spine; otherwise stadium
export function selectMorphPath(from: readonly EyeShape[], to: readonly EyeShape[], hasClosed: boolean): "oval" | "spine" | "stadium" {
  return !(from.some(isClosedShape) || to.some(isClosedShape)) && (from.some(isOvalEye) || to.some(isOvalEye))
    ? "oval"
    : hasClosed
      ? "spine"
      : "stadium";
}

// ── Eye anchor derivation (lazy singleton, spec §3.2) ────────

/** Per-eye ortho cutting-plane frame. */
export interface EyeFrame {
  M: Vec3;
  T: Vec3;
  C: Vec3;
}

function normalizeVec3(v: readonly number[]): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

interface AnchorDerived {
  meanEyeDir: Vec3;
  alignQuat: Quat;
  rotatedAnchors: { A: Vec3; B: Vec3; N: Vec3 }[];
  frames: EyeFrame[];
  restEuler: [number, number, number];
  flip: boolean[];
}

let anchorDerived: AnchorDerived | null = null;

function anchorData(): AnchorDerived {
  if (anchorDerived != null) return anchorDerived;

  // Mean direction of both eyes
  const meanEyeDir = (() => {
    let e: [number, number, number] = [0, 0, 0];
    for (const { A, B } of EYE_ANCHORS) {
      const r = normalizeVec3([A[0] + B[0], A[1] + B[1], A[2] + B[2]]);
      e = [e[0] + r[0], e[1] + r[1], e[2] + r[2]];
    }
    return normalizeVec3(e);
  })();

  // Corrective rotation: mean direction→+Z, then compensate roll by the resultant angle of the two eye directions
  const alignQuat = (() => {
    const e = quatBetween(meanEyeDir, [0, 0, 1]);
    const m = quatToMat3(e);
    let sumX = 0;
    let sumY = 0;
    for (const { A, B } of EYE_ANCHORS) {
      const a = mat3MulVec(m, [B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
      sumX += a[0];
      sumY += a[1];
    }
    const roll =
      ((((Math.PI / 2 - Math.atan2(sumY, sumX) + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2;
    return quatMul(quatAxisAngle([0, 0, 1], roll), e);
  })();

  // Anchors through the corrective rotation
  const rot = quatToMat3(alignQuat);
  const rotatedAnchors = EYE_ANCHORS.map(({ A, B, N }) => ({
    A: mat3MulVec(rot, A),
    B: mat3MulVec(rot, B),
    N: mat3MulVec(rot, N),
  }));

  // Per eye {M=normalize(A+B), T=normalize(B−(B·M)M) (flipped when y<0), C=M×T (flipped when Cx·Mx<0)}
  const frameOf = ({ A, B }: { A: Vec3; B: Vec3 }): EyeFrame => {
    const M = normalizeVec3([A[0] + B[0], A[1] + B[1], A[2] + B[2]]);
    const dot = B[0] * M[0] + B[1] * M[1] + B[2] * M[2];
    let T = normalizeVec3([B[0] - dot * M[0], B[1] - dot * M[1], B[2] - dot * M[2]]);
    if (T[1] < 0) T = [-T[0], -T[1], -T[2]];
    let C: [number, number, number] = [
      M[1] * T[2] - M[2] * T[1],
      M[2] * T[0] - M[0] * T[2],
      M[0] * T[1] - M[1] * T[0],
    ];
    if (C[0] * M[0] < 0) C = [-C[0], -C[1], -C[2]];
    return { M, T, C };
  };
  const [first, second] = rotatedAnchors;
  if (first == null || second == null) throw Error(`Motion Lab defines exactly two eye capsules`);
  const frames = [frameOf(first), frameOf(second)];

  // Euler of the corrective rotation's conjugate (degrees): rest pose
  const conj: Quat = [alignQuat[0], -alignQuat[1], -alignQuat[2], -alignQuat[3]];
  const [ex, ey, ez] = quatToEuler(conj);
  const restEuler: [number, number, number] = [ex / DEG, ey / DEG, ez / DEG];

  // Per-eye winding flip flag (C×T)·M < 0 (basis for reversing the second eye at render time)
  const flip = frames.map(({ M, T, C }) => {
    const r = [C[1] * T[2] - C[2] * T[1], C[2] * T[0] - C[0] * T[2], C[0] * T[1] - C[1] * T[0]];
    return r[0] * M[0] + r[1] * M[1] + r[2] * M[2] < 0;
  });

  anchorDerived = { meanEyeDir, alignQuat, rotatedAnchors, frames, restEuler, flip };
  return anchorDerived;
}

export function getMeanEyeDir(): Vec3 {
  return anchorData().meanEyeDir;
}

export function getAlignQuat(): Quat {
  return anchorData().alignQuat;
}

export function getEyeFrames(): EyeFrame[] {
  return anchorData().frames;
}

// Rest pose euler (degrees)
export function getRestEuler(): [number, number, number] {
  return anchorData().restEuler;
}

export function getEyeFlip(): boolean[] {
  return anchorData().flip;
}

// ── Expression module ────────────────

/** Transition state (morph / lidMorph / blink, three kinds). */
interface Transition {
  kind: "morph" | "lidMorph" | "blink";
  /** Used by morph only (qi's selection result). */
  path: "oval" | "spine" | "stadium";
  fromInspect: number;
  toName: FaceName;
  from: EyeShape[];
  to: EyeShape[];
  t: number;
  dur: number;
  isHeld: boolean;
}

// FaceModule: blink/morph/lidMorph three states + seek replay
export function createFaceModule(): FaceModule {
  let name: FaceName = "neutral";
  let base: EyeShape[] = pairMap(FACE_PRESETS.neutral, resetOval);
  let inspectBase = 0;
  let active: Transition | null = null;

  // Current eye shape; lidMorph goes closed phase (pressed down) → fully closed → open phase (overshoot)
  const eyes = (): EyeShape[] => {
    if (active == null) return base;
    if (active.kind === "blink") return active.from;
    if (active.kind === "morph") {
      const p = Math.max(0, Math.min(1, morphEaseAt(active)));
      const { from, to, path } = active;
      return path === "oval"
        ? pairMap(from, (e, i) => blendOval(e, to[i], p))
        : path === "spine"
          ? pairMap(from, (e, i) => blendSpine(e, to[i], p))
          : pairMap(from, (e, i) => blendStadium(e, to[i], p));
    }
    // lidMorph branch
    const p = Math.min(active.t / active.dur, 1);
    const { u1, u2 } = blinkWindow(false, active.dur);
    if (p < u1) return pairMap(active.from, (e) => lidDrop(e, smoothstep01(p / u1)));
    if (p <= u2) return pairMap(active.to, collapseEye);
    const open = blinkOpenCurve((p - u2) / Math.max(1e-6, 1 - u2));
    return pairMap(active.to, (e) => lidDrop(e, 1 - open));
  };

  // inspect weight (blink keeps the incoming value; morph eases over; lidMorph zeroed in the closed phase)
  const inspectWeight = (): number => {
    if (active == null) return inspectBase;
    if (active.kind === "blink") return active.fromInspect;
    const from = active.fromInspect;
    const to = isInspectingFlag(active.toName);
    if (active.kind === "morph") return from + (to - from) * morphEaseAt(active);
    const p = Math.min(active.t / active.dur, 1);
    const { u1, u2 } = blinkWindow(false, active.dur);
    return p <= u1 ? from : p < u2 ? 0 : to;
  };

  // Direct morph; the spine forced condition includes sleepy (either side)
  const morph = (target: FaceName): void => {
    const from = pairMap(eyes(), resetOval);
    const to = FACE_PRESETS[target];
    active = {
      kind: "morph",
      path: selectMorphPath(
        from,
        to,
        from.some(isClosedShape) || to.some(isClosedShape) || name === "sleepy" || target === "sleepy",
      ),
      fromInspect: inspectWeight(),
      toName: target,
      from,
      to,
      t: 0,
      dur: MORPH_DUR,
      isHeld: false,
    };
    name = target;
  };

  // Through-blink switch (closed-eye glitch avoidance)
  const lidMorph = (target: FaceName): void => {
    active = {
      kind: "lidMorph",
      path: "stadium", // placeholder: only the morph branch reads path
      fromInspect: inspectWeight(),
      toName: target,
      from: pairMap(eyes(), resetOval),
      to: FACE_PRESETS[target],
      t: 0,
      dur: LID_MORPH_DUR,
      isHeld: false,
    };
    name = target;
  };

  // Start a blink only when idle or held
  const blink = (): void => {
    if (active == null || active.isHeld) {
      active = {
        kind: "blink",
        path: "stadium",
        fromInspect: inspectBase,
        toName: name,
        from: pairMap(base, resetOval),
        to: FACE_PRESETS[name],
        t: 0,
        dur: BLINK_DUR,
        isHeld: false,
      };
    }
  };

  // Expression events: when the through-blink condition holds go lidMorph, otherwise morph
  const play = (ev: ExpressionEvent): void => {
    if (ev.name !== name || (active != null && active.toName !== ev.name)) {
      if (ev.isThroughBlink && !isSleepyClass(ev.name) && !isSleepyClass(name)) lidMorph(ev.name);
      else morph(ev.name);
    }
  };

  // Transition advance; commit when out of range (base=to), negative time clears
  const advanceTo = (st: Transition, time: number): void => {
    if (time >= st.dur) {
      base = pairMap(st.to, resetOval);
      inspectBase = isInspectingFlag(st.toName);
      active = null;
    } else {
      active = time < 0 ? null : { ...st, t: time };
    }
  };

  const setHeld = (v: boolean): void => {
    if (active != null) active = { ...active, isHeld: v };
  };

  return {
    get name() {
      return name;
    },
    get isMorphing() {
      return active != null && active.kind !== "blink" && !active.isHeld;
    },
    eyes,
    inspectWeight,
    blinkAmount() {
      if (active?.kind !== "blink" || active.isHeld) return null;
      const p = Math.min(active.t / active.dur, 1);
      return Math.min(1, Math.max(0, blinkEnvelopeAt(p, blinkWindow(true, active.dur))));
    },
    morph,
    lidMorph,
    blink,
    play,
    step(dt: number) {
      if (active != null && !active.isHeld) advanceTo(active, active.t + dt);
    },
    release() {
      setHeld(false);
    },
    seek(events: readonly ExpressionEvent[], time: number) {
      name = "neutral";
      base = pairMap(FACE_PRESETS.neutral, resetOval);
      inspectBase = 0;
      active = null;
      let prev = 0;
      const jump = (to: number) => {
        if (active != null) advanceTo(active, to - prev);
      };
      for (const ev of events) {
        if (ev.t > time + 1e-9) break;
        jump(ev.t);
        play(ev);
        prev = ev.t;
      }
      jump(time);
      setHeld(true);
    },
  };
}

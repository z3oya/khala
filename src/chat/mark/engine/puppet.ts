/**
 * Puppet — pose state machine. Obfuscated-name map (not inferable from code):
 *   t=zoomMul(clamped .2..3) n=face(FaceModule) r=body i=bodyLocked a=old-body blend
 *   o=body spring s=morph c=morph rotation anchor l=rotE u=pos d=scl f=squashAnchor p=zoom
 *   m=inspect h=lookAnim g=gazeState _=current clip v=time y=playing b=canLoop x=paused
 *   S=base entry C=bridging pending entry w=glow T=glowClock E=loopCount D=heldFace
 *   O=blink-deferred callback ee=lids suppression te=poke queue
 *   Closures: ne=sample clip k=deferred callback re=dispatch expression ie=seek A=track lids j=effective lids
 *   ae=lids suppression oe=snapshot se=install ce=direct install le=bridge ue=re-bridge de=advance pe=gaze
 *   me=look he=body blend ge=start transition _e=spring ve=blink amount ye=eye shape
 */
import type {
  BodyId,
  Clip,
  ExpressionEvent,
  FaceName,
  GlowSpec,
  MarkFrame,
  Puppet,
  PuppetInit,
  Vec2,
  Vec3,
} from "../types";
import type { EyeShape } from "../types";
import { bezierSolve } from "./math/bezier";
import { clamp } from "./math/misc";
import { DEG, quatFromEulerXYZ } from "./math/quat";
import { easeInOutCubic, makeSpringState, springStep, springSubsteps } from "./math/spring";
import {
  BASE_ZOOM,
  REST_CLIP,
  makeBridge,
  normalizeClip,
  poseMatches,
  restEuler,
  restPose,
  sampleTrack,
  type PoseSnapshot,
} from "./clip";
import { canDirectMorph, createFaceModule, isSleepyClass } from "./faces";
import { inspectScale, widenToOval } from "./eyesModel";
import { approach, GAZE_GAIN, gazeDecay, gazeRotation } from "./gaze";
import { LOOK_PRESETS } from "./looks";
import { pokeContribution, pokeDuration, type PokeRecord } from "./pokes";
import { createMorphController } from "./morph";

// look interpolation ease / duration / dt cap per advance
const LOOK_EASE: readonly [number, number, number, number] = [.42, 0, 0.58, 1];
const LOOK_DURATION = 0.5;
const MAX_STEP = 0.1;
// Body-switch spring ω / blend weight filter threshold / morph override eye-cut threshold
const BODY_SPRING_OMEGA = 10;
const BODY_WEIGHT_EPS = 1e-4;
const MORPH_EYE_CUTOFF = 0.5;
const REST_NAME = "rest";
// Instant-switch body set (no spring blending)
const INSTANT_BODIES = new Set<BodyId>(["pumpkin"]);

/** Base clip entry (SRC S holds only {clip, name}). */
interface BaseEntry {
  clip: Clip;
  name: string;
}

/** Load entry (anonymous structure passed between SRC load/ce/le; C/pending holds the full form). */
interface LoadEntry extends BaseEntry {
  isPlaying: boolean;
  phase: number;
  isRest: boolean;
}

/** look animation (SRC h). */
interface LookState {
  t: number;
  fromRot: number[];
  toRot: Vec3;
  fromPos: number[];
  toPos: Vec2;
}

/** gaze smoothing state (SRC g). */
interface GazeState {
  isHeld: boolean;
  isAlways: boolean;
  x: number;
  y: number;
  cx: number;
  cy: number;
  hold: number;
}

// Round to the nearest full turn
function snapTurns(e: number): number {
  return 360 * Math.round(e / 360);
}

// Last expression name before t
function faceAt(e: readonly ExpressionEvent[], t: number): FaceName {
  let n: FaceName = "neutral";
  for (const r of e) {
    if (r.t > t + 1e-9) break;
    n = r.name;
  }
  return n;
}

export function createPuppet(init: PuppetInit = {}): Puppet {
  const zoomMul = Math.min(3, Math.max(0.2, init.zoomMul || 1));
  const face = createFaceModule();
  let body: BodyId = init.body ?? "sphere";
  // Once body is explicit or setBody was called, clips no longer overwrite the body
  let bodyLocked = init.body !== undefined;
  let bodyMix: { body: BodyId; weight: number }[] = [];
  const bodySpring = makeSpringState(1);
  const morph = createMorphController();
  let morphAnchor: [number, number, number] | null = null;
  // Initial rot (lazily derived from faces.getRestEuler)
  const da = restEuler();
  let rot: [number, number, number] = [da[0], da[1], da[2]];
  let pos: [number, number] = [0, 0];
  let scl: [number, number] = [1, 1];
  let squashAnchor = 0;
  let zoom = BASE_ZOOM * zoomMul;
  let inspect = { bias: -1, isFollowingTurn: true };
  let lookAnim: LookState | null = null;
  let gaze: GazeState = {
    isHeld: false,
    isAlways: init.isGazeAlways ?? false,
    x: 0,
    y: 0,
    cx: 0,
    cy: 0,
    hold: 0,
  };
  let clip: Clip = REST_CLIP;
  let time = 0;
  let playing = false;
  let canLoop = true;
  let paused = false;
  let baseEntry: BaseEntry | null = null;
  let pendingEntry: LoadEntry | null = null;
  let glow: GlowSpec | null = null;
  let glowClock = 0;
  let loopCount = 0;
  let heldFace: FaceName | null = null;
  let afterBlink: (() => void) | null = null;
  let lidsSuppressed = false;
  let pokeQueue: PokeRecord[] = [];

  // Sample the current clip into the pose
  const ne = (): void => {
    const p = sampleTrack(clip.position, time);
    pos = p ? [p[0], p[1]] : [0, 0];
    const r = sampleTrack(clip.rotation, time);
    rot = r ? [r[0], r[1], r[2]] : [0, 0, 0];
    const s = sampleTrack(clip.squash, time);
    scl = s ? [s[0], s[1]] : [1, 1];
    const z = sampleTrack(clip.zoom, time);
    if (z) zoom = Math.min(2.5, Math.max(0.25, z[0])) * zoomMul;
  };

  // While blinking defer the callback, otherwise run immediately and refresh the lids suppression
  const k = (cb: () => void): void => {
    (face.blinkAmount() ?? j()) > 0 ? (afterBlink = cb) : (cb(), ae());
  };

  // Dispatch expression events within (from, to] (not dispatched while holdFace)
  const re = (from: number, to: number): void => {
    if (heldFace == null)
      for (const ev of clip.expression) {
        if (ev.t <= from || ev.t > to) continue;
        k(() => face.play(ev));
      }
  };

  // seek (cancel look/deferred callbacks, sample, replay expressions)
  const ie = (t: number): void => {
    time = t;
    lookAnim = null;
    afterBlink = null;
    ne();
    face.seek(clip.expression, t);
    if (heldFace != null) face.seek([{ t: 0, name: heldFace, isThroughBlink: false }], 0);
  };

  // lids track sampling / effective lids (0 while suppressed) / suppression test: expression cannot switch directly or morph in progress → suppressed, lifted once lids return to zero
  const A = (): number => {
    const e = sampleTrack(clip.lids, time);
    return e ? Math.min(1, Math.max(0, e[0])) : 0;
  };

  const j = (): number => (lidsSuppressed ? 0 : A());

  const ae = (): void => {
    if (!canDirectMorph(face.name) || face.isMorphing) lidsSuppressed = true;
    else if (lidsSuppressed && A() === 0) lidsSuppressed = false;
  };

  // Pose snapshot (used by poseMatches/makeBridge)
  const oe = (): PoseSnapshot => ({
    rot: rot,
    pos: pos,
    scl: scl,
    zoom: zoom / zoomMul,
    lids: j(),
    expr: face.name,
    squashAnchor: squashAnchor,
  });

  // Install clip (reset time/anchors; may overwrite body and inspect while body is unlocked)
  const se = (c: Clip): void => {
    playing = false;
    clip = c;
    time = 0;
    squashAnchor = c.squashAnchor;
    if (c.body != null && !bodyLocked) body = c.body;
    inspect = {
      bias: c.inspect.bias ?? inspect.bias,
      isFollowingTurn: c.inspect.isFollowingTurn ?? inspect.isFollowingTurn,
    };
  };

  // Direct load
  const ce = (entry: LoadEntry): void => {
    pendingEntry = null;
    se(entry.clip);
    baseEntry = { clip: entry.clip, name: entry.name };
    canLoop = true;
    if (entry.isPlaying) {
      playing = true;
      if (entry.phase > 0) ie(entry.phase * entry.clip.duration);
      face.release();
      if (entry.phase <= 0) re(-1e-9, 0);
    } else {
      ie(0);
      if (entry.isRest) gaze = { ...gaze, hold: 0 };
    }
  };

  // Bridge load (0.35s transition from the old pose to the new clip's rest pose)
  const le = (entry: LoadEntry): void => {
    const from = oe();
    const to = restPose(entry.clip);
    pendingEntry = entry;
    se(makeBridge(from, to));
    canLoop = false;
    playing = true;
    if (heldFace == null && from.expr !== to.expr) k(() => face.morph(to.expr));
  };

  // Re-bridge: no bridging when a pending clip exists, or no base clip, or the pose already matches the rest pose; otherwise bridge back to the base clip
  const ue = (): boolean => {
    if (pendingEntry != null || baseEntry == null || poseMatches(oe(), restPose(baseEntry.clip))) return false;
    le({ ...baseEntry, isPlaying: true, phase: 0, isRest: false });
    return true;
  };

  // Time advance (loop/bridge/stop on completion)
  const de = (dt: number): void => {
    const from = time;
    let to = from + dt;
    if (to >= clip.duration) {
      re(from, clip.duration);
      if (canLoop) {
        loopCount += 1;
        if (ue()) return;
        to -= clip.duration;
        if (to >= clip.duration) to = 0;
        re(-1e-9, to);
        time = to;
      } else {
        time = clip.duration;
        playing = false;
        if (pendingEntry != null) ce(pendingEntry);
      }
    } else {
      re(from, to);
      time = to;
    }
    lookAnim = null;
    ne();
  };

  // gaze advance; when not playing, pull the pose straight toward the gaze
  const pe = (dt: number): void => {
    if (paused || (!gaze.isHeld && gaze.hold === 0)) return;
    const decay = gazeDecay(dt);
    gaze = {
      ...gaze,
      cx: approach(gaze.cx, gaze.x, decay),
      cy: approach(gaze.cy, gaze.y, decay),
      hold: approach(gaze.hold, +!!gaze.isHeld, decay),
    };
    if (playing) return;
    ne();
    const g = gazeRotation(body, gaze.cx, gaze.cy);
    const { hold } = gaze;
    rot = [rot[0] + (g.rx - rot[0]) * hold, rot[1] + (g.ry - rot[1]) * hold, rot[2] * (1 - hold)];
    pos = [pos[0] + (g.px - pos[0]) * hold, pos[1] + (g.py - pos[1]) * hold];
  };

  // look animation
  const me = (dt: number): void => {
    if (lookAnim == null) return;
    const t = lookAnim.t + dt;
    const n = Math.min(t / LOOK_DURATION, 1);
    const r = bezierSolve(n, LOOK_EASE);
    const { fromRot, toRot, fromPos, toPos } = lookAnim;
    rot = [
      fromRot[0] + (toRot[0] - fromRot[0]) * r,
      fromRot[1] + (toRot[1] - fromRot[1]) * r,
      fromRot[2] + (toRot[2] - fromRot[2]) * r,
    ];
    pos = [fromPos[0] + (toPos[0] - fromPos[0]) * r, fromPos[1] + (toPos[1] - fromPos[1]) * r];
    if (n >= 1) {
      rot = [toRot[0], toRot[1], toRot[2]];
      pos = [toPos[0], toPos[1]];
      lookAnim = null;
    } else lookAnim = { ...lookAnim, t };
  };

  // Body blend list (old bodies weighted by spring decay, weights normalized)
  const he = (): { body: BodyId; weight: number }[] => {
    if (bodyMix.length === 0) return [{ body, weight: 1 }];
    const blend = easeInOutCubic(clamp(bodySpring.x, 0, 1));
    const map = new Map<BodyId, number>();
    for (const m of bodyMix) map.set(m.body, (map.get(m.body) ?? 0) + m.weight * (1 - blend));
    map.set(body, (map.get(body) ?? 0) + blend);
    const list = [...map].filter(([, w]) => w > BODY_WEIGHT_EPS);
    const total = list.reduce((acc, [, w]) => acc + w, 0);
    return list.map(([b, w]) => ({ body: b, weight: w / total }));
  };

  // Start one body transition (old list expanded from the current blend snapshot, springs back to zero)
  const ge = (next: BodyId): void => {
    if (next === body) return;
    bodyMix = he();
    body = next;
    bodySpring.x = 0;
    bodySpring.v = 0;
    bodySpring.t = 1;
  };

  // Body spring advance (clear the blend list once in place)
  const _e = (dt: number): void => {
    if (bodyMix.length === 0) return;
    const steps = springSubsteps(dt);
    for (let i = 0; i < steps; i++) springStep(bodySpring, BODY_SPRING_OMEGA, 1, dt / steps);
    if (Math.abs(bodySpring.x - 1) < 0.001 && Math.abs(bodySpring.v) < 0.01) {
      bodySpring.x = 1;
      bodySpring.v = 0;
      bodyMix = [];
    }
  };

  // Blink amount (takes lids when no blink)
  const ve = (): number => face.blinkAmount() ?? j();

  // inspect scaling + blink squash
  const ye = (yawDeg: number, weight: number): EyeShape[] => {
    const eyes = inspectScale(face.eyes(), weight, inspect, yawDeg);
    const blink = ve();
    return blink <= 1e-4 ? eyes : [widenToOval(eyes[0], blink), widenToOval(eyes[1], blink)];
  };

  return {
    get isPlaying() {
      return playing;
    },
    get time() {
      return time;
    },
    get duration() {
      return clip.duration;
    },
    get loopCount() {
      return loopCount;
    },
    get face() {
      return face.name;
    },
    get isSettled(): boolean {
      const gazeQuiet =
        paused || (gaze.hold === +!!gaze.isHeld && (!gaze.isHeld || (gaze.cx === gaze.x && gaze.cy === gaze.y)));
      return (
        !playing &&
        pokeQueue.length === 0 &&
        bodyMix.length === 0 &&
        lookAnim == null &&
        afterBlink == null &&
        !face.isMorphing &&
        face.blinkAmount() == null &&
        morph.snapshot().isSettled &&
        gazeQuiet
      );
    },
    load(recipe, { isPlaying: isPlay = true, transition = "bridge", phase = 0 } = {}) {
      const name = recipe.name || baseEntry?.name || "recipe";
      const entry: LoadEntry = {
        clip: normalizeClip(recipe),
        name,
        isPlaying: isPlay,
        phase: clamp(phase, 0, 1) % 1,
        isRest: false,
      };
      if (transition === "bridge" && baseEntry != null && (pendingEntry != null || baseEntry.name !== name)) le(entry);
      else ce(entry);
    },
    play(): void {
      paused = false;
      playing = true;
    },
    pause(): void {
      paused = true;
      playing = false;
    },
    stop(): void {
      playing = false;
      ie(0);
    },
    rest(): void {
      paused = false;
      const entry: LoadEntry = { clip: REST_CLIP, name: REST_NAME, isPlaying: false, phase: 0, isRest: true };
      if (pendingEntry == null && (baseEntry == null || baseEntry.name === REST_NAME)) {
        if (baseEntry == null) ce(entry);
      } else le(entry);
    },
    seek: ie,
    setBody(next, { isInstant = false } = {}) {
      bodyLocked = true; // body locked from here on
      if (!isInstant && !INSTANT_BODIES.has(next) && !INSTANT_BODIES.has(body)) ge(next);
      else {
        body = next;
        bodyMix = [];
        bodySpring.x = 1;
        bodySpring.v = 0;
      }
    },
    setMorph(kind, { isInstant = false } = {}) {
      morph.set(kind);
      if (isInstant) morph.settle();
    },
    setExpression(next, { isThroughBlink = false } = {}) {
      k(() => {
        if (isThroughBlink && !isSleepyClass(next) && !isSleepyClass(face.name)) face.lidMorph(next);
        else face.morph(next);
      });
    },
    holdFace(next) {
      if (next === heldFace) return;
      heldFace = next;
      k(() => {
        const name =
          heldFace ?? (pendingEntry == null ? faceAt(clip.expression, time) : faceAt(pendingEntry.clip.expression, 0));
        if (name !== face.name) face.morph(name);
      });
    },
    poke(kind, { turns = 1 } = {}) {
      pokeQueue = [...pokeQueue, { poke: kind, t: 0, turns: Math.max(1, Math.round(turns)) }];
    },
    blink(): void {
      face.blink();
    },
    setInspect({ bias, isFollowingTurn }) {
      inspect = {
        bias: bias === undefined ? inspect.bias : Math.min(1, Math.max(-1, bias)),
        isFollowingTurn: isFollowingTurn ?? inspect.isFollowingTurn,
      };
    },
    setGaze(g) {
      if (g == null) {
        gaze = { ...gaze, isHeld: false };
        return;
      }
      const x = clamp(g[0] || 0, -1, 1);
      const y = clamp(g[1] || 0, -1, 1);
      gaze =
        gaze.hold === 0
          ? { ...gaze, isHeld: true, x, y, cx: x, cy: y }
          : { ...gaze, isHeld: true, x, y };
    },
    setGazeAlways(v): void {
      gaze = { ...gaze, isAlways: v };
    },
    look(dir) {
      const preset = LOOK_PRESETS[dir];
      lookAnim = { t: 0, fromRot: rot, toRot: preset.rot, fromPos: pos, toPos: preset.pos };
    },
    setGlow(g): void {
      glow = g;
    },
    advance(dt: number): void {
      const t = Math.min(dt, MAX_STEP);
      pe(t);
      const r = 1 - morph.snapshot().amount;
      if (playing) de(t * r);
      me(t);
      face.step(t);
      if (afterBlink != null && (face.blinkAmount() ?? j()) === 0) {
        const cb = afterBlink;
        afterBlink = null;
        cb();
      }
      ae();
      _e(t);
      pokeQueue = pokeQueue.map((p) => ({ ...p, t: p.t + t })).filter((p) => p.t < pokeDuration(p));
      morph.advance(t);
      const snap = morph.snapshot();
      if (snap.amount > 0 || !snap.isSettled) {
        morphAnchor ??= [snapTurns(rot[0]), snapTurns(rot[1]), snapTurns(rot[2])];
      } else morphAnchor = null;
      glowClock += dt;
    },
    frame(): MarkFrame {
      const gz = gaze.isAlways && playing && !paused ? gazeRotation(body, gaze.cx, gaze.cy) : null;
      const gain = GAZE_GAIN * gaze.hold;
      const pk = pokeContribution(pokeQueue);
      const rotMix: [number, number, number] = [
        rot[0] + (gz ? gz.rx * gain : 0) + pk.pitch,
        rot[1] + (gz ? gz.ry * gain : 0) + pk.yaw,
        rot[2],
      ];
      const posMix: [number, number] = [
        pos[0] + (gz ? gz.px * gain : 0),
        pos[1] + (gz ? gz.py * gain : 0) + pk.lift,
      ];
      const sclMix: [number, number] = [scl[0] * pk.squash[0], scl[1] * pk.squash[1]];
      const weight = face.inspectWeight();
      const snap = morph.snapshot();
      const inv = 1 - snap.amount;
      const spinDeg = (snap.spin % (2 * Math.PI)) / DEG;
      const anchor = morphAnchor ?? [0, 0, 0];
      const mixAt = (i: number): number => anchor[i] + (rotMix[i] - anchor[i]) * inv;
      const yawDeg = mixAt(1);
      return {
        body,
        quat: quatFromEulerXYZ(mixAt(0) * DEG, (yawDeg + spinDeg) * DEG, mixAt(2) * DEG),
        zoom,
        offset: inv === 1 ? posMix : [posMix[0] * inv, posMix[1] * inv],
        squash: inv === 1 ? sclMix : [1 + (sclMix[0] - 1) * inv, 1 + (sclMix[1] - 1) * inv],
        squashAnchor,
        eyes: snap.amount >= MORPH_EYE_CUTOFF ? null : ye(yawDeg, weight),
        glow: glow && { ...glow, midT: 0.5 + 0.5 * Math.sin((glowClock * 1e3) / 860) },
        inspectWeight: weight,
        bodies: he(),
        morph: snap.kind === null && snap.isSettled ? null : snap,
      };
    },
  };
}

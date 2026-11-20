/**
 * morph glyph and multi-body blending — 13 glyph generators + core transforms + the polar resampling family + blend rendering.
 * The sphere-side copy of nm lives in spherePath (ellipseRing); source Ko/lm, same formula, are merged into lerpOutline.
 * The main integration point renderMarkToNode sits at the end of this file; renderFrame.ts is its forwarder shell.
 */
import type {
  BodyId,
  GlyphKind,
  MarkAppearance,
  MarkFrame,
  MorphClock,
  MorphSnapshot,
  SvgNode,
} from "../types";
import { clamp } from "../engine/math/misc";
import { cubicOut, easeInOutCubic, easeOutBack, smoothstep } from "../engine/math/spring";
import { makeRng } from "../engine/math/rand";
import { holdFor } from "../engine/morph";
import { getEyeFlip, getEyeFrames } from "../engine/faces";
import { L, round2 } from "../geometry/pathUtils";
import { teardropKs } from "../geometry/outline2d";
import { buildBlendGeometry, buildBodySprite, spriteToSvgNode, type BlendShapeInput } from "./bodyPaths";
import { buildSphereSprite, inkPaintOf, sphereGeometry, sphereSpriteToSvgNode, spotPaintOf } from "./spherePath";
import { el, fmt2, svgRoot } from "./svgTree";

// ── Constants ─────────────────────────────

export const MORPH_PENCIL_CENTER = 114.5;
const MORPH_FULL_AMOUNT = 0.62;
const RING_SAMPLES = 96;
const TAU_GLYPH = Math.PI * 2;
export const GLYPH_BASE_RADIUS: Record<GlyphKind, number> = {
  dots: 22, orbit: 19, radar: 19, progress: 19, gather: 19, wave: 16, send: 20,
  receive: 20, dock: 20, ball: 18, pencil: 17, bang: 13, standby: 13,
};
const GLYPH_ZOOM: Record<GlyphKind, number> = {
  dots: 1.5, orbit: 1.14, radar: 1.14, progress: 1.32, gather: 1.15, wave: 1.42,
  send: 1.12, receive: 1.12, dock: 1.3, ball: 1.22, pencil: 1.18, bang: 1.28, standby: 1.75,
};
const DOTS_RADIUS = 22;
const DOTS_SPREAD = 62;
const DOTS_POP = 0.84;
const DOTS_LIFT_POP = 0.22;
const DOTS_SCALE = 1.02;
const DOTS_LIFT = 9;
const DOTS_PERIOD = 1400;
const SEND_PERIOD = 1500;
const RECEIVE_PERIOD = 1700;
const PENCIL_PERIOD = 2500;
const PENCIL_IN_RATIO = 0.68;
const PENCIL_IN_MS = PENCIL_PERIOD * PENCIL_IN_RATIO;
const PENCIL_MIN_SEG = 2.4;
const INK_TRAIL_KEEP = 120;
const PROGRESS_HOLD_MS = holdFor(`progress`) * 1e3;
const GATHER_HOLD_MS = holdFor(`spawning`) * 1e3;
const WAVE_PHASES = [-2, -1, 1, 2];
const wrap01 = (e: number): number => ((e % 1) + 1) % 1;
const MARK_SCALE_BASE = 0.6;

// ── glyph part types (products of ug/dg/fg/pg) ────────────────

export type GlyphPart =
  | { type: `disc`; key: string; cx: number; cy: number; r: number; opacity: number }
  | {
      type: `ring`;
      key: string;
      cx: number;
      cy: number;
      r: number;
      width: number;
      opacity: number;
      arc?: { fraction: number; startDeg: number };
    }
  | { type: `shape`; key: string; d: string; transform: string; opacity: number }
  | { type: `stroke`; key: string; d: string; width: number; opacity: number };

const disc = (key: string, cx: number, cy: number, r: number, opacity: number): GlyphPart => ({
  type: `disc`, key, cx, cy, r, opacity,
});
const ring = (key: string, r: number, width: number, opacity: number): GlyphPart => ({
  type: `ring`, key, cx: L, cy: L, r, width, opacity,
});
const shape = (key: string, d: string, transform: string, opacity: number): GlyphPart => ({
  type: `shape`, key, d, transform, opacity,
});
const stroke = (key: string, d: string, width: number, opacity: number): GlyphPart => ({
  type: `stroke`, key, d, width, opacity,
});

// ── Trajectories and static shapes ───────────────────────

const CIRCLE_RING: [number, number][] = Array.from({ length: RING_SAMPLES }, (_v, i) => {
  const a = (i / RING_SAMPLES) * TAU_GLYPH;
  return [L + Math.cos(a) * L, L + Math.sin(a) * L];
});
const TEARDROP_RING = teardropKs(88, 18).ring;

function rotateRing(ringIn: readonly (readonly [number, number])[], shift: number): [number, number][] {
  const n = ringIn.length;
  const ang = (shift / n) * Math.PI * 2;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return Array.from({ length: n }, (_v, i) => {
    const [x, y] = ringIn[(((i - shift) % n) + n) % n]!;
    const dx = x - L;
    const dy = y - L;
    return [L + dx * cos - dy * sin, L + dx * sin + dy * cos];
  });
}

const PENCIL_RING = rotateRing(TEARDROP_RING, TEARDROP_RING.length / 2);

function ringFor(kind: GlyphKind | null): [number, number][] {
  return kind === `pencil` ? PENCIL_RING : CIRCLE_RING;
}

function capsuleBar(width: number, height: number): string {
  const r = width / 2;
  const top = L - height / 2 + r;
  const bottom = L + height / 2 - r;
  return `M${L - r} ${top}A${r} ${r} 0 0 1 ${L + r} ${top}L${L + r} ${bottom}A${r} ${r} 0 0 1 ${L - r} ${bottom}Z`;
}

function doubleBar(width: number, head: number, height: number): string {
  const r = width / 2;
  const h = head / 2;
  const top = L - height / 2;
  const bottom = L + height / 2;
  return `M${L - r} ${top + r}A${r} ${r} 0 0 1 ${L + r} ${top + r}L${L + h} ${bottom - h}A${h} ${h} 0 0 1 ${L - h} ${bottom - h}Z`;
}

const PENCIL_SHAFT = capsuleBar(30, 88);
const BANG_SHAPE = doubleBar(30, 17, 96);

// ── glyph helpers ───────────────────────────

/** dots undulation envelope (product of hg). */
export interface DotsEnvelope {
  lift: number;
  pop: number;
  tone: number;
}

const IDLE_ENV: DotsEnvelope = { lift: 0, pop: 1, tone: 1 };

export function dotsEnvelope(
  clock: MorphClock,
  phase: number,
  amount: number,
  isReducedMotion: boolean,
): DotsEnvelope {
  const t = wrap01((clock.stateTime * 1e3) / DOTS_PERIOD + 0.119);
  const dist = Math.abs(t - phase / 3);
  const near = Math.min(dist, 1 - dist);
  const peak = isReducedMotion ? 1 : Math.exp(-(near * near) / 0.045);
  const live = +!isReducedMotion;
  return {
    lift: peak * DOTS_LIFT * amount * live,
    pop: 1 + live * (DOTS_POP + DOTS_LIFT_POP * peak - 1),
    tone: 1 - live * 0.5 * (1 - peak),
  };
}

function waveBaseEnergy(now: number): number {
  return 0.42 + 0.29 * Math.sin(now * 0.0021) * Math.sin(now * 0.0034) + 0.29 * Math.sin(now * 0.0013 + 1.7);
}

function waveLift(now: number, phase: number): number {
  return waveBaseEnergy(now) * (0.55 + 0.45 * Math.sin(now * 0.012 - Math.abs(phase) * 1.05));
}

function receiveAngle(shot: number): number {
  return -Math.PI * 1.25 + makeRng(shot)() * Math.PI * 1.5;
}

export function ballBounce(t: number): number {
  const g = 0.62;
  const accel = 416 / (g * g);
  const apex = Math.sqrt(80 / accel);
  if (t < apex) return 0.5 * accel * t * t;
  const cyc = wrap01((t - apex) / g);
  return 40 - 208 * cyc * (1 - cyc);
}

/** pencil/writing trajectory pose (product of bg). */
export interface PencilPose {
  x: number;
  y: number;
  wig: number;
  rot: number;
}

export function pencilTrajectory(now: number): PencilPose {
  const t = wrap01(now / PENCIL_PERIOD);
  if (t < PENCIL_IN_RATIO) {
    const u = t / PENCIL_IN_RATIO;
    const ease = u * u * (3 - 2 * u);
    const win = clamp(u / 0.08, 0, 1) * clamp((1 - u) / 0.08, 0, 1);
    return { x: -54 + 118 * ease, y: 26, wig: Math.sin(u * 24) * 3.2 * win, rot: 17 + Math.sin(now * 6e-4) * 1 };
  }
  const out = easeInOutCubic((t - PENCIL_IN_RATIO) / 0.31999999999999995);
  return {
    x: 64 - 118 * out,
    y: 26 - 20 * Math.sin(out * Math.PI),
    wig: 0,
    rot: 17 - 2 * Math.sin(out * Math.PI) + Math.sin(now * 6e-4) * 1,
  };
}

function inkTip(now: number): [number, number] {
  const tr = pencilTrajectory(now);
  return [L + tr.x, L + tr.y + tr.wig + 19];
}

const INK_ANCHORS: { at: number; point: [number, number] }[] = (() => {
  const out: { at: number; point: [number, number] }[] = [];
  for (let t = 0; t < PENCIL_IN_MS; t++) {
    const p = inkTip(t);
    const last = out[out.length - 1];
    if (last === undefined || Math.hypot(p[0] - last.point[0], p[1] - last.point[1]) > PENCIL_MIN_SEG)
      out.push({ at: t, point: p });
  }
  return out;
})();

function inkTrail(now: number): [number, number][] {
  const t = wrap01(now / PENCIL_PERIOD) * PENCIL_PERIOD;
  const head = Math.min(t, PENCIL_IN_MS);
  const before = INK_ANCHORS.filter((s) => s.at <= head);
  const extra = head > (before.length > 0 ? before[before.length - 1]!.at : head) ? [inkTip(head)] : [];
  const pts = [...before.map((s) => s.point), ...extra].slice(-64);
  return t < PENCIL_IN_MS ? pts : pts.slice(Math.floor(((t - PENCIL_IN_MS) / 1e3) * INK_TRAIL_KEEP));
}

function inkPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  if (n === 2) return d + `L${pts[1]![0].toFixed(1)} ${pts[1]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(i + 2, n - 1)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// ── glyph generators ────────────────────────

function dotsParts(amount: number, clock: MorphClock, isReducedMotion: boolean): GlyphPart[] {
  const xs = [L - DOTS_SPREAD, L + DOTS_SPREAD];
  const parts: GlyphPart[] = [];
  for (let i = 0; i < 2; i++) {
    const t = clamp((amount - i * 0.12) / (1 - i * 0.12), 0, 1);
    if (t <= 0.004) continue;
    const ease = cubicOut(t);
    const back = easeOutBack(t);
    const env = dotsEnvelope(clock, i === 0 ? 0 : 2, amount, isReducedMotion);
    parts.push(
      disc(`dots.${i}`, L + (xs[i]! - L) * back, L - env.lift, DOTS_RADIUS * ease * env.pop * DOTS_SCALE, ease * env.tone),
    );
  }
  return parts;
}

function orbitParts(amount: number, clock: MorphClock): GlyphPart[] {
  const ease = cubicOut(amount);
  const radius = 52 * easeOutBack(amount);
  const t0 = clock.stateTime * 1e3 * 0.0017;
  return Array.from({ length: 5 }, (_v, i) => {
    const ang = t0 + (i * Math.PI * 2) / 5;
    const cos = Math.cos(ang);
    const depth = 0.5 + 0.5 * clamp(cos, 0, 1);
    return disc(
      `orbit.${i}`,
      L + radius * Math.sin(ang),
      L - radius * 0.42 * Math.cos(ang),
      Math.max(12 * depth * ease, 0.3),
      clamp((cos + 0.4) / 0.6, 0.18, 1) * ease,
    );
  });
}

function radarParts(amount: number, clock: MorphClock, baseRadius: number): GlyphPart[] {
  const ease = cubicOut(amount);
  return Array.from({ length: 3 }, (_v, i) => {
    const t = wrap01((clock.stateTime * 1e3) / 1300 + i / 3);
    return ring(`radar.${i}`, baseRadius + (104 - baseRadius) * t, 3.4 * (1 - t * 0.55), ease * (1 - t) * 0.9);
  });
}

function progressParts(amount: number, clock: MorphClock): GlyphPart[] {
  const ease = cubicOut(amount);
  const radius = 62 * easeOutBack(amount);
  const frac = clamp(clamp((clock.shotTime * 1e3) / PROGRESS_HOLD_MS, 0, 1) / 0.85, 0, 1);
  const track = ring(`progress.track`, radius, 5, ease * 0.16);
  return frac <= 0
    ? [track]
    : [
        track,
        { type: `ring`, key: `progress.arc`, cx: L, cy: L, r: radius, width: 5, opacity: ease, arc: { fraction: frac, startDeg: -90 } },
      ];
}

function gatherParts(amount: number, clock: MorphClock): GlyphPart[] {
  const ease = cubicOut(amount);
  const parts: GlyphPart[] = [];
  for (let i = 0; i < 5; i++) {
    const t = clamp(((clock.shotTime * 1e3) / GATHER_HOLD_MS - i * 0.09) / 0.62, 0, 1);
    if (t >= 1) continue;
    const a = 1 - (1 - t) ** 3;
    const ang = i * 2.4 + t * 2.2;
    const radius = 96 * (1 - a);
    parts.push(
      disc(
        `gather.${i}`,
        L + radius * Math.cos(ang),
        L + radius * Math.sin(ang) * 0.8,
        9 * (0.5 + 0.5 * a) * ease,
        ease * clamp(t * 5, 0, 1) * (1 - a * 0.25),
      ),
    );
  }
  return parts;
}

function waveParts(amount: number, clock: MorphClock): GlyphPart[] {
  const now = clock.stateTime * 1e3;
  const parts: GlyphPart[] = [];
  for (const phase of WAVE_PHASES) {
    const t = clamp((amount - Math.abs(phase) * 0.1) / (1 - Math.abs(phase) * 0.1), 0, 1);
    if (t <= 0.004) continue;
    const back = easeOutBack(t);
    const lift = waveLift(now, phase);
    const size = (7 + 9 * clamp(lift, 0.08, 1)) * cubicOut(t);
    const dy = 6 * clamp(lift, 0, 1) * t;
    parts.push(disc(`wave.${phase}`, L + phase * 44 * back, L - dy, size, t));
  }
  return parts;
}

function sendParts(amount: number, clock: MorphClock): GlyphPart[] {
  const ease = cubicOut(amount);
  const ph = wrap01((clock.stateTime * 1e3) / SEND_PERIOD);
  const main = clamp((ph - 0.18) / 0.55, 0, 1);
  const mainEase = main * main * (0.4 + 0.6 * main);
  const dx = 0.74;
  const dy = -0.62;
  const parts: GlyphPart[] = [];
  if (main > 0 && main < 1) {
    const dist = 108 * mainEase;
    parts.push(disc(`send.packet`, L + dx * dist, L + dy * dist, 10 * (1 - mainEase * 0.55) * ease, ease * (1 - mainEase * mainEase)));
  }
  const tail = clamp((ph - 0.26) / 0.55, 0, 1);
  const tailEase = tail * tail * (0.4 + 0.6 * tail);
  if (main > 0 && tail > 0 && tail < 1) {
    const dist = 108 * tailEase;
    parts.push(disc(`send.streak`, L + dx * dist, L + dy * dist, 5 * (1 - tailEase * 0.6) * ease, ease * 0.3 * (1 - tailEase)));
  }
  const launch = clamp((ph - 0.18) / 0.3, 0, 1);
  if (launch > 0 && launch < 1)
    parts.push(ring(`send.launch`, 20 + 34 * cubicOut(launch), 2.8 * (1 - launch), ease * (1 - launch) * 0.8));
  return parts;
}

function receiveParts(amount: number, clock: MorphClock): GlyphPart[] {
  const ease = cubicOut(amount);
  const now = clock.stateTime * 1e3;
  const ang0 = receiveAngle(Math.floor(now / RECEIVE_PERIOD));
  const ph = wrap01(now / RECEIVE_PERIOD);
  const inn = clamp(ph / 0.6, 0, 1);
  const easeIn = 1 - (1 - inn) ** 3;
  const cos = Math.cos(ang0);
  const sin = Math.sin(ang0);
  const radius = 108 * (1 - easeIn);
  const parts: GlyphPart[] = [];
  if (inn < 1) {
    const off = 18 * Math.sin(inn * Math.PI) * (1 - easeIn * 0.7);
    parts.push(
      disc(
        `receive.packet`,
        L + cos * radius - sin * off,
        L + sin * radius + cos * off,
        3.5 + 6.5 * easeIn,
        ease * clamp(inn * 3.5, 0, 1) * (0.3 + 0.7 * easeIn),
      ),
    );
  }
  const absorb = clamp((ph - 0.58) / 0.32, 0, 1);
  if (absorb > 0 && absorb < 1)
    parts.push(ring(`receive.absorb`, 20 + 26 * cubicOut(absorb), 2.8 * (1 - absorb), ease * (1 - absorb) * 0.8));
  return parts;
}

function dockParts(amount: number, clock: MorphClock): GlyphPart[] {
  const ease = cubicOut(amount);
  const now = clock.stateTime * 1e3;
  const parts: GlyphPart[] = [];
  for (let i = 0; i < 2; i++) {
    const t = clamp((clock.stateTime - (0.2 + i * 1.3)) / 0.9, 0, 1);
    if (t <= 0) continue;
    const a = 1 - (1 - t) ** 3;
    const wob = now * 0.001 * 1.1 + i * Math.PI;
    const x = L + 42 * Math.sin(wob);
    const y = L + 21 * Math.cos(wob) + Math.sin(now * 0.003 + i) * 2;
    const x0 = L - 120 + i * 30;
    const y0 = L + 95;
    parts.push(disc(`dock.${i}`, x0 + (x - x0) * a, y0 + (y - y0) * a, (7 + 3 * a) * ease, ease * clamp(t * 4, 0, 1)));
  }
  return parts;
}

function pencilParts(amount: number, clock: MorphClock): GlyphPart[] {
  const now = clock.stateTime * 1e3;
  const tr = pencilTrajectory(now);
  const rot = ((tr.rot - 90) * Math.PI) / 180;
  const ax = Math.cos(rot) * 68;
  const ay = Math.sin(rot) * 68;
  const cx = L + (tr.x + ax) * amount;
  const cy = L + (tr.y + tr.wig * 0.15 + ay) * amount;
  const parts: GlyphPart[] = [
    shape(
      `pencil.shaft`,
      PENCIL_SHAFT,
      `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(tr.rot * amount).toFixed(1)}) scale(${cubicOut(amount).toFixed(3)}) translate(${-L} ${-L})`,
      clamp(amount * 1.6 - 0.3, 0, 1),
    ),
  ];
  const trail = inkTrail(now);
  if (trail.length >= 2) parts.push(stroke(`pencil.ink`, inkPath(trail), 6, clamp(amount * 1.2, 0, 1)));
  return parts;
}

function bangParts(amount: number, clock: MorphClock): GlyphPart[] {
  const now = clock.stateTime;
  const ease = cubicOut(clamp(amount * 1.1, 0, 1));
  const decay = Math.exp(-(now % 2.2) * 5.5);
  const wiggle = Math.sin(now * 42) * 2.2 * decay;
  return [
    shape(
      `bang.bar`,
      BANG_SHAPE,
      `translate(0 ${(-26 - (1 - ease) * 70).toFixed(1)}) rotate(${wiggle.toFixed(2)} ${L} ${(L - 74).toFixed(1)}) translate(${L} ${L}) scale(${clamp(amount * 1.2, 0, 1).toFixed(3)}) translate(${-L} ${-L})`,
      clamp(amount * 1.5 - 0.2, 0, 1),
    ),
  ];
}

function standbyParts(amount: number, clock: MorphClock): GlyphPart[] {
  const pulse = 0.5 + 0.5 * Math.sin(clock.stateTime * 1e3 * 0.0016);
  return [disc(`standby.halo`, L, L, 26 + 7 * pulse, cubicOut(amount) * (0.06 + 0.1 * pulse))];
}

export function glyphPartsFor(
  kind: GlyphKind,
  amount: number,
  clock: MorphClock,
  baseRadius: number,
  isReducedMotion: boolean,
): GlyphPart[] {
  switch (kind) {
    case `dots`:
      return dotsParts(amount, clock, isReducedMotion);
    case `orbit`:
      return orbitParts(amount, clock);
    case `radar`:
      return radarParts(amount, clock, baseRadius);
    case `progress`:
      return progressParts(amount, clock);
    case `gather`:
      return gatherParts(amount, clock);
    case `wave`:
      return waveParts(amount, clock);
    case `send`:
      return sendParts(amount, clock);
    case `receive`:
      return receiveParts(amount, clock);
    case `dock`:
      return dockParts(amount, clock);
    case `ball`:
      return [];
    case `pencil`:
      return pencilParts(amount, clock);
    case `bang`:
      return bangParts(amount, clock);
    case `standby`:
      return standbyParts(amount, clock);
    default:
      throw Error(`Unhandled case: ${String(kind)}`);
  }
}

// ── glyph layer master control ─────────────────────

/** Product of Rg: core body transforms + parts. */
export interface GlyphLayer {
  core: {
    scale: number;
    dx: number;
    dy: number;
    rotation: number;
    opacity: number;
    round: number;
    ring: readonly (readonly [number, number])[];
  };
  isFaceVisible: boolean;
  zoom: number;
  parts: GlyphPart[];
}

export function renderGlyphs(snapshot: MorphSnapshot, size: number): GlyphLayer {
  const { kind, isReducedMotion } = snapshot;
  const amount = clamp(snapshot.amount, 0, 1);
  const swap = clamp(snapshot.swap, 0, 1);
  const outgoing = swap < 0.999 ? snapshot.outgoing : null;
  const weightOf = (g: GlyphKind | null): number =>
    g === kind ? amount * swap : g === outgoing ? amount * (1 - swap) : 0;
  const clockOf = (g: GlyphKind | null): MorphClock => (g === kind ? snapshot.clock : snapshot.outgoingClock);
  const roundMix = clamp(amount / MORPH_FULL_AMOUNT, 0, 1);
  const ring =
    kind !== `pencil` && outgoing !== `pencil`
      ? CIRCLE_RING
      : swap >= 0.999
        ? ringFor(kind)
        : lerpOutline(ringFor(outgoing), ringFor(kind), easeInOutCubic(swap));
  const baseRadius = kind
    ? GLYPH_BASE_RADIUS[kind] * swap + (outgoing ? GLYPH_BASE_RADIUS[outgoing] : GLYPH_BASE_RADIUS[kind]) * (1 - swap)
    : 19;
  const dotsW = weightOf(`dots`);
  const isDots = kind === `dots` || outgoing === `dots`;
  const env = isDots ? dotsEnvelope(clockOf(`dots`), 1, amount, isReducedMotion) : IDLE_ENV;
  let pop = isDots ? 1 + (env.pop - 1) * (dotsW / Math.max(amount, 0.001)) : 1;
  const recvW = weightOf(`receive`);
  if (recvW > 0.004) {
    const t = clamp((wrap01((clockOf(`receive`).stateTime * 1e3) / RECEIVE_PERIOD) - 0.58) / 0.34, 0, 1);
    pop *= 1 + 0.11 * Math.sin(t * Math.PI) * recvW;
  }
  const sendW = weightOf(`send`);
  if (sendW > 0.004) {
    const ph = wrap01((clockOf(`send`).stateTime * 1e3) / SEND_PERIOD);
    const kick = ph < 0.18 ? -0.06 * Math.sin((ph / 0.18) * Math.PI) : 0;
    const bump = ph >= 0.18 && ph < 0.42 ? 0.05 * Math.sin(((ph - 0.18) / 0.24) * Math.PI) : 0;
    pop *= 1 + (kick + bump) * sendW;
  }
  const bangW = weightOf(`bang`);
  if (bangW > 0.004) pop *= 1 + 0.04 * Math.exp(-(clockOf(`bang`).stateTime % 2.2) * 5.5) * bangW;
  let dx = 0;
  let dy = 0;
  let rotation = 0;
  const pencilW = weightOf(`pencil`);
  if (pencilW > 0.004) {
    const tr = pencilTrajectory(clockOf(`pencil`).stateTime * 1e3);
    dx += tr.x * pencilW;
    dy += (tr.y + tr.wig * 0.5) * pencilW;
    rotation += tr.rot * pencilW;
  }
  if (bangW > 0.004) dy += 58 * bangW;
  const ballW = weightOf(`ball`);
  if (ballW > 0.004) dy += ballBounce(clockOf(`ball`).stateTime) * ballW;
  const ringScale = (baseRadius / L) * pop;
  const standbyW = weightOf(`standby`);
  const standbyFade =
    standbyW > 0 ? (0.28 + 0.2 * Math.sin(clockOf(`standby`).stateTime * 1e3 * 0.0016)) * standbyW : 0;
  const core = {
    scale: 1 - amount + ringScale * amount,
    dx: dx * amount,
    dy: -env.lift * dotsW + dy * amount,
    rotation: rotation * amount,
    opacity: (1 - (1 - env.tone) * dotsW) * (1 - standbyFade),
    round: easeInOutCubic(roundMix),
    ring,
  };
  // src: O = 1-br(...) (br is smoothstep from spring.ts, A:95)
  const sizeFade = 1 - smoothstep(clamp((size - 44) / 90, 0, 1));
  const zoomIn = kind == null ? 1 : GLYPH_ZOOM[kind];
  const zoomOut = outgoing ? GLYPH_ZOOM[outgoing] : zoomIn;
  const zoom = 1 + (zoomIn * swap + zoomOut * (1 - swap) - 1) * amount * sizeFade;
  const parts: GlyphPart[] = [];
  for (const g of [outgoing, kind]) {
    if (g == null) continue;
    const w = weightOf(g);
    if (w > 0.004) parts.push(...glyphPartsFor(g, w, clockOf(g), baseRadius, isReducedMotion));
  }
  return { core, isFaceVisible: amount < 0.5, zoom, parts: parts.filter((p) => p.opacity > 0) };
}

// ── Polar resampling family ───────────────────

const TAU_POLAR = Math.PI * 2;
const ANGLE_EPS = 1e-7;
const FRACTION_EPS = 1e-7;
const ANGLE_BINS = 720;

/** Points of the polar family (readonly so both Vec2 and local arrays are accepted). */
export type Pt = readonly [number, number];
export type PtLoop = readonly Pt[];

// 2-decimal-place strings (duplicated in-source with round2, same formula)
const pt2s = (v: number): string => String(round2(v));

function angleFractions(count: number): number[] {
  return Array.from({ length: count }, (_v, i) => (i / count) * TAU_POLAR);
}

const BLEND_ANGLES = angleFractions(192);
function fractions(count: number): number[] {
  return Array.from({ length: count }, (_v, i) => i / count);
}
const BLEND_FRACTIONS = fractions(96);
const EYE_MATCH_SCALE = 0.6;

export function stripPainted(shapeInput: BlendShapeInput): readonly PtLoop[] {
  if (shapeInput.painted == null) return shapeInput.body;
  const paintedLoops = new Set<readonly (readonly [number, number])[]>(
    shapeInput.painted.flatMap(({ loops }) => loops),
  );
  return shapeInput.body.filter((l) => !paintedLoops.has(l));
}

function loopAngles(loops: readonly PtLoop[], center: Pt): number[] {
  return loops.flatMap((l) => l.map(([x, y]) => angleAt(center, x, y)));
}

export function uniqueAngles(angleLists: readonly (readonly number[])[]): number[] {
  const sorted = angleLists.flat().sort((a, b) => a - b);
  return sorted.filter((a, i) => i === 0 || a - sorted[i - 1]! > ANGLE_EPS);
}

function angleAt(center: Pt, x: number, y: number): number {
  const a = Math.atan2(y - center[1], x - center[0]);
  return a < 0 ? a + TAU_POLAR : a;
}

function angleBins(loops: readonly PtLoop[], center: Pt): [Pt, Pt][][] {
  const bins: [Pt, Pt][][] = Array.from({ length: ANGLE_BINS }, () => []);
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const a0 = angleAt(center, a[0], a[1]);
      let span = angleAt(center, b[0], b[1]) - a0;
      if (span > Math.PI) span -= TAU_POLAR;
      if (span < -Math.PI) span += TAU_POLAR;
      const lo = Math.floor(((span < 0 ? a0 + span : a0) / TAU_POLAR) * ANGLE_BINS) - 1;
      const hi = Math.floor(((span < 0 ? a0 : a0 + span) / TAU_POLAR) * ANGLE_BINS) + 1;
      for (let k = lo; k <= hi; k++) bins[((k % ANGLE_BINS) + ANGLE_BINS) % ANGLE_BINS]!.push([a, b]);
    }
  }
  return bins;
}

function rayHit(bins: [Pt, Pt][][], center: Pt, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let reach = NaN;
  for (const [[ax, ay], [bx, by]] of bins[Math.floor((angle / TAU_POLAR) * ANGLE_BINS) % ANGLE_BINS]!) {
    const dx = bx - ax;
    const dy = by - ay;
    const den = cos * dy - sin * dx;
    if (Math.abs(den) < 1e-12) continue;
    const ox = ax - center[0];
    const oy = ay - center[1];
    const t = (ox * dy - oy * dx) / den;
    const u = (ox * sin - oy * cos) / den;
    if (t >= 0 && u >= -1e-9 && u <= 1.000000001 && !(t <= reach)) reach = t;
  }
  return reach;
}

export function fillNaN(values: readonly number[]): number[] {
  const n = values.length;
  const valid = values.flatMap((v, i) => (Number.isNaN(v) ? [] : [i]));
  if (valid.length === 0) return values.map(() => 0);
  return values.map((v, i) => {
    if (!Number.isNaN(v)) return v;
    const next = valid.find((k) => k > i) ?? valid[0]! + n;
    const prev = [...valid].reverse().find((k) => k < i) ?? (valid[valid.length - 1] ?? 0) - n;
    const t = (i - prev) / (next - prev);
    return values[(prev + n) % n]! * (1 - t) + values[next % n]! * t;
  });
}

function reachAt(edges: readonly { angle: number; reach: number }[], angle: number): number {
  const n = edges.length;
  if (n === 0) return 0;
  let idx = edges.findIndex((e) => e.angle >= angle);
  if (idx < 0) idx = 0;
  const hi = edges[idx]!;
  const lo = edges[(idx - 1 + n) % n]!;
  const span = (hi.angle - lo.angle + TAU_POLAR) % TAU_POLAR;
  if (span === 0) return hi.reach;
  const t = ((angle - lo.angle + TAU_POLAR) % TAU_POLAR) / span;
  return lo.reach + (hi.reach - lo.reach) * t;
}

function rightmostCross(loop: PtLoop, center: Pt): { edge: number; point: [number, number] } | null {
  const [cx, cy] = center;
  let best: { edge: number; point: [number, number] } | null = null;
  for (let i = 0; i < loop.length; i++) {
    const [ax, ay] = loop[i]!;
    const [bx, by] = loop[(i + 1) % loop.length]!;
    if (ay === by || (ay - cy) * (by - cy) > 0) continue;
    const x = ax + ((cy - ay) / (by - ay)) * (bx - ax);
    if (x >= cx && (best == null || x > best.point[0])) best = { edge: i, point: [x, cy] };
  }
  return best;
}

export function rayOutline(loops: readonly PtLoop[], center: Pt, angles: readonly number[]): Pt[] {
  const bins = angleBins(loops, center);
  const reach = fillNaN(angles.map((a) => rayHit(bins, center, a)));
  return angles.map((ang, i) => [center[0] + Math.cos(ang) * reach[i]!, center[1] + Math.sin(ang) * reach[i]!]);
}

export function polarRing(loop: PtLoop, center: Pt, angles: readonly number[]): Pt[] {
  const rays = loop
    .map(([x, y]) => ({ angle: angleAt(center, x, y), reach: Math.hypot(x - center[0], y - center[1]) }))
    .sort((a, b) => a.angle - b.angle);
  return angles.map((ang) => {
    const reach = reachAt(rays, ang);
    return [center[0] + Math.cos(ang) * reach, center[1] + Math.sin(ang) * reach];
  });
}

/** Product of im: normalized ring + station arc-length table. */
export interface RingPath {
  points: Pt[];
  stations: number[];
}

export function closeRing(loop: PtLoop): RingPath {
  const ccw = signedArea(loop) < 0 ? [...loop].reverse() : loop;
  const anchor = rightmostCross(ccw, centroid(ccw));
  const pts =
    anchor == null ? [...ccw] : [anchor.point, ...ccw.slice(anchor.edge + 1), ...ccw.slice(0, anchor.edge + 1)];
  const cum: number[] = [0];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[(i + 1) % pts.length]!;
    cum.push(cum[i]! + Math.hypot(nx - x, ny - y));
  }
  const total = cum[pts.length] ?? 0;
  return { points: pts, stations: cum.map((c) => (total === 0 ? 0 : c / total)) };
}

export function resampleStations(path: RingPath, at: readonly number[]): Pt[] {
  if (path.points.length === 0) return [];
  let seg = 0;
  return at.map((f) => {
    while (seg < path.points.length - 1 && path.stations[seg + 1]! < f) seg++;
    const [x0, y0] = path.points[seg]!;
    const [x1, y1] = path.points[(seg + 1) % path.points.length]!;
    const span = path.stations[seg + 1]! - path.stations[seg]!;
    const t = span === 0 ? 0 : (f - path.stations[seg]!) / span;
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  });
}

export function uniqueFractions(lists: readonly (readonly number[])[]): number[] {
  const sorted = lists.flat().filter((f) => f < 1).sort((a, b) => a - b);
  return sorted.filter((f, i) => i === 0 || f - sorted[i - 1]! > FRACTION_EPS);
}

export function weightedOutline(outlines: readonly { outline: Pt[]; weight: number }[]): Pt[] {
  const totalWeight = outlines.reduce((acc, o) => acc + o.weight, 0);
  const [first] = outlines;
  if (first == null || totalWeight === 0) return [];
  return first.outline.map((_p, i) => {
    let sx = 0;
    let sy = 0;
    for (const { outline, weight } of outlines) {
      sx += outline[i]![0] * weight;
      sy += outline[i]![1] * weight;
    }
    return [sx / totalWeight, sy / totalWeight];
  });
}

export function lerpOutline(a: PtLoop, b: PtLoop, t: number): [number, number][] {
  return a.map(([x, y], i) => [x + (b[i]![0] - x) * t, y + (b[i]![1] - y) * t]);
}

export function repeatPoint(p: Pt, count: number): [number, number][] {
  return Array.from({ length: count }, () => [p[0], p[1]]);
}

export function centroid(loop: PtLoop): [number, number] {
  if (loop.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of loop) {
    sx += x;
    sy += y;
  }
  return [sx / loop.length, sy / loop.length];
}

export function polylinePath(loop: PtLoop): string {
  return loop.length === 0 ? `` : `M${loop.map(([x, y]) => `${pt2s(x)} ${pt2s(y)}`).join(`L`)}Z`;
}

export function signedArea(loop: PtLoop): number {
  let area2 = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x, y] = loop[i]!;
    const [nx, ny] = loop[(i + 1) % loop.length]!;
    area2 += x * ny - nx * y;
  }
  return area2 / 2;
}

// ── Multi-body blend rendering ─────────────────────────────

// sphere goes through ph: in source ph the body is a ring group wrapped in one layer, sphereGeometry returns a bare ring, hence wrap it back.
function blendShapeFor(frame: MarkFrame, body: BodyId, size: number): BlendShapeInput {
  if (body === `sphere`) {
    const g = sphereGeometry({ ...frame, body }, size, getEyeFrames(), getEyeFlip());
    return { center: g.center, radius: g.radius, body: [g.body], eyes: g.eyes };
  }
  return buildBlendGeometry({ ...frame, body }, size);
}

/** Product of qg: morph head transform. */
export interface HeadTransform {
  translate: [number, number];
  rotation: number;
  scale: number;
  opacity: number;
}

/** Product of Ug: blend geometry (input of Gg). */
export interface BlendGeometry {
  size: number;
  center: Pt;
  body: Pt[];
  eyes: readonly PtLoop[];
  painted: { fill: string; loops: readonly PtLoop[] }[];
  paintedOpacity: number;
  head: HeadTransform | null;
  parts: GlyphPart[];
  markScale: number;
  zoom: number;
}

function ringBlend(glyph: GlyphLayer, center: Pt, radius: number, angles: readonly number[]): Pt[] {
  const scale = radius / L;
  return polarRing(
    glyph.core.ring.map(([x, y]) => [center[0] + (x - L) * scale, center[1] + (y - L) * scale]),
    center,
    angles,
  );
}

export function headTransform(glyph: GlyphLayer, amount: number, zoom: number, markScale: number): HeadTransform {
  const { core } = glyph;
  const rest = 1 - amount;
  const rate = amount > 0 ? (core.scale - rest) / amount : 0;
  return {
    translate: [core.dx * markScale, core.dy * markScale],
    rotation: core.rotation,
    scale: rest + (MARK_SCALE_BASE / zoom) * rate * amount,
    opacity: core.opacity,
  };
}

function findEyeGroup(
  groups: { anchor: Pt; loops: (PtLoop | null)[] }[],
  idx: number,
  anchor: Pt,
  range: number,
): { anchor: Pt; loops: (PtLoop | null)[] } | null {
  let best: { anchor: Pt; loops: (PtLoop | null)[] } | null = null;
  let bestDist = range;
  for (const g of groups) {
    if (g.loops[idx] != null) continue;
    const d = Math.hypot(g.anchor[0] - anchor[0], g.anchor[1] - anchor[1]);
    if (d < bestDist) {
      best = g;
      bestDist = d;
    }
  }
  return best;
}

function blendEyes(shapes: readonly { shape: BlendShapeInput; weight: number }[]): PtLoop[] {
  const range = (shapes[0]?.shape.radius ?? 0) * EYE_MATCH_SCALE;
  const groups: { anchor: Pt; loops: (PtLoop | null)[] }[] = [];
  shapes.forEach(({ shape }, i) => {
    for (const loop of shape.eyes) {
      const anchor = centroid(loop);
      const group = findEyeGroup(groups, i, anchor, range);
      if (group != null) {
        group.loops[i] = loop;
        continue;
      }
      const loops: (PtLoop | null)[] = shapes.map(() => null);
      loops[i] = loop;
      groups.push({ anchor, loops });
    }
  });
  return groups.map((group) => {
    const paths = group.loops.map((l) => (l == null ? null : closeRing(l)));
    const stations = uniqueFractions([BLEND_FRACTIONS, ...paths.map((p) => p?.stations ?? [])]);
    return weightedOutline(
      shapes.map(({ weight }, i) => {
        const path = paths[i];
        return {
          outline: path == null ? repeatPoint(group.anchor, stations.length) : resampleStations(path, stations),
          weight,
        };
      }),
    );
  });
}

// bodySize = body render size, glyphSize = glyph layer size (two separate params in source; appearance unused).
export function blendGeometry(frame: MarkFrame, bodySize: number, glyphSize: number = bodySize): BlendGeometry {
  const shapes = frame.bodies
    .map(({ body, weight }) => ({ shape: blendShapeFor(frame, body, bodySize), weight }))
    .sort((a, b) => b.weight - a.weight);
  const center = shapes[0]?.shape.center ?? [bodySize / 2, bodySize / 2];
  const radius = shapes[0]?.shape.radius ?? 0;
  const stripped = shapes.map(({ shape }) => stripPainted(shape));
  const angles = uniqueAngles([
    BLEND_ANGLES,
    ...stripped.map((body, i) => loopAngles(body, shapes[i]!.shape.center)),
  ]);
  const blended = weightedOutline(
    shapes.map(({ shape, weight }, i) => ({ outline: rayOutline(stripped[i]!, shape.center, angles), weight })),
  );
  const glyph = frame.morph == null ? null : renderGlyphs(frame.morph, glyphSize);
  const markScale = (MARK_SCALE_BASE * bodySize) / 2 / L;
  const round = glyph?.core.round ?? 0;
  return {
    size: bodySize,
    center,
    body: glyph == null || round === 0 ? blended : lerpOutline(blended, ringBlend(glyph, center, radius, angles), round),
    eyes: shapes.length === 1 ? (shapes[0]?.shape.eyes ?? []) : blendEyes(shapes),
    painted: shapes.length === 1 ? (shapes[0]?.shape.painted ?? []) : [],
    paintedOpacity: 1 - round,
    head: glyph == null || frame.morph == null ? null : headTransform(glyph, frame.morph.amount, frame.zoom, markScale),
    parts: glyph?.parts ?? [],
    markScale,
    zoom: glyph?.zoom ?? 1,
  };
}

export function glyphToSvg(part: GlyphPart, paint: string): SvgNode {
  const opacity = part.opacity < 1 ? { opacity: fmt2(part.opacity, 3) } : {};
  switch (part.type) {
    case `disc`:
      return el(`circle`, { cx: fmt2(part.cx), cy: fmt2(part.cy), r: fmt2(part.r), fill: paint, ...opacity });
    case `ring`: {
      const circ = 2 * Math.PI * part.r;
      const arc =
        part.arc == null
          ? {}
          : {
              "stroke-dasharray": `${fmt2(circ * part.arc.fraction)} ${fmt2(circ)}`,
              transform: `rotate(${fmt2(part.arc.startDeg)} ${fmt2(part.cx)} ${fmt2(part.cy)})`,
            };
      return el(`circle`, {
        cx: fmt2(part.cx),
        cy: fmt2(part.cy),
        r: fmt2(part.r),
        fill: `none`,
        stroke: paint,
        "stroke-width": fmt2(part.width),
        ...arc,
        ...opacity,
      });
    }
    case `shape`:
      return el(`path`, { d: part.d, transform: part.transform, fill: paint, ...opacity });
    case `stroke`:
      return el(`path`, {
        d: part.d,
        fill: `none`,
        stroke: paint,
        "stroke-width": fmt2(part.width),
        "stroke-linecap": `round`,
        "stroke-linejoin": `round`,
        ...opacity,
      });
    default:
      throw Error(`Unhandled case`);
  }
}

export function blendToSvg(geom: BlendGeometry, appearance: MarkAppearance, id: string, extent: number = geom.size): SvgNode {
  const { size, center } = geom;
  const ink = inkPaintOf(appearance);
  const bodyD = polylinePath(geom.body);
  const eyesD = geom.eyes.map(polylinePath).join(``);
  const defs: SvgNode[] = [];
  const content: SvgNode[] = [el(`path`, { d: bodyD, fill: ink })];
  if (eyesD !== `` && appearance.cutout) {
    defs.push(
      el(`mask`, { id: `${id}-holes`, maskUnits: `userSpaceOnUse`, x: 0, y: 0, width: size, height: size }, [
        el(`rect`, { width: size, height: size, fill: `#fff` }),
        el(`path`, { d: eyesD, fill: `#000` }),
      ]),
    );
    content[0] = el(`path`, { d: bodyD, fill: ink, mask: `url(#${id}-holes)` });
  } else if (eyesD !== ``) {
    defs.push(el(`clipPath`, { id: `${id}-body` }, [el(`path`, { d: bodyD })]));
    content.push(el(`path`, { d: eyesD, fill: spotPaintOf(appearance), "clip-path": `url(#${id}-body)` }));
  }
  if (geom.paintedOpacity > 0) {
    const opacityAttrs = geom.paintedOpacity < 1 ? { opacity: fmt2(geom.paintedOpacity, 3) } : {};
    for (const { fill, loops } of geom.painted)
      content.push(el(`path`, { d: loops.map(polylinePath).join(``), fill, ...opacityAttrs }));
  }
  const head = geom.head;
  const bodyGroup =
    head == null
      ? content
      : [
          el(
            `g`,
            {
              transform: `translate(${fmt2(center[0] + head.translate[0])} ${fmt2(center[1] + head.translate[1])}) rotate(${fmt2(head.rotation)}) scale(${fmt2(head.scale, 5)}) translate(${fmt2(-center[0])} ${fmt2(-center[1])})`,
              ...(head.opacity < 1 ? { opacity: fmt2(head.opacity, 3) } : {}),
            },
            content,
          ),
        ];
  const partsGroup =
    geom.parts.length === 0
      ? []
      : [
          el(
            `g`,
            { transform: `translate(${size / 2} ${size / 2}) scale(${fmt2(geom.markScale, 5)}) translate(${-L} ${-L})` },
            geom.parts.map((p) => glyphToSvg(p, ink)),
          ),
        ];
  const pivot = size / 2 + (MORPH_PENCIL_CENTER - L) * geom.markScale;
  const scene =
    geom.zoom === 1
      ? [...partsGroup, ...bodyGroup]
      : [
          el(
            `g`,
            {
              transform: `translate(${fmt2(pivot)} ${fmt2(pivot)}) scale(${fmt2(geom.zoom, 5)}) translate(${fmt2(-pivot)} ${fmt2(-pivot)})`,
            },
            [...partsGroup, ...bodyGroup],
          ),
        ];
  return svgRoot(size, id, extent, [...(defs.length === 0 ? [] : [el(`defs`, {}, defs)]), ...scene]);
}

export function renderBlendToSvg(
  frame: MarkFrame,
  appearance: MarkAppearance,
  size: number,
  id: string,
  glyphSize: number = size,
  extent: number = size,
): SvgNode {
  return blendToSvg(blendGeometry(frame, size, glyphSize), appearance, id, extent);
}

// ── Render dispatch ─────────────────────────────────

// Source opts displaySize/extent are merged into this repo's displaySize (doubles as glyph size and SVG frame width); proof ignored.
export function renderMarkToNode(
  frame: MarkFrame,
  appearance: MarkAppearance,
  resolution: number,
  id: string,
  opts: { displaySize?: number } = {},
): SvgNode {
  const [first, ...rest] = frame.bodies;
  const display = opts.displaySize ?? resolution;
  if (first == null || rest.length > 0 || frame.morph != null)
    return renderBlendToSvg(frame, appearance, resolution, id, display, display);
  if (first.body === `sphere`)
    return sphereSpriteToSvgNode(
      buildSphereSprite({ ...frame, body: first.body }, appearance, resolution, getEyeFrames(), getEyeFlip()),
      appearance,
      id,
      display,
    );
  return spriteToSvgNode(buildBodySprite({ ...frame, body: first.body }, appearance, resolution), id, display);
}

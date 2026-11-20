/**
 * morph (glyph transformation) controller.
 * Three springs: amount (visibility, k=14), swap (glyph-swap overlap, k=11), spin (spin angle, k=14), ζ=1.
 * progress/spawning have a duty cycle (hold HOLD_AFTER then hide, reappear after RESUME_AFTER); spawning spins ±π along a random direction.
 */
import type { GlyphKind, MorphSnapshot, StateMorphName } from "../types";
import { clamp } from "./math/misc";
import { makeRng } from "./math/rand";
import { makeSpringState, springStep, springSubsteps, type SpringState } from "./math/spring";

// State-level name → glyph kind (13)
export const MORPH_STATE_TO_GLYPH: Record<StateMorphName, GlyphKind> = {
  thinking: "dots",
  orbit: "orbit",
  radar: "radar",
  progress: "progress",
  spawning: "gather",
  dictating: "wave",
  sending: "send",
  receiving: "receive",
  uploading: "dock",
  bouncing: "ball",
  writing: "pencil",
  alerting: "bang",
  "powering-down": "standby",
};
// Spin step on spawn
export const PI = Math.PI;
// dt cap per advance
export const SHOT_DT = 0.1;
export const SPIN_SEED = 2654435769;
// States with a duty cycle
export const HOLD_SET = new Set<StateMorphName>(["progress", "spawning"]);
// Hold duration per state
export const HOLD_AFTER: Partial<Record<StateMorphName, number>> = { progress: 2.5, spawning: 2 };
// Interlude before resuming
export const RESUME_AFTER = 1.5;

export function holdFor(e: StateMorphName): number {
  return HOLD_AFTER[e] ?? 2.5;
}

export interface MorphInit {
  isReducedMotion?: boolean;
  seed?: number;
}

export interface MorphController {
  readonly target: StateMorphName | null;
  set(kind: StateMorphName | null): void;
  settle(): void;
  advance(dt: number): void;
  snapshot(): MorphSnapshot;
}

export function createMorphController(e: MorphInit = {}): MorphController {
  const t = e.isReducedMotion ?? false; // isReducedMotion
  const n = makeRng(e.seed ?? SPIN_SEED); // spin-direction PRNG
  const r = makeSpringState(0); // amount spring
  const i = makeSpringState(1); // swap spring
  const a = makeSpringState(0); // spin spring
  let o: StateMorphName | null = null; // target
  let s: StateMorphName | null = null; // applied target (change detection)
  let c: GlyphKind | null = null; // current kind
  let l: GlyphKind | null = null; // outgoing kind
  let u = false; // in HOLD
  let d = 0; // HOLD start time
  let f = 0; // accumulated spin angle
  let p = 1; // spin direction ±1
  let m = false; // previous visibility
  let h = 0; // clock
  let g = 0; // current kind start time
  let _ = 0; // shot start time
  let v = 0; // outgoing kind start time
  let y = 0; // outgoing shot start time
  const b = (): void => {
    const e = o == null ? null : MORPH_STATE_TO_GLYPH[o];
    const b = _;
    if (o !== s) {
      s = o;
      if (o != null) {
        _ = h;
        u = false;
      }
    }
    let x = e != null;
    if (o != null && HOLD_SET.has(o)) {
      if (!u && h - _ > holdFor(o)) {
        u = true;
        d = h;
      } else if (u && h - d > RESUME_AFTER) {
        u = false;
        _ = h;
      }
      x = !u;
    }
    r.t = +!!x;
    if (e != null && e !== c) {
      if (c != null && r.x > 0.02) {
        l = c;
        v = g;
        y = b;
        i.x = +!!t;
      } else {
        l = null;
        i.x = 1;
      }
      i.v = 0;
      i.t = 1;
      c = e;
      g = h;
    }
    if (e == null && r.x < 0.004) {
      c = null;
      l = null;
    }
    if (i.x > 0.996) l = null;
    if (x !== m) {
      if (x && !t) p = n() < 0.5 ? 1 : -1;
      if (!t) {
        f += PI * p;
        a.t = f;
      }
      m = x;
    }
  };
  return {
    get target() {
      return o;
    },
    set(e) {
      o = e;
    },
    advance(dt: number) {
      const n = dt > 0 ? Math.min(dt, SHOT_DT) : 0;
      h += n;
      b();
      const o = springSubsteps(n);
      const s = n / o;
      for (let e = 0; e < o; e++) {
        springStep(r, 14, 1, s);
        springStep(i, 11, 1, s);
        springStep(a, 14, 1, s);
      }
      if (t) {
        i.x = 1;
        a.x = a.t;
        r.x = r.t;
      }
    },
    settle() {
      b();
      for (const e of [r, i, a] as SpringState[]) {
        e.x = e.t;
        e.v = 0;
      }
      b();
    },
    snapshot(): MorphSnapshot {
      return {
        amount: clamp(r.x, 0, 1),
        spin: a.x,
        kind: c,
        outgoing: l,
        swap: clamp(i.x, 0, 1),
        clock: { stateTime: h - g, shotTime: h - _ },
        outgoingClock: { stateTime: h - v, shotTime: h - y },
        isReducedMotion: t,
        isSettled: Math.abs(r.x - r.t) < 0.001 && Math.abs(a.t - a.x) < 0.01 && i.x > 0.996,
      };
    },
  };
}

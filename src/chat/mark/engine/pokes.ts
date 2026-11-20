/**
 * Poke contributions.
 * spin: yaw half-cosine swing; bounce: lift + squash double bell; nod: pitch bell.
 */
import type { PokeKind } from "../types";
import { clamp } from "./math/misc";

export const POKE_KINDS: readonly PokeKind[] = ["spin", "bounce", "nod"];
// spin base duration
export const SPIN_BASE = 0.9;
// Extra duration per additional spin turn
export const SPIN_PER_TURN = 0.4;
export const BOUNCE_DURATION = 0.62;
// bounce lift amplitude
export const BOUNCE_LIFT = 0.3;
export const NOD_DURATION = 0.5;
// nod pitch amplitude (degrees)
export const NOD_AMP = 16;

export interface PokeRecord {
  poke: PokeKind;
  t: number;
  turns: number;
}

export interface PokeContribution {
  pitch: number;
  yaw: number;
  lift: number;
  squash: [number, number];
}

export function pokeDuration({ poke: e, turns: t }: { poke: PokeKind; turns: number }): number {
  switch (e) {
    case "spin":
      return SPIN_BASE + SPIN_PER_TURN * (t - 1);
    case "bounce":
      return BOUNCE_DURATION;
    case "nod":
      return NOD_DURATION;
    default:
      throw Error(`Unhandled case: ${String(e)}`);
  }
}

// Squared sine bell (zero at interval endpoints)
export function bell(e: number, t: number, n: number): number {
  return e <= t || e >= n ? 0 : Math.sin((Math.PI * (e - t)) / (n - t)) ** 2;
}

export function pokeContribution(e: readonly PokeRecord[]): PokeContribution {
  let t = 0;
  let n = 0;
  let r = 0;
  let i = 1;
  let a = 1;
  for (const o of e) {
    const p = Math.min(1, o.t / pokeDuration(o));
    switch (o.poke) {
      case "spin":
        n += 180 * o.turns * (1 - Math.cos(Math.PI * p));
        break;
      case "nod":
        t += NOD_AMP * bell(p, 0, 1);
        break;
      case "bounce": {
        const up = bell(p, 0, 0.18) + bell(p, 0.82, 1);
        const down = bell(p, 0.18, 0.82);
        r += BOUNCE_LIFT * Math.sin(Math.PI * clamp((p - 0.14) / 0.72, 0, 1));
        i *= 1 + 0.08 * up - 0.04 * down;
        a *= 1 - 0.1 * up + 0.06 * down;
        break;
      }
    }
  }
  return { pitch: t, yaw: n, lift: r, squash: [i, a] };
}

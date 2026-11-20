/**
 * Hash / PRNG / color seeds. The color index function depends on identity/palette.ts's pickable swatch.
 */
import type { ColorId } from "../../types";
import { PICKABLE_COLOR_IDS } from "../../identity/palette";

// Salt of colorSeedHash
const COLOR_HASH_SALT = 1;
// Salt of the color-seed secondary mix
const COLOR_SEED_SALT = 1;

// FNV-1a 32bit
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorSeedHash(s: string): number {
  return (fnv1a(s) ^ Math.imul(COLOR_HASH_SALT, 2654435769)) >>> 0;
}

// mulberry32
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Numeric seed → pickable color index
export function colorIndexForSeed(seed: number): number {
  const rng = mulberry32((seed ^ Math.imul(COLOR_SEED_SALT, 2654435769)) >>> 0);
  return Math.floor(rng() * PICKABLE_COLOR_IDS.length);
}

// String key → pickable color index
export function colorIndexFor(key: string): number {
  return colorIndexForSeed(colorSeedHash(key));
}

// String key → pickable color id
export function colorFor(key: string): ColorId {
  return PICKABLE_COLOR_IDS[colorIndexFor(key)] ?? "black";
}

// FNV + three avalanche rounds
export function avalanche(s: string): number {
  let h = fnv1a(s) | 0;
  h = Math.imul(h ^ (h >>> 16), 73244475);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// mulberry32 variant (|0 seed), used internally by the mark engine
export function makeRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

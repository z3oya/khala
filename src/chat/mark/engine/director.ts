/**
 * Director — state machine loop.
 * Shuffled queue: after Fisher-Yates, if the queue head is the current clip, swap it with the first non-current item (the current clip never enters the head).
 * advance's three rules: when holdSeconds elapses, switch to next; a hold-less next switches after a full round over clips.length items;
 * otherwise keep drawing from the shuffled queue.
 */
import type { Director, DirectorInit, MarkState, Puppet } from "../types";
import { CLIPS } from "../data/clips.generated";
import { DIRECTOR_TABLE } from "../data/director.generated";
import { makeRng } from "./math/rand";

// Fallback expression when emphasis is on and no face is set
const EMPHASIS_FACE = "surprised";

/** Full form of DirectorInit (types.ts does not list firstPhase). */
export interface DirectorInitFull extends DirectorInit {
  firstPhase?: number;
}

// Clip name → RawClip index
const CLIP_INDEX = new Map(CLIPS.map((c) => [c.name ?? "", c]));

function clipByName(e: string) {
  const t = CLIP_INDEX.get(e);
  if (t == null) throw Error(`No motion recipe named ${e}`);
  return t;
}

// Shuffle swap (the undefined guard is source behavior)
function swapAt(e: string[], t: number, n: number): void {
  const r = e[t];
  const i = e[n];
  if (r !== undefined && i !== undefined) {
    e[t] = i;
    e[n] = r;
  }
}

// Shuffle and guarantee the queue head is not the current clip
function shuffledAside(e: readonly string[], t: () => number, n: string | null): string[] {
  const r = [...e];
  for (let i = r.length - 1; i > 0; --i) swapAt(r, i, Math.floor(t() * (i + 1)));
  const idx = r.findIndex((c) => c !== n);
  if (idx > 0) swapAt(r, 0, idx);
  return r;
}

// With seed absent it goes through makeRng(1), hence the Partial parameter
export function createDirector(e: Puppet, t: MarkState, n: Partial<DirectorInitFull> = {}): Director & { readonly clip: string | null } {
  const r = makeRng(n.seed ?? 1); // shuffle/phase PRNG
  const i = new Map<readonly string[], string[]>(); // shuffle-queue cache per clip pool
  let a = n.isCompact ?? false; // isCompact
  let o = n.isResting ?? false; // isResting
  let s = false; // emphasis
  let c = o; // first-frame-passed flag (a resting start counts as passed)
  let l = t; // current state
  let u = DIRECTOR_TABLE[t]; // current director entry
  let d = 0; // holdSeconds timer
  let f = 0; // round-robin index for hold-less next
  let p = e.loopCount; // loopCount at last load
  let m: string | null = null; // current clip name
  const h = (): readonly string[] => (a && u.compactClips != null ? u.compactClips : u.clips);
  const g = (): boolean => u.next != null && u.holdSeconds == null;
  // Take the shuffled queue head (rebuild if empty)
  const _ = (): string | undefined => {
    const clips = h();
    let queue = i.get(clips) ?? [];
    if (queue.length === 0) {
      queue = shuffledAside(clips, r, m);
      i.set(clips, queue);
    }
    return queue.shift();
  };
  // Load the next clip (p refreshes before the early return, matching source behavior)
  const v = (): void => {
    const clipName = g() ? h()[f] : _();
    p = e.loopCount;
    if (clipName === undefined || clipName === m) return;
    const phase0 = c || g();
    e.load(clipByName(clipName), { phase: phase0 ? 0 : (n.firstPhase ?? r()) });
    c = true;
    m = clipName;
    p = e.loopCount;
  };
  // Hold the expression (emphasis fallback EMPHASIS_FACE)
  const y = (): void => {
    e.holdFace(u.face ?? (s ? EMPHASIS_FACE : null));
  };
  // Switch state (reset timer/round-robin, load the first clip)
  const b = (next: MarkState): void => {
    l = next;
    u = DIRECTOR_TABLE[next];
    d = 0;
    f = 0;
    e.setMorph(u.morph ?? null);
    y();
    if (!o) v();
  };
  if (o) e.rest();
  b(t);
  return {
    get state() {
      return l;
    },
    get clip() {
      return m;
    },
    setState(next) {
      if (next !== l) b(next);
    },
    setCompact(isCompact): void {
      a = isCompact;
    },
    setEmphasis(isEmphasis): void {
      if (isEmphasis !== s) {
        s = isEmphasis;
        y();
      }
    },
    setResting(isResting): void {
      if (isResting !== o) {
        o = isResting;
        if (o) {
          e.rest();
          m = null;
        } else v(); // v is the closure above: do not shadow it with a parameter name
      }
    },
    advance(dt: number): void {
      if (o) return;
      d += dt;
      const next = u.next;
      if (next != null && u.holdSeconds != null && d >= u.holdSeconds) b(next);
      else if (e.loopCount !== p) {
        if (next != null && u.holdSeconds == null && (++f, f >= h().length)) b(next);
        else v();
      }
    },
  };
}

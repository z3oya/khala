/**
 * grok-bot-mark 1:1 replica — shared type contract.
 * All modules import types only from here; see PORTING.md for implementation details.
 * See PORTING.md §2 for the mapping between type names and original engine concepts.
 */

// ── Vocabularies ────────────────────────────────────────────────

/** Engine body ids (26; pumpkin is stubbed to sphere). */
export type BodyId =
  | "sphere" | "cloud" | "square" | "sparkle" | "clover" | "heartChubby"
  | "starFlower" | "teardrop" | "tablet" | "wedge" | "house" | "star6"
  | "pebble" | "bean" | "egg" | "squircle" | "capsule" | "cylinder"
  | "hex" | "gem" | "crystal" | "shield" | "dome" | "arch" | "leaf" | "pumpkin";

/** Picker shape ids (25+pumpkin; mapped to BodyId via pickerToBody). */
export type ShapeId =
  | "blob" | "pebble" | "bean" | "egg" | "squircle" | "tablet" | "capsule"
  | "cylinder" | "hex" | "gem" | "crystal" | "wedge" | "shield" | "dome"
  | "arch" | "cloud" | "teardrop" | "leaf" | "square" | "sparkle" | "clover"
  | "flower" | "heart" | "house" | "star" | "pumpkin";

export type ColorId =
  | "black" | "brown" | "red" | "orange" | "yellow" | "green"
  | "cyan" | "blue" | "violet" | "magenta" | "gray";

/** 9 expressions. */
export type FaceName =
  | "neutral" | "happy" | "surprised" | "sad" | "sleepy"
  | "squinted" | "calm" | "inspecting" | "confused";

/** 53 states (5 groups flattened). */
export type MarkState =
  | "idle" | "listening" | "thinking" | "streaming" | "searching" | "reading"
  | "working" | "coding" | "running" | "computing" | "controlling" | "waiting"
  | "blocked" | "finished" | "failed" | "sleeping" | "waking"
  | "happy" | "excited" | "laughing" | "proud" | "curious" | "playful"
  | "shy" | "surprised" | "suspicious" | "angry" | "confused" | "sad"
  | "drowsy" | "bored" | "scared" | "celebrate" | "approving"
  | "orbit" | "radar" | "progress" | "spawning" | "loading" | "dictating"
  | "sending" | "receiving" | "uploading" | "writing" | "alerting"
  | "bouncing" | "powering-down"
  | "humming" | "notifying" | "dragging"
  | "logo" | "showcase" | "turntable";

/** State-level morph names (13). */
export type StateMorphName =
  | "thinking" | "orbit" | "radar" | "progress" | "spawning" | "dictating"
  | "sending" | "receiving" | "uploading" | "bouncing" | "writing"
  | "alerting" | "powering-down";

/** Glyph kinds (13). */
export type GlyphKind =
  | "dots" | "orbit" | "radar" | "progress" | "gather" | "wave" | "send"
  | "receive" | "dock" | "ball" | "pencil" | "bang" | "standby";

export type PokeKind = "spin" | "bounce" | "nod";
export type LookDir = "left" | "right" | "up" | "down" | "center";

// ── Basic geometry ──────────────────────────────────────────────

export type RGB = readonly [number, number, number];
/** [w, x, y, z]。 */
export type Quat = readonly [number, number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** Single model eye (all eye state lives here; units = spherical radians). */
export interface EyeShape {
  off: Vec2;
  tilt: number;
  /** Half width */
  wid: number;
  /** 0..1 eyelid closure (1 = fully open) */
  lidY: number;
  oval: Vec2;
  ovalMix: number;
  pts: Vec2[];
  /** 18 floats for a 3-segment cubic bezier, or null (degenerate/sampled path) */
  path: readonly number[] | null;
  fillRing: Vec2[] | null;
}

export interface Keyframe {
  t: number;
  v: number[];
  ease: readonly [number, number, number, number];
}

export interface ExpressionEvent {
  t: number;
  name: FaceName;
  isThroughBlink: boolean;
}

export interface Clip {
  name: string;
  duration: number;
  body: BodyId | null;
  squashAnchor: number;
  restTime: number;
  inspect: { bias?: number; isFollowingTurn?: boolean };
  position: Keyframe[];
  rotation: Keyframe[];
  squash: Keyframe[];
  zoom: Keyframe[];
  lids: Keyframe[];
  expression: ExpressionEvent[];
}

export interface MorphClock {
  stateTime: number;
  shotTime: number;
}

export interface MorphSnapshot {
  amount: number;
  spin: number;
  kind: GlyphKind | null;
  outgoing: GlyphKind | null;
  swap: number;
  clock: MorphClock;
  outgoingClock: MorphClock;
  isReducedMotion: boolean;
  isSettled: boolean;
}

export interface GlowSpec {
  inner: RGB;
  mid: RGB;
  rim: RGB;
  midT: number;
  halo: number;
}

export interface MarkFrame {
  body: BodyId;
  quat: Quat;
  zoom: number;
  offset: Vec2;
  squash: Vec2;
  squashAnchor: number;
  eyes: EyeShape[] | null;
  glow: GlowSpec | null;
  inspectWeight: number;
  bodies: { body: BodyId; weight: number }[];
  morph: MorphSnapshot | null;
}

export interface MarkAppearance {
  /** Body fill (CSS var or color string) */
  inkPaint: string;
  /** Eye fill; when non-empty, eyes switch from cutout to filled */
  spotPaint: string | null;
  cutout: boolean;
}

// ── Engine objects ─────────────────────────────────────────────

export interface FaceModule {
  readonly name: FaceName;
  readonly isMorphing: boolean;
  eyes(): EyeShape[];
  inspectWeight(): number;
  blinkAmount(): number | null;
  morph(face: FaceName): void;
  lidMorph(face: FaceName): void;
  blink(): void;
  play(ev: ExpressionEvent): void;
  step(dt: number): void;
  release(): void;
  seek(events: readonly ExpressionEvent[], t: number): void;
}

export interface PuppetInit {
  body?: BodyId;
  zoomMul?: number;
  isGazeAlways?: boolean;
}

export interface Puppet {
  readonly isPlaying: boolean;
  readonly time: number;
  readonly duration: number;
  readonly loopCount: number;
  readonly face: FaceName;
  readonly isSettled: boolean;
  load(recipe: RawClip, opts?: { isPlaying?: boolean; transition?: "bridge" | "cut"; phase?: number }): void;
  rest(): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(t: number): void;
  setBody(body: BodyId, opts?: { isInstant?: boolean }): void;
  setMorph(morph: StateMorphName | null, opts?: { isInstant?: boolean }): void;
  setExpression(face: FaceName, opts?: { isThroughBlink?: boolean }): void;
  holdFace(face: FaceName | null): void;
  poke(kind: PokeKind, opts?: { turns?: number }): void;
  blink(): void;
  setInspect(inspect: { bias?: number; isFollowingTurn?: boolean }): void;
  setGaze(g: Vec2 | null): void;
  setGazeAlways(v: boolean): void;
  look(dir: LookDir): void;
  setGlow(g: GlowSpec | null): void;
  advance(dt: number): void;
  frame(): MarkFrame;
}

export interface DirectorInit {
  seed: number;
  isCompact?: boolean;
  isResting?: boolean;
}

export interface Director {
  readonly state: MarkState;
  setState(s: MarkState): void;
  setCompact(v: boolean): void;
  setEmphasis(v: boolean): void;
  setResting(v: boolean): void;
  advance(dt: number): void;
}

// ── Raw clip material (pre-normalization form of generated data) ──────────────────

export interface RawKeyframe {
  t: number;
  v: number[] | string;
  ease?: readonly number[];
  /** Source cut flag: a direct switch without blinking; mapped to isThroughBlink at load time. */
  cut?: boolean;
}

export interface RawClip {
  name?: string;
  duration: number;
  body?: string;
  squashAnchor?: number;
  workArea?: { start: number; end: number } | null;
  inspect?: { bias?: number; follow?: boolean };
  tracks: Record<string, RawKeyframe[]>;
}

export interface DirectorEntry {
  clips: string[];
  compactClips?: string[];
  face?: FaceName;
  morph?: StateMorphName;
  next?: MarkState;
  holdSeconds?: number;
}

// ── Rendering and host ──────────────────────────────────────────

export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number | undefined>;
  children: SvgNode[];
}

export interface MarkHostProps {
  id: string;
  body: BodyId;
  appearance: MarkAppearance;
  state?: MarkState;
  clip?: RawClip | null;
  morph?: StateMorphName | null;
  size: number | "fill";
  fill?: number;
  resolution?: number;
  maxFrameRate?: number;
  isPlaying?: boolean;
  isEmphasized?: boolean;
  isFollowingPointer?: boolean;
  isStatic?: boolean;
  isProof?: boolean;
  seed?: string;
}

export interface MarkHost {
  attach(el: HTMLElement): () => void;
  update(props: Partial<MarkHostProps>): void;
  poke(kind: PokeKind, opts?: { turns?: number }): void;
  gaze(g: Vec2 | null): void;
  blink(): void;
  look(dir: LookDir): void;
  restart(): void;
  setExpression(face: FaceName, opts?: { isThroughBlink?: boolean }): void;
  setBody(body: BodyId): void;
  setPlaying(v: boolean): void;
  setState(state: MarkState): void;
}

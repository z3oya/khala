/**
 * GrokBotMark — React wrapper (props surface aligned with the original hT).
 * The props → MarkHostProps mapping is kept in the pure function buildHostProps (testable without DOM);
 * color only affects the outer span's CSS gradient backdrop and never reaches the engine.
 */
import { useEffect, useId, useImperativeHandle, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import type {
  ColorId,
  FaceName,
  LookDir,
  MarkHostProps,
  MarkState,
  PokeKind,
  ShapeId,
  Vec2,
} from "./types";
import { pickerToBody } from "./identity/shapes";
import { gradientFor } from "./identity/palette";
import { useMarkHost } from "./useMarkHost";

export interface GrokBotMarkProps {
  color?: ColorId;
  shape?: ShapeId;
  /** Stable source id (agent session id etc.): used as the host seed and decides the director schedule. */
  sourceId?: string;
  state?: MarkState;
  /** Engine ink color (CSS color string); defaults to --grok-bot-ink. */
  ink?: string;
  /** Eye fill color; when given, eyes switch from cutout to filled. */
  eyeColor?: string;
  /** Fixed pixel size (host size takes the numeric path, no ResizeObserver). */
  sizePx?: number;
  /** CSS size string; "fill" makes host size take the container-width path. */
  sizeCss?: string;
  isPaused?: boolean;
  maxFrameRate?: number;
  isEmphasized?: boolean;
  isFollowingPointer?: boolean;
  /** Any change triggers poke("spin", { turns: 2 }) (self-incrementing counter usage). */
  spinSignal?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<MarkHandle>;
}

export interface MarkHandle {
  poke(k: PokeKind, o?: { turns?: number }): void;
  gaze(g: Vec2 | null): void;
  blink(): void;
  look(d: LookDir): void;
  restart(): void;
  setExpression(f: FaceName, o?: { isThroughBlink?: boolean }): void;
}

/** Fallback edge length when both sizePx/sizeCss are absent. */
export const DEFAULT_MARK_SIZE_PX = 24;

/** Non-pure-px strings ("fill"/%/em…) always go to "fill" (ResizeObserver measures the container width); pure Npx takes N. */
function parseSizeCss(css: string | undefined): number | "fill" {
  if (css == null) return DEFAULT_MARK_SIZE_PX;
  const s = css.trim();
  if (!s.endsWith("px")) return "fill";
  const n = Number.parseFloat(s.slice(0, -2));
  return Number.isFinite(n) ? n : "fill";
}

/** GrokBotMarkProps → MarkHostProps (pure function, shared by the component and tests). */
export function buildHostProps(props: GrokBotMarkProps, instanceId: string): MarkHostProps {
  return {
    id: instanceId,
    body: pickerToBody(props.shape ?? "blob"),
    appearance: {
      inkPaint: props.ink ?? "var(--grok-bot-ink)",
      spotPaint: props.eyeColor ?? null,
      cutout: props.eyeColor == null,
    },
    state: props.state ?? "idle",
    size: props.sizePx ?? parseSizeCss(props.sizeCss),
    isPlaying: !(props.isPaused ?? false),
    maxFrameRate: props.maxFrameRate,
    isEmphasized: props.isEmphasized ?? false,
    isFollowingPointer: props.isFollowingPointer ?? false,
    seed: props.sourceId,
  };
}

export function GrokBotMark(props: GrokBotMarkProps) {
  const { ref } = props;
  // React useId contains ":" and similar characters, unsafe as an SVG gradient id prefix; strip them first.
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hostProps = useMemo(
    () => buildHostProps(props, instanceId),
    [
      instanceId,
      props.shape,
      props.ink,
      props.eyeColor,
      props.state,
      props.sizePx,
      props.sizeCss,
      props.isPaused,
      props.maxFrameRate,
      props.isEmphasized,
      props.isFollowingPointer,
      props.sourceId,
    ],
  );
  const { setRef, host } = useMarkHost(hostProps);

  const prevSpin = useRef<number | undefined>(props.spinSignal);
  useEffect(() => {
    if (props.spinSignal !== prevSpin.current) {
      prevSpin.current = props.spinSignal;
      host.poke("spin", { turns: 2 });
    }
  }, [props.spinSignal, host]);

  useImperativeHandle(
    ref,
    () => ({
      poke: (k, o) => host.poke(k, o),
      gaze: (g) => host.gaze(g),
      blink: () => host.blink(),
      look: (d) => host.look(d),
      restart: () => host.restart(),
      setExpression: (f, o) => host.setExpression(f, o),
    }),
    [host],
  );

  const sizeStyle: CSSProperties =
    props.sizePx != null
      ? { width: props.sizePx, height: props.sizePx }
      : props.sizeCss === "fill"
        ? { width: "100%", height: "100%" }
        : props.sizeCss != null
          ? { width: props.sizeCss, height: props.sizeCss }
          : { width: DEFAULT_MARK_SIZE_PX, height: DEFAULT_MARK_SIZE_PX };
  const gradient = props.color != null ? gradientFor(props.color) : null;
  const style: CSSProperties = {
    ...sizeStyle,
    ...(gradient
      ? { background: `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})` }
      : null),
    ...props.style,
  };
  const className =
    `grok-bot-mark${props.color != null ? " grok-bot-mark--backdrop" : ""}` +
    (props.className != null ? ` ${props.className}` : "");

  return (
    <span
      ref={setRef}
      className={className}
      data-grok-state={props.state ?? "idle"}
      data-paused={props.isPaused || undefined}
      aria-hidden
      style={style}
    >
      {props.children}
    </span>
  );
}

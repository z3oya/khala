/* Sample app: grok-bot-mark 1:1 port showcase — 53 states, 25 picker shapes,
 * poke/blink/look commands, pointer gaze following, seed-driven director.
 * All interaction is local React state; engine lives in chat/mark. */
import { useRef, useState } from "react";
import { GrokBotMark } from "../../mark/GrokBotMark";
import type { MarkHandle } from "../../mark/GrokBotMark";
import type { ColorId, MarkState, ShapeId } from "../../mark/types";
import { pickerToBody } from "../../mark/identity/shapes";
import { pickablePalette } from "../../mark/identity/palette";
import { PICKER_SHAPES, STATES } from "../../mark/data/shapes.generated";

const GRID_STATES: MarkState[] = [
  "idle", "working", "streaming", "thinking",
  "blocked", "sleeping", "celebrate", "logo",
];
const GRID_SHAPES: ShapeId[] = PICKER_SHAPES.slice(0, 10);

const LOOK_BUTTONS: { label: string; dir: "left" | "right" | "up" | "down" }[] = [
  { label: "look-left", dir: "left" },
  { label: "look-right", dir: "right" },
  { label: "look-up", dir: "up" },
  { label: "look-down", dir: "down" },
];

export function MarkShowcaseApp() {
  const [state, setState] = useState<MarkState>("idle");
  const [shape, setShape] = useState<ShapeId>("blob");
  const [color, setColor] = useState<ColorId | null>(null);
  const [sourceId, setSourceId] = useState("khala");
  const [isPaused, setPaused] = useState(false);
  const [isEmphasized, setEmphasized] = useState(false);
  const [isFollowingPointer, setFollowingPointer] = useState(true);
  const markRef = useRef<MarkHandle | null>(null);

  return (
    <div className="sa-root" data-testid="chat-sample-app" data-sample="mark">
      <div className="mark-showcase-stage">
        <GrokBotMark
          key={sourceId}
          ref={markRef}
          state={state}
          shape={shape}
          color={color ?? undefined}
          sourceId={sourceId}
          sizePx={160}
          isPaused={isPaused}
          isEmphasized={isEmphasized}
          isFollowingPointer={isFollowingPointer}
        />
      </div>

      <div className="sa-row sa-wrap">
        <label className="sa-label" htmlFor="sa-mark-state">状态</label>
        <select
          id="sa-mark-state"
          className="sa-input mark-showcase-select"
          value={state}
          onChange={(e) => setState(e.target.value as MarkState)}
        >
          {STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="sa-label" htmlFor="sa-mark-shape">形状</label>
        <select
          id="sa-mark-shape"
          className="sa-input mark-showcase-select"
          value={shape}
          onChange={(e) => setShape(e.target.value as ShapeId)}
        >
          {PICKER_SHAPES.map((s) => (
            <option key={s} value={s}>{s} → {pickerToBody(s)}</option>
          ))}
        </select>
        <label className="sa-label" htmlFor="sa-mark-seed">seed</label>
        <input
          id="sa-mark-seed"
          className="sa-input mark-showcase-seed"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        />
      </div>

      <div className="sa-row sa-wrap">
        {pickablePalette.map((c) => (
          <button
            key={c.id}
            className={`mark-showcase-dot${color === c.id ? " active" : ""}`}
            style={{ background: c.value }}
            title={c.label}
            aria-label={c.label}
            aria-pressed={color === c.id}
            onClick={() => setColor(color === c.id ? null : c.id)}
          />
        ))}
        <button
          className={`sa-chip${isPaused ? " active" : ""}`}
          aria-pressed={isPaused}
          onClick={() => setPaused(!isPaused)}
        >
          暂停
        </button>
        <button
          className={`sa-chip${isEmphasized ? " active" : ""}`}
          aria-pressed={isEmphasized}
          onClick={() => setEmphasized(!isEmphasized)}
        >
          强调
        </button>
        <button
          className={`sa-chip${isFollowingPointer ? " active" : ""}`}
          aria-pressed={isFollowingPointer}
          onClick={() => setFollowingPointer(!isFollowingPointer)}
        >
          跟随光标
        </button>
      </div>

      <div className="sa-row sa-wrap">
        <button className="cbtn cbtn-ink sa-btn" onClick={() => markRef.current?.poke("spin", { turns: 2 })}>
          spin ×2
        </button>
        <button className="cbtn cbtn-ghost sa-btn" onClick={() => markRef.current?.poke("bounce")}>
          bounce
        </button>
        <button className="cbtn cbtn-ghost sa-btn" onClick={() => markRef.current?.poke("nod")}>
          nod
        </button>
        <button className="cbtn cbtn-ghost sa-btn" onClick={() => markRef.current?.blink()}>
          blink
        </button>
        {LOOK_BUTTONS.map(({ label, dir }) => (
          <button key={label} className="cbtn cbtn-ghost sa-btn" onClick={() => markRef.current?.look(dir)}>
            {label}
          </button>
        ))}
        <button className="cbtn cbtn-ghost sa-btn" onClick={() => markRef.current?.restart()}>
          restart
        </button>
      </div>

      <span className="sa-label">代表状态 × 56px</span>
      <div className="mark-showcase-grid">
        {GRID_STATES.map((s) => (
          <div key={s} className="mark-showcase-cell">
            <GrokBotMark state={s} sizePx={56} maxFrameRate={30} sourceId={`showcase-${s}`} />
            <span className="mark-showcase-cell-label">{s}</span>
          </div>
        ))}
      </div>

      <span className="sa-label">形状（默认状态）× 56px</span>
      <div className="mark-showcase-grid">
        {GRID_SHAPES.map((s) => (
          <div key={s} className="mark-showcase-cell">
            <GrokBotMark shape={s} sizePx={56} maxFrameRate={30} sourceId={`showcase-shape-${s}`} />
            <span className="mark-showcase-cell-label">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

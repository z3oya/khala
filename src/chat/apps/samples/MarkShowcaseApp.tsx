/* Sample app: grok-bot-mark 1:1 port showcase — 53 states, 25 picker shapes,
 * poke/blink/look commands, pointer gaze following, seed-driven director.
 * All interaction is local React state; engine lives in chat/mark. */
import { useRef, useState } from "react";
import { GrokBotMark } from "../../mark/GrokBotMark";
import type { MarkHandle } from "../../mark/GrokBotMark";
import type { ColorId, MarkState, ShapeId } from "../../mark/types";
import { pickablePalette } from "../../mark/identity/palette";
import { PICKER_SHAPES, STATES } from "../../mark/data/shapes.generated";

const GRID_STATES: MarkState[] = [
  "idle", "working", "streaming", "thinking",
  "blocked", "sleeping", "celebrate", "logo",
];
const GRID_SHAPES: ShapeId[] = PICKER_SHAPES.slice(0, 10);

/** Shape picker groups: original vocab first, extensions last. */
const SHAPE_GROUPS: { group: string; shapes: ShapeId[] }[] = [
  { group: "原版形体", shapes: PICKER_SHAPES },
  { group: "扩展", shapes: ["bubble"] },
];

const SHAPE_ZH: Partial<Record<ShapeId, string>> = {
  blob: "水滴", pebble: "鹅卵石", bean: "豆子", egg: "蛋", squircle: "方圆",
  tablet: "平板", capsule: "胶囊", cylinder: "圆柱", hex: "六边形", gem: "宝石",
  crystal: "水晶", wedge: "楔子", shield: "盾牌", dome: "穹顶", arch: "拱门",
  cloud: "云朵", teardrop: "泪滴", leaf: "叶子", square: "方形", sparkle: "四角星",
  clover: "四叶草", flower: "花朵", heart: "爱心", house: "小屋", star: "星形",
  pumpkin: "南瓜", bubble: "对话气泡",
};

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

  // "bubble" (wechat) is a sibling shape; the brand look (green body, white eyes)
  // comes from the preset unless a palette dot overrides the ink.
  const isWechat = shape === "bubble";

  return (
    <div className="sa-root" data-testid="chat-sample-app" data-sample="mark">
      <div className="mark-showcase-stage">
        <GrokBotMark
          key={sourceId}
          ref={markRef}
          state={state}
          shape={shape}
          preset={isWechat ? "wechat" : undefined}
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
          {SHAPE_GROUPS.map(({ group, shapes }) => (
            <optgroup key={group} label={group}>
              {shapes.map((s) => (
                <option key={s} value={s}>
                  {SHAPE_ZH[s]} {s}
                  {s === "bubble" ? "（微信）" : ""}
                </option>
              ))}
            </optgroup>
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
        {/* look() only sustains while the clip is not re-sampling the pose
            (engine de() clears the look anim every frame while playing),
            so clicking a look button parks the mark in the paused state first. */}
        {LOOK_BUTTONS.map(({ label, dir }) => (
          <button
            key={label}
            className="cbtn cbtn-ghost sa-btn"
            title="暂停态生效：自动暂停后保持朝向"
            onClick={() => {
              markRef.current?.setPlaying(false);
              setPaused(true);
              markRef.current?.look(dir);
            }}
          >
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

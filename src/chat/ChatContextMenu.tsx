import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

export interface CtxItem {
  key: string;
  label: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  submenu?: CtxItem[];
  /* Radio marker: rendered only when defined. */
  checked?: boolean;
}

/** Menu opener source: pointer events and F2's synthetic coordinates. */
export type CtxEvent = Pick<MouseEvent, "preventDefault" | "stopPropagation"> & {
  clientX: number;
  clientY: number;
};

interface Props {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
  /* Bottom-anchor mode: the menu opens above y. */
  openUp?: boolean;
}

export function ChatContextMenu({ x, y, items, onClose, openUp }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const ty = openUp ? y - el.offsetHeight - 4 : y;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 8)),
      y: Math.max(4, Math.min(ty, window.innerHeight - el.offsetHeight - 8)),
    });
  }, [x, y, items, openUp]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("wheel", close, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("wheel", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      data-testid="chat-context-menu"
      data-item-count={items.length}
      role="menu"
      /* Keep the outside-press closer from seeing menu-internal presses. */
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div key={item.key} className="ctx-branch" onMouseEnter={() => setOpenSub(item.submenu ? item.key : null)}>
          <button
            type="button"
            role="menuitem"
            className={`ctx-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
            data-testid="chat-context-item"
            data-action={item.key}
            data-checked={item.checked}
            disabled={item.disabled}
            aria-haspopup={item.submenu ? "menu" : undefined}
            aria-expanded={item.submenu ? openSub === item.key : undefined}
            onClick={() => {
              if (item.submenu) {
                setOpenSub(item.key);
                return;
              }
              onClose();
              item.action?.();
            }}
          >
            {item.checked !== undefined && <span className="ctx-check">{item.checked ? "●" : "○"}</span>}
            {item.label}
            {item.submenu && <span className="ctx-more">{">"}</span>}
          </button>
          {item.submenu && openSub === item.key && <CtxFlyout items={item.submenu} onClose={onClose} />}
        </div>
      ))}
    </div>
  );
}

/** Flyout beside its parent branch; plain items only. */
function CtxFlyout({ items, onClose }: { items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const branch = el?.parentElement;
    if (!el || !branch) return;
    const r = branch.getBoundingClientRect();
    /* -1px overlap: no gap for the pointer to fall through between panels. */
    setPos({
      x: Math.max(4, Math.min(r.right - 1, window.innerWidth - el.offsetWidth - 8)),
      y: Math.max(4, Math.min(r.top - 5, window.innerHeight - el.offsetHeight - 8)),
    });
  }, [items]);

  return (
    <div
      ref={ref}
      className="ctx-menu ctx-sub"
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      data-testid="chat-context-submenu"
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={`ctx-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
          data-testid="chat-context-item"
          data-action={item.key}
          data-checked={item.checked}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.action?.();
          }}
        >
          {item.checked !== undefined && <span className="ctx-check">{item.checked ? "●" : "○"}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}

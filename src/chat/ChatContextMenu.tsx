import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface CtxItem {
  key: string;
  label: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}

export function ChatContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 8)),
      y: Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 8)),
    });
  }, [x, y, items]);

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
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={`ctx-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
          data-testid="chat-context-item"
          data-action={item.key}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.action?.();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

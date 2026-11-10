/*
 * Sidebar drag-resize. Pointer capture on the handle keeps move/up events
 * flowing even when the pointer leaves the window mid-drag.
 */
import { useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export const MIN_SIDEBAR_WIDTH = 320;

interface Options {
  width: number;
  onWidth: (width: number) => void;
  onDragging: (dragging: boolean) => void;
}

export function useSidebarResize({ width, onWidth, onDragging }: Options) {
  return useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const startX = e.clientX;
      const startWidth = width;
      handle.setPointerCapture(e.pointerId);
      onDragging(true);
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const clamp = (next: number) =>
        Math.min(
          Math.max(next, MIN_SIDEBAR_WIDTH),
          Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth / 2)),
        );
      const onMove = (ev: globalThis.PointerEvent) => {
        onWidth(clamp(startWidth + (ev.clientX - startX)));
      };
      const unbind = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
      };
      const finish = () => {
        unbind();
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        onDragging(false);
      };
      const onUp = () => finish();
      const onCancel = () => finish();

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
    },
    [width, onWidth, onDragging],
  );
}

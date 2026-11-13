/* Sortable row: useSortable wrapper keeping the list's flat .t-row DOM.
 * dnd-kit's transform/transition stay unused — rows never shift; the ghost
 * overlay and insertion line carry the drag. */
import { memo, useMemo, type HTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import type { Session } from "../types";
import { dropPosOf } from "./ordering";
import { MemoTaskRow, type SortableBindings, type TaskRowOps } from "./TaskRow";

export const SortableTaskRow = memo(function SortableTaskRow({
  session,
  scope,
  ops,
  testid,
}: {
  session: Session;
  scope: string;
  ops: TaskRowOps;
  testid?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    active,
    activeIndex,
    index,
    isOver,
  } = useSortable({ id: session.id, data: { scope } });

  const dropPos =
    isOver && active && activeIndex >= 0 && activeIndex !== index && active.data.current?.scope === scope
      ? dropPosOf(activeIndex, index)
      : undefined;

  const sortable = useMemo<SortableBindings>(
    () => ({
      ref: setNodeRef,
      attributes: attributes as HTMLAttributes<HTMLDivElement>,
      listeners: listeners as unknown as HTMLAttributes<HTMLDivElement>,
      dragging: isDragging,
      dropPos,
    }),
    [setNodeRef, isDragging, dropPos, attributes, listeners],
  );

  return <MemoTaskRow session={session} ops={ops} testid={testid} sortable={sortable} />;
});

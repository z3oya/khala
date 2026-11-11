/* Sortable row: useSortable wrapper keeping the list's flat .t-row DOM. */
import { memo, useMemo, type HTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
    transform,
    transition,
    isDragging,
    active,
    activeIndex,
    index,
    isOver,
  } = useSortable({ id: session.id, data: { scope } });

  const transformString = useMemo(
    () => (transform ? CSS.Transform.toString(transform) : undefined),
    [transform],
  );

  const dropPos =
    isOver && active && activeIndex >= 0 && active.data.current?.scope === scope
      ? dropPosOf(activeIndex, index)
      : undefined;

  const sortable = useMemo<SortableBindings>(
    () => ({
      ref: setNodeRef,
      style: {
        transform: transformString,
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0 : undefined,
      },
      attributes: attributes as HTMLAttributes<HTMLDivElement>,
      listeners: listeners as unknown as HTMLAttributes<HTMLDivElement>,
      dragging: isDragging,
      dropPos,
    }),
    [setNodeRef, transformString, transition, isDragging, dropPos, attributes, listeners],
  );

  return <MemoTaskRow session={session} ops={ops} testid={testid} sortable={sortable} />;
});

/* Task row: 32px line, 16px status slot (error > unread > spinner > idle;
 * pinned rows swap the slot for a pin), hover-only actions, two-click archive. */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Archive, Check, LoaderCircle, Pin } from "lucide-react";
import type { CtxItem } from "../ChatContextMenu";
import { relTime, useI18n } from "../i18n";
import type { Session } from "../types";

export interface TaskRowOps {
  activeId: string | null;
  onSelect: (id: string, unreadAtMs?: number) => void;
  onTogglePin: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onCtx: (e: ReactMouseEvent, items: CtxItem[]) => void;
}

/** dnd-kit binding bag applied to the row root; absent → plain row. */
export interface SortableBindings {
  ref?: (node: HTMLDivElement | null) => void;
  style?: CSSProperties;
  attributes?: HTMLAttributes<HTMLDivElement>;
  listeners?: HTMLAttributes<HTMLDivElement>;
  dragging?: boolean;
  dropPos?: "before" | "after";
}

export function hasPendingPermission(s: Session): boolean {
  return s.messages.some((m) => m.blocks.some((b) => b.kind === "permission" && !b.decision));
}

export function TaskRow({
  session,
  ops,
  testid = "task-item",
  sortable,
}: {
  session: Session;
  ops: TaskRowOps;
  testid?: string;
  sortable?: SortableBindings;
}) {
  const { t, lang } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const disarm = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setConfirming(false);
  }, []);

  const startArchive = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (confirming) {
      disarm();
      ops.onArchive(session.id);
      return;
    }
    setConfirming(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConfirming(false), 3000);
  };

  const active = session.id === ops.activeId;
  const waiting = hasPendingPermission(session);
  const summary = session.changeSummary;

  const menu: CtxItem[] = [
    { key: "open", label: t("open"), action: () => ops.onSelect(session.id, session.unreadAtMs) },
    {
      key: "toggle-pin",
      label: session.pinned ? t("unpin") : t("pin"),
      action: () => ops.onTogglePin(session.id),
    },
    { key: "rename", label: t("rename"), action: () => ops.onRename(session.id) },
    { key: "archive", label: t("archive"), action: () => ops.onArchive(session.id) },
    { key: "mark-unread", label: t("markUnread"), action: () => ops.onMarkUnread(session.id) },
    { key: "delete", label: t("delete"), danger: true, action: () => ops.onDelete(session.id) },
  ];
  const archiveLabel = confirming ? t("confirmArchive") : t("archive");

  return (
    <div
      ref={sortable?.ref}
      style={sortable?.style}
      {...(sortable?.attributes ?? {})}
      {...(sortable?.listeners ?? {})}
      role="button"
      tabIndex={0}
      className={`t-row${active ? " active" : ""}${confirming ? " confirming" : ""}`}
      data-testid={testid}
      data-id={session.id}
      data-project={session.projectId}
      data-group={session.groupId}
      data-pinned={session.pinned}
      data-status={session.status}
      data-unread={session.unreadAtMs !== undefined || undefined}
      data-waiting={waiting || undefined}
      data-active={active}
      data-dragging={sortable?.dragging || undefined}
      data-drop-pos={sortable?.dropPos}
      onClick={() => ops.onSelect(session.id, session.unreadAtMs)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ops.onSelect(session.id, session.unreadAtMs);
        }
      }}
      onContextMenu={(e) => ops.onCtx(e, menu)}
      onBlur={disarm}
    >
      <span className="t-slot" aria-hidden>
        {session.pinned ? (
          <button
            type="button"
            className="t-pin"
            data-testid="task-pin"
            title={t("unpin")}
            aria-label={t("unpin")}
            onClick={(e) => {
              e.stopPropagation();
              ops.onTogglePin(session.id);
            }}
          >
            <Pin size={15} />
          </button>
        ) : session.status === "streaming" ? (
          <LoaderCircle size={12} className="t-spin" />
        ) : (
          <span className={`dot ${session.status === "error" ? "dot-err" : session.unreadAtMs ? "dot-unread" : "dot-idle"}`} />
        )}
      </span>
      <span className="t-title" title={session.title}>
        {session.title}
      </span>
      {summary && (
        <span className="t-diff" data-testid="task-diff">
          <span className="t-diff-add">+{summary.added}</span>
          <span className="t-diff-del">-{summary.removed}</span>
        </span>
      )}
      {waiting && (
        <span className="t-badge" data-testid="task-waiting">
          {t("pendingPermission")}
        </span>
      )}
      <span className="t-meta">{relTime(session.updatedAtMs, lang)}</span>
      <span className="t-actions">
        <button
          type="button"
          className="t-act"
          data-testid="task-archive"
          data-confirming={confirming || undefined}
          title={archiveLabel}
          aria-label={archiveLabel}
          onClick={startArchive}
        >
          {confirming ? <Check size={13} /> : <Archive size={13} />}
        </button>
      </span>
    </div>
  );
}

export const MemoTaskRow = memo(TaskRow);

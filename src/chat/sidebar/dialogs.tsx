import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import type { Project, Session } from "../types";

function Modal({ title, onClose, children, testid }: { title: string; onClose: () => void; children: ReactNode; testid: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      data-testid={testid}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function RenameDialog({
  session,
  onSubmit,
  onClose,
}: {
  session: Session;
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(session.title);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value);
    onClose();
  };
  return (
    <Modal title={t("renameTaskTitle")} onClose={onClose} testid="task-rename-dialog">
      <input
        ref={ref}
        className="modal-input"
        data-testid="task-rename-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        aria-label={t("renameTaskTitle")}
      />
      <div className="modal-actions">
        <button type="button" className="cbtn cbtn-ghost" data-testid="task-rename-cancel" onClick={onClose}>
          {t("cancel")}
        </button>
        <button type="button" className="cbtn cbtn-ink" data-testid="task-rename-submit" onClick={submit}>
          {t("save")}
        </button>
      </div>
    </Modal>
  );
}

export function ProjectEditorDialog({
  project,
  onSave,
  onDelete,
  onClose,
}: {
  project?: Project;
  onSave: (input: { id?: string; name: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(project?.name ?? "");
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    if (project) ref.current?.select();
  }, [project]);
  const submit = () => {
    if (!value.trim()) return;
    onSave(project ? { id: project.id, name: value } : { name: value });
    onClose();
  };
  return (
    <Modal title={project ? t("editProject") : t("newProject")} onClose={onClose} testid="task-project-dialog">
      <input
        ref={ref}
        className="modal-input"
        data-testid="task-project-name"
        placeholder={t("projectNameLabel")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        aria-label={t("projectNameLabel")}
      />
      {project && <div className="modal-hint">{t("deleteProjectHint")}</div>}
      <div className="modal-actions">
        {project ? (
          <button
            type="button"
            className="cbtn modal-danger"
            data-testid="task-project-delete"
            data-confirming={confirming || undefined}
            onClick={() => {
              if (confirming) {
                onDelete(project.id);
                onClose();
                return;
              }
              setConfirming(true);
            }}
          >
            {confirming ? t("clickAgainToDelete") : t("deleteProjectTitle")}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="cbtn cbtn-ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        <button type="button" className="cbtn cbtn-ink" data-testid="task-project-save" onClick={submit}>
          {t("save")}
        </button>
      </div>
    </Modal>
  );
}

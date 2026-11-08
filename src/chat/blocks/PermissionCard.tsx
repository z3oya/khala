/* Inline permission request, never a modal. */
import { ShieldAlert } from "lucide-react";
import type { PermissionBlock, PermissionDecision } from "../types";
import { useI18n } from "../i18n";

interface Props {
  block: PermissionBlock;
  onResolve: (decision: PermissionDecision) => void;
}

export function PermissionCard({ block, onResolve }: Props) {
  const { t } = useI18n();
  const pending = block.decision === undefined;
  const decisionLabel = block.decision === undefined ? "" : (
    {
      allowOnce: t("decidedAllowOnce"),
      alwaysAllow: t("decidedAlwaysAllow"),
      deny: t("decidedDeny"),
    } as const
  )[block.decision];
  return (
    <div
      className={`perm-card${pending ? " pending" : " decided"}`}
      data-testid="chat-permission"
      data-state={block.decision ?? "pending"}
    >
      <div className="perm-head">
        <ShieldAlert size={14} className="perm-icon" />
        <span className="perm-title">
          {block.toolName} {t("permissionSuffix")}
          {block.summary && <span className="perm-summary"> {block.summary}</span>}
        </span>
      </div>
      {block.command && <pre className="perm-cmd">$ {block.command}</pre>}
      {pending ? (
        <div className="perm-actions">
          <button
            type="button"
            className="cbtn cbtn-ghost"
            data-testid="chat-permission-deny"
            onClick={() => onResolve("deny")}
          >
            {t("deny")}
          </button>
          <button
            type="button"
            className="cbtn cbtn-outline"
            data-testid="chat-permission-always"
            onClick={() => onResolve("alwaysAllow")}
          >
            {t("alwaysAllow")}
          </button>
          <button
            type="button"
            className="cbtn cbtn-ink"
            data-testid="chat-permission-allow"
            onClick={() => onResolve("allowOnce")}
          >
            {t("allowOnce")}
          </button>
        </div>
      ) : (
        <div className="perm-decided" data-testid="chat-permission-decided">
          {decisionLabel}
        </div>
      )}
    </div>
  );
}

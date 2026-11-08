import { Feather, PanelLeft } from "lucide-react";
import { useI18n } from "./i18n";

interface Props {
  sidebarCollapsed: boolean;
  onToggle: () => void;
}

export function LogoToggle({ sidebarCollapsed, onToggle }: Props) {
  const { t } = useI18n();
  const label = sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar");
  return (
    <button
      type="button"
      className="logo-toggle"
      data-testid="chat-sidebar-toggle"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      <span className="logo-toggle-face logo-face" aria-hidden>
        <Feather size={14} />
      </span>
      <span className="logo-toggle-face panel-face" aria-hidden>
        <PanelLeft size={16} />
      </span>
    </button>
  );
}

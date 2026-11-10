/* Independent blank placeholder pages (automation / plugins / assistant):
 * centered mark + title + hint, no interactions. */
import type { LucideIcon } from "lucide-react";
import { useI18n } from "./i18n";
import type { PlaceholderPage } from "./types";

interface Props {
  page: PlaceholderPage;
  icon: LucideIcon;
  title: string;
}

export function PlaceholderView({ page, icon: Icon, title }: Props) {
  const { t } = useI18n();
  return (
    <main className="page-placeholder" data-testid="chat-placeholder-page" data-page={page}>
      <span className="ph-mark" aria-hidden>
        <Icon size={22} />
      </span>
      <h2 className="ph-title">{title}</h2>
      <p className="ph-hint">{t("comingSoon")}</p>
    </main>
  );
}

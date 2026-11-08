import type { ReactNode } from "react";
import { Feather } from "lucide-react";
import { useI18n } from "./i18n";

interface Props {
  composer: ReactNode;
  onPick: (text: string) => void;
  suggestions: string[];
}

function greeting(t: ReturnType<typeof useI18n>["t"]): string {
  const h = new Date().getHours();
  if (h < 6) return t("greetingLateNight");
  if (h < 12) return t("greetingMorning");
  if (h < 18) return t("greetingAfternoon");
  return t("greetingEvening");
}

export function EmptyState({ composer, onPick, suggestions }: Props) {
  const { t } = useI18n();
  return (
    <div className="chat-empty" data-testid="chat-empty">
      <span className="empty-mark">
        <Feather size={26} />
      </span>
      <h1 className="empty-title">{greeting(t)}</h1>
      <p className="empty-sub">{t("emptySub")}</p>
      {composer}
      <div className="empty-suggestions">
        {suggestions.map((s, i) => (
          <button
            key={s}
            type="button"
            className="suggestion"
            data-testid="chat-suggestion"
            data-index={i}
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

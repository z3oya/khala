/* Gear right-click menu: anchored above the button; theme/language side flyouts. */
import { useMemo } from "react";
import { ChatContextMenu, type CtxItem } from "./ChatContextMenu";
import { LANG_OPTIONS, THEME_OPTIONS } from "./SettingsView";
import { useI18n } from "./i18n";
import { useTheme } from "./useTheme";

interface Props {
  x: number;
  y: number;
  theme: ReturnType<typeof useTheme>;
  onClose: () => void;
}

export function SettingsGearMenu({ x, y, theme, onClose }: Props) {
  const { t, lang, setLang } = useI18n();

  const items: CtxItem[] = useMemo(
    () => [
      {
        key: "theme",
        label: t("rowTheme"),
        submenu: THEME_OPTIONS.map((opt) => ({
          key: `theme-${opt.id}`,
          label: t(opt.labelKey),
          checked: theme.setting === opt.id,
          action: () => theme.setSetting(opt.id),
        })),
      },
      {
        key: "language",
        label: t("rowLanguage"),
        submenu: LANG_OPTIONS.map((opt) => ({
          key: `lang-${opt.id}`,
          label: opt.label,
          checked: lang === opt.id,
          action: () => setLang(opt.id),
        })),
      },
    ],
    [t, lang, setLang, theme.setting, theme.setSetting],
  );

  return <ChatContextMenu x={x} y={y} openUp items={items} onClose={onClose} />;
}

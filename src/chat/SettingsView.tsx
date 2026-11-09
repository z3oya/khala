/*
 * Settings nav occupies the sidebar slot (shared width/collapse state, no
 * resizer); panel renders in the main card. Raw values stay untranslated.
 */
import type { ComponentType } from "react";
import { Cpu, Info, Keyboard, Palette, Settings, Shield, SlidersHorizontal } from "lucide-react";
import { useI18n, type MsgKey, type StringKey } from "./i18n";

interface Section {
  id: string;
  labelKey: MsgKey;
  descKey: MsgKey;
  icon: ComponentType<{ size?: number }>;
  /** Value spec: a dictionary key, or a raw untranslated string. */
  rows: [MsgKey, { key: StringKey } | { raw: string }][];
}

const SECTIONS: Section[] = [
  {
    id: "general",
    labelKey: "stGeneral",
    descKey: "stGeneralDesc",
    icon: SlidersHorizontal,
    rows: [
      ["rowDefaultView", { key: "valChat" }],
      ["rowFontSize", { key: "valStandard" }],
    ],
  },
  {
    id: "models",
    labelKey: "stModels",
    descKey: "stModelsDesc",
    icon: Cpu,
    rows: [
      ["rowDefaultModel", { raw: "GLM-5.3" }],
      ["rowEffort", { key: "valHigh" }],
      ["rowContextWindow", { raw: "200K" }],
    ],
  },
  {
    id: "appearance",
    labelKey: "stAppearance",
    descKey: "stAppearanceDesc",
    icon: Palette,
    rows: [
      ["rowTheme", { key: "valLight" }],
      ["rowSidebarWidth", { key: "valInherit" }],
      ["rowMotion", { key: "valOn" }],
    ],
  },
  {
    id: "permissions",
    labelKey: "stPermissions",
    descKey: "stPermissionsDesc",
    icon: Shield,
    rows: [
      ["rowPermMode", { key: "permModeAsk" }],
      ["rowAlwaysAllowed", { key: "valRecords" }],
    ],
  },
  {
    id: "shortcuts",
    labelKey: "stShortcuts",
    descKey: "stShortcutsDesc",
    icon: Keyboard,
    rows: [
      ["rowSend", { raw: "Enter" }],
      ["rowNewline", { raw: "Shift+Enter" }],
      ["rowStop", { key: "valStopButton" }],
    ],
  },
  {
    id: "about",
    labelKey: "stAbout",
    descKey: "stAboutDesc",
    icon: Info,
    rows: [
      ["rowVersion", { raw: "v0.1.0" }],
      ["rowTransport", { key: "valMock" }],
    ],
  },
];

const LANG_OPTIONS: { id: "zh" | "en"; label: string }[] = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
];

const MOCK_RECORD_COUNT = 3;

interface NavProps {
  activeId: string;
  onSelect: (id: string) => void;
  width: number;
  collapsed: boolean;
  onBack: () => void;
}

export function SettingsSidebar({ activeId, onSelect, width, collapsed, onBack }: NavProps) {
  const { t } = useI18n();

  return (
    <aside
      className="chat-sidebar"
      style={{ width: collapsed ? 0 : width }}
      data-testid="chat-settings-sidebar"
      data-width={Math.round(collapsed ? 0 : width)}
    >
      <div className="chat-sidebar-inner">
        <nav className="st-nav" aria-label={t("stNav")}>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                className={`st-nav-item${isActive ? " active" : ""}`}
                data-testid="chat-settings-nav-item"
                data-section={s.id}
                data-active={isActive}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelect(s.id)}
              >
                <Icon size={15} />
                {t(s.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="sb-footer">
          <button
            type="button"
            className="sb-settings"
            data-testid="chat-settings"
            title={t("backToWorkspace")}
            aria-label={t("backToWorkspace")}
            aria-pressed="true"
            onClick={onBack}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function SettingsPanel({ activeId }: { activeId: string }) {
  const { lang, setLang, t } = useI18n();
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <main className="st-main">
      <div className="st-panel" data-testid="chat-settings-panel" data-section={active.id}>
        <h2 className="st-title">{t(active.labelKey)}</h2>
        <p className="st-desc">{t(active.descKey)}</p>
        <div className="st-rows">
          {active.id === "general" && (
            <div className="st-row" data-testid="chat-settings-language-row">
              <span className="st-row-label">{t("rowLanguage")}</span>
              <span className="lang-options">
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`lang-option${lang === opt.id ? " active" : ""}`}
                    data-testid="chat-settings-lang-option"
                    data-lang={opt.id}
                    data-active={lang === opt.id}
                    aria-pressed={lang === opt.id}
                    onClick={() => setLang(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </span>
            </div>
          )}
          {active.rows.map(([k, v]) => (
            <div key={k} className="st-row">
              <span className="st-row-label">{t(k)}</span>
              <span className="chip">
                {"key" in v ? t(v.key).replace("{n}", String(MOCK_RECORD_COUNT)) : v.raw}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

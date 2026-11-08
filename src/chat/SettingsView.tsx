/*
 * Settings shell sharing the chat sidebar geometry; the footer settings
 * button round-trips back to the workspace. Values marked raw stay
 * untranslated (models, keys).
 */
import { useState, type ComponentType } from "react";
import { Cpu, Info, Keyboard, Palette, Settings, Shield, SlidersHorizontal } from "lucide-react";
import { LogoToggle } from "./LogoToggle";
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

interface Props {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onBack: () => void;
}

export function SettingsView({ sidebarWidth, sidebarCollapsed, onToggleSidebar, onBack }: Props) {
  const { lang, setLang, t } = useI18n();
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <>
      <header className="chat-topbar" data-testid="chat-topbar">
        <LogoToggle sidebarCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
        <span className="topbar-title" data-testid="chat-settings-title">
          {t("stTitle")}
        </span>
      </header>

      <div className="chat-body">
        <aside
          className="chat-sidebar"
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
          data-testid="chat-settings-sidebar"
          data-width={Math.round(sidebarCollapsed ? 0 : sidebarWidth)}
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
                    onClick={() => setActiveId(s.id)}
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
                onClick={onBack}
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </aside>

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
      </div>
    </>
  );
}

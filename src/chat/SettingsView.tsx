/*
 * Settings nav occupies the sidebar slot (shared width/collapse state, no
 * resizer); panel renders in the main card. Raw values stay untranslated.
 */
import { useEffect, useState, type ComponentType } from "react";
import { Archive, Cpu, Hand, Info, Keyboard, Palette, Shield, SlidersHorizontal } from "lucide-react";
import { api, type InfoOut } from "../api/commands";
import { transport } from "../lib/rpc";
import { useGreet } from "../greet/useGreet";
import { relTime, useI18n, type MsgKey, type StringKey } from "./i18n";
import type { ThemeSetting } from "./useTheme";
import type { Session } from "./types";

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
    id: "greeting",
    labelKey: "stGreeting",
    descKey: "stGreetingDesc",
    icon: Hand,
    rows: [],
  },
  {
    id: "archive",
    labelKey: "stArchive",
    descKey: "stArchiveDesc",
    icon: Archive,
    rows: [],
  },
  {
    id: "about",
    labelKey: "stAbout",
    descKey: "stAboutDesc",
    icon: Info,
    rows: [],
  },
];

export const LANG_OPTIONS: { id: "zh" | "en"; label: string }[] = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
];

/** Deep-link whitelist for ChatApp's ?settings=<section>. */
export const SETTINGS_SECTION_IDS: string[] = SECTIONS.map((s) => s.id);

export const THEME_OPTIONS: { id: ThemeSetting; labelKey: "valLight" | "valDark" | "valSystem" }[] = [
  { id: "light", labelKey: "valLight" },
  { id: "dark", labelKey: "valDark" },
  { id: "system", labelKey: "valSystem" },
];

const MOCK_RECORD_COUNT = 3;

interface NavProps {
  activeId: string;
  onSelect: (id: string) => void;
  width: number;
  collapsed: boolean;
  closing: boolean;
}

export function SettingsSidebar({ activeId, onSelect, width, collapsed, closing }: NavProps) {
  const { t } = useI18n();

  return (
    <aside
      className="chat-sidebar"
      style={{ width: collapsed ? 0 : width }}
      data-testid="chat-settings-sidebar"
      data-width={Math.round(collapsed ? 0 : width)}
    >
      <div className="chat-sidebar-inner" inert={closing ? true : undefined} aria-hidden={closing}>
        <div className="sb-dragzone" data-tauri-drag-region aria-hidden="true" />
        <nav className="st-nav" aria-label={t("stNav")}>
          {SECTIONS.map((s, i) => {
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
                style={{ animationDelay: `${i * 24}ms` }}
                onClick={() => onSelect(s.id)}
              >
                <Icon size={15} />
                {t(s.labelKey)}
              </button>
            );
          })}
        </nav>

        {/* Spacing for the floating gear (ChatApp). */}
        <div className="sb-footer" />
      </div>
    </aside>
  );
}

function ArchivePanel({
  archived,
  onRestore,
  onDeleteForever,
}: {
  archived: Session[];
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  if (archived.length === 0) {
    return (
      <div className="st-empty" data-testid="chat-settings-archive-empty">
        {t("archivedEmpty")}
      </div>
    );
  }
  return (
    <div className="archived-list" data-testid="chat-settings-archive" data-count={archived.length}>
      {archived.map((s) => (
        <div key={s.id} className="archived-row" data-testid="task-archived-row" data-id={s.id}>
          <span className="t-title" title={s.title}>
            {s.title}
          </span>
          <span className="t-meta">{relTime(s.updatedAtMs, lang)}</span>
          <button type="button" className="archived-act" data-testid="task-restore" onClick={() => onRestore(s.id)}>
            {t("restore")}
          </button>
          <button
            type="button"
            className="archived-act archived-act-danger"
            data-testid="task-delete-forever"
            data-confirming={confirmingId === s.id || undefined}
            onClick={() => {
              if (confirmingId === s.id) {
                onDeleteForever(s.id);
                return;
              }
              setConfirmingId(s.id);
            }}
          >
            {confirmingId === s.id ? t("clickAgainToDelete") : t("deleteForever")}
          </button>
        </div>
      ))}
    </div>
  );
}

/* Rows read Rust-side state: the count is the backend's greet history length. */
function GreetingPanel() {
  const { t } = useI18n();
  const { greeting, history, error, busy, send } = useGreet();

  return (
    <div className="st-rows" data-testid="chat-settings-greet">
      <div className="st-row">
        <span className="st-row-label">{t("rowGreetCount")}</span>
        <span className="chip" data-testid="chat-settings-greet-count">
          {t("greetTimes").replace("{n}", String(history.length))}
        </span>
      </div>
      {greeting && !error && (
        <div className="st-row">
          <span className="st-row-label">{t("rowLatestGreeting")}</span>
          <span className="chip" data-testid="chat-settings-greet-result">
            {greeting}
          </span>
        </div>
      )}
      {error && (
        <p className="st-greet-error" data-testid="chat-settings-greet-error" role="alert">
          {error}
        </p>
      )}
      <div className="st-greet-actions">
        <button
          type="button"
          className="lang-option st-greet-submit"
          data-testid="chat-settings-greet-submit"
          disabled={busy}
          onClick={() => void send("khala")}
        >
          {t("greetSubmit")}
        </button>
      </div>
    </div>
  );
}

/* Polls khala-server while mounted (About section only); offline honestly
 * reflects a backend-less mock run. Raw version/transport stay untranslated. */
const ABOUT_POLL_MS = 4000;

function AboutPanel() {
  const { t } = useI18n();
  const [info, setInfo] = useState<InfoOut | null>(null);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const started = performance.now();
      try {
        const next = await api.info();
        if (!alive) return;
        setInfo(next);
        setRttMs(Math.round(performance.now() - started));
        setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    };
    void tick();
    const timer = window.setInterval(tick, ABOUT_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const status = online === null ? "checking" : online ? "online" : "offline";
  return (
    <div className="st-rows" data-testid="chat-settings-about">
      <div className="st-row">
        <span className="st-row-label">{t("rowStatus")}</span>
        <span
          className="chip"
          data-testid="chat-settings-about-status"
          data-state={status}
        >
          <span className={`st-dot st-dot-${status}`} />
          {t(status === "online" ? "valOnline" : status === "offline" ? "valOffline" : "valChecking")}
        </span>
      </div>
      <div className="st-row">
        <span className="st-row-label">{t("rowVersion")}</span>
        <span className="chip" data-testid="chat-settings-about-version">
          {info ? `v${info.version}(${info.gitHash})` : "v?"}
        </span>
      </div>
      <div className="st-row">
        <span className="st-row-label">{t("rowTransport")}</span>
        <span className="chip" data-testid="chat-settings-about-transport">
          {transport()}
        </span>
      </div>
      <div className="st-row">
        <span className="st-row-label">{t("rowRtt")}</span>
        <span className="chip" data-testid="chat-settings-about-rtt">
          {online ? `${rttMs ?? "?"}ms` : "--"}
        </span>
      </div>
    </div>
  );
}

export function SettingsPanel({
  activeId,
  archived,
  closing,
  theme,
  onRestoreArchive,
  onDeleteArchive,
}: {
  activeId: string;
  archived: Session[];
  closing: boolean;
  theme: { setting: ThemeSetting; setSetting: (s: ThemeSetting) => void };
  onRestoreArchive: (id: string) => void;
  onDeleteArchive: (id: string) => void;
}) {
  const { lang, setLang, t } = useI18n();
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <main className="st-main" inert={closing ? true : undefined} aria-hidden={closing}>
      <div key={active.id} className="st-panel" data-testid="chat-settings-panel" data-section={active.id}>
        <h2 className="st-title">{t(active.labelKey)}</h2>
        <p className="st-desc">{t(active.descKey)}</p>
        {active.id === "archive" && (
          <ArchivePanel archived={archived} onRestore={onRestoreArchive} onDeleteForever={onDeleteArchive} />
        )}
        {active.id === "greeting" && <GreetingPanel />}
        {active.id === "about" && <AboutPanel />}
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
          {active.id === "appearance" && (
            <div className="st-row" data-testid="chat-settings-theme-row">
              <span className="st-row-label">{t("rowTheme")}</span>
              <span className="lang-options">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`lang-option${theme.setting === opt.id ? " active" : ""}`}
                    data-testid="chat-settings-theme-option"
                    data-opt={opt.id}
                    data-active={theme.setting === opt.id}
                    aria-pressed={theme.setting === opt.id}
                    onClick={() => theme.setSetting(opt.id)}
                  >
                    {t(opt.labelKey)}
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

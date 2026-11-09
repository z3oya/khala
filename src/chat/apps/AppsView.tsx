/* Apps page main region: actions row, card grid, floating fallback window,
 * .html import, empty state, per-card context menu. */
import { useLayoutEffect, useRef, useState, type ChangeEvent as ReactChangeEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { FileCode2, MessageSquarePlus, Play, Upload, X } from "lucide-react";
import type { KhalaApp } from "./types";
import { initialApps } from "./mockApps";
import { loadImported, removeImported, saveImported, storedToApp } from "./appsStore";
import { APP_MIN_SIZE, launchAppWindow } from "./appLauncher";
import { ChatContextMenu, type CtxItem } from "../ChatContextMenu";
import { relTime, useI18n } from "../i18n";

const DEFAULT_SIZE = { width: 560, height: 420 };
const WIN_MARGIN = 16;

interface Props {
  onBuildInChat: () => void;
}

export function AppsView({ onBuildInChat }: Props) {
  const { lang, t } = useI18n();
  /* Built apps are static; imported ones come back from localStorage. */
  const [apps, setApps] = useState<KhalaApp[]>(() => [
    ...loadImported().map(storedToApp),
    ...initialApps,
  ]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [winPos, setWinPos] = useState<{ x: number; y: number } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const openApp = apps.find((a) => a.id === openId) ?? null;

  /* First open centers the floating window; switching apps keeps position. */
  useLayoutEffect(() => {
    if (!openApp || winPos) return;
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return;
    const size = openApp.size ?? DEFAULT_SIZE;
    const w = Math.max(APP_MIN_SIZE.width, Math.min(size.width, rect.width - WIN_MARGIN * 2));
    const h = Math.max(APP_MIN_SIZE.height, Math.min(size.height, rect.height - WIN_MARGIN * 2));
    setWinPos({
      x: Math.max(WIN_MARGIN, (rect.width - w) / 2),
      y: Math.max(WIN_MARGIN, (rect.height - h) / 2),
    });
  }, [openApp, winPos]);

  /* chat-root suppresses the native menu; cards opt into theirs. */
  const openCtx = (e: ReactMouseEvent, items: CtxItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  const cardCtx = (app: KhalaApp): CtxItem[] => [
    { key: "open", label: t("open"), action: () => launch(app) },
    { key: "delete", label: t("delete"), danger: true, action: () => removeApp(app.id) },
  ];

  /* Child window first; the floating window is the popup-blocked fallback. */
  const launch = async (app: KhalaApp) => {
    const opened = await launchAppWindow(app);
    if (!opened) {
      setOpenId(app.id);
      setWinPos(null);
    }
  };

  const removeApp = (id: string) => {
    setApps((prev) => prev.filter((a) => a.id !== id));
    removeImported(id);
    if (openId === id) {
      setOpenId(null);
      setWinPos(null);
    }
  };

  const onImportFile = async (e: ReactChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const app: KhalaApp = {
      id: `a-import-${Date.now()}`,
      name: file.name.replace(/\.html?$/i, ""),
      description: "",
      source: "imported",
      icon: FileCode2,
      updatedAtMs: Date.now(),
      size: DEFAULT_SIZE,
      html: text,
    };
    saveImported(app);
    setApps((prev) => [app, ...prev]);
    e.target.value = "";
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    /* capture would retarget the close button's click to the bar */
    if (e.button !== 0 || !winPos) return;
    if ((e.target as Element).closest("button")) return;
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left - winPos.x, dy: e.clientY - rect.top - winPos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = mainRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const win = e.currentTarget.parentElement;
    const w = win?.offsetWidth ?? 0;
    const h = win?.offsetHeight ?? 0;
    setWinPos({
      x: Math.min(Math.max(e.clientX - rect.left - drag.dx, 0), Math.max(rect.width - w, 0)),
      y: Math.min(Math.max(e.clientY - rect.top - drag.dy, 0), Math.max(rect.height - h, 0)),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const closeWindow = () => {
    setOpenId(null);
    setWinPos(null);
  };

  return (
    <main
      ref={mainRef}
      className="apps-main"
      data-testid="chat-apps-page"
      data-app-count={apps.length}
      data-open-app={openId ?? ""}
    >
      <div className="apps-scroll">
        <div className="apps-head">
          <div className="apps-head-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm"
              style={{ display: "none" }}
              data-testid="chat-app-import-input"
              onChange={onImportFile}
            />
            <button
              type="button"
              className="cbtn cbtn-ghost"
              title={t("appsImportTitle")}
              data-testid="chat-app-import"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              {t("appsImport")}
            </button>
            <button
              type="button"
              className="cbtn cbtn-ink"
              data-testid="chat-app-build-in-chat"
              onClick={onBuildInChat}
            >
              <MessageSquarePlus size={14} />
              {t("appsBuildInChat")}
            </button>
          </div>
        </div>

        {apps.length === 0 ? (
          <div className="apps-empty" data-testid="chat-apps-empty">
            <h3>{t("appsEmptyTitle")}</h3>
            <p>{t("appsEmptyDesc")}</p>
            <button
              type="button"
              className="cbtn cbtn-ink"
              data-testid="chat-app-build-in-chat"
              onClick={onBuildInChat}
            >
              <MessageSquarePlus size={14} />
              {t("appsBuildInChat")}
            </button>
          </div>
        ) : (
          <div className="apps-grid">
            {apps.map((app) => {
              const Icon = app.icon;
              return (
                <div
                  key={app.id}
                  className="apps-card"
                  data-testid="chat-app-card"
                  data-app-id={app.id}
                  data-source={app.source}
                  onContextMenu={(e) => openCtx(e, cardCtx(app))}
                >
                  <div className="apps-card-head">
                    <span className="apps-card-icon" aria-hidden>
                      <Icon size={16} />
                    </span>
                    <h3 className="apps-card-name" title={app.name}>
                      {app.name}
                    </h3>
                  </div>
                  {app.description && <p className="apps-card-desc">{app.description}</p>}
                  <div className="apps-card-meta">
                    <span className="apps-card-source">
                      {app.source === "built" ? t("appsSourceBuilt") : t("appsSourceImported")}
                    </span>
                    <span className="apps-card-time">{relTime(app.updatedAtMs, lang)}</span>
                  </div>
                  <div className="apps-card-actions">
                    <button
                      type="button"
                      className="cbtn cbtn-ink apps-card-launch"
                      data-testid="chat-app-launch"
                      data-app-id={app.id}
                      onClick={() => launch(app)}
                    >
                      <Play size={13} />
                      {t("appsLaunch")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openApp && (
        <AppWindow
          app={openApp}
          pos={winPos}
          onStartDrag={startDrag}
          onMoveDrag={moveDrag}
          onEndDrag={endDrag}
          onClose={closeWindow}
        />
      )}

      {ctx && <ChatContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </main>
  );
}

interface WindowProps {
  app: KhalaApp;
  pos: { x: number; y: number } | null;
  onStartDrag: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onMoveDrag: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onEndDrag: () => void;
  onClose: () => void;
}

function AppWindow({ app, pos, onStartDrag, onMoveDrag, onEndDrag, onClose }: WindowProps) {
  const { t } = useI18n();
  const Icon = app.icon;
  const size = app.size ?? DEFAULT_SIZE;
  const Sample = app.sample;
  return (
    <div
      className="apps-win"
      role="dialog"
      aria-label={app.name}
      style={{
        left: pos?.x,
        top: pos?.y,
        width: `min(${size.width}px, calc(100% - ${WIN_MARGIN * 2}px))`,
        height: `min(${size.height}px, calc(100% - ${WIN_MARGIN * 2}px))`,
      }}
      data-testid="chat-app-window"
      data-app-id={app.id}
      data-open="true"
    >
      <div
        className="apps-win-bar"
        onPointerDown={onStartDrag}
        onPointerMove={onMoveDrag}
        onPointerUp={onEndDrag}
      >
        <span className="apps-win-icon" aria-hidden>
          <Icon size={13} />
        </span>
        <span className="apps-win-name">{app.name}</span>
        <span className="apps-win-source">
          {app.source === "built" ? t("appsSourceBuilt") : t("appsSourceImported")}
        </span>
        <button
          type="button"
          className="icon-btn apps-win-close"
          aria-label={t("appsClose")}
          data-testid="chat-app-close"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="apps-win-body">
        {Sample ? (
          <Sample />
        ) : (
          <iframe
            className="apps-win-frame"
            title={app.name}
            sandbox="allow-scripts"
            srcDoc={app.html ?? ""}
          />
        )}
      </div>
    </div>
  );
}

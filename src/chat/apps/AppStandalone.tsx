/* Standalone app body for a child window (#/app/<id>), under the shared
 * .chat-app token scope. Browser popups clamp their own size to
 * APP_MIN_SIZE; Tauri windows enforce minWidth/minHeight natively. */
import { useEffect } from "react";
import { resolveApp } from "./appsStore";
import { APP_MIN_SIZE } from "./appLauncher";
import { I18nProvider } from "../i18n";
import { useTheme } from "../useTheme";
import "../tokens.css";
import "../chat.css";

export function AppStandalone({ appId }: { appId: string }) {
  return (
    <I18nProvider>
      <StandaloneBody appId={appId} />
    </I18nProvider>
  );
}

function StandaloneBody({ appId }: { appId: string }) {
  const app = resolveApp(appId);
  /* Separate document: activates the <html data-theme> effect so this window
   * follows main-window theme switches via the storage event. */
  useTheme();

  useEffect(() => {
    document.title = app ? app.name : "khala app";
    if ("__TAURI_INTERNALS__" in window) return; // native min-size handles it
    const clamp = () => {
      const dw = APP_MIN_SIZE.width - window.outerWidth;
      const dh = APP_MIN_SIZE.height - window.outerHeight;
      if (dw > 0 || dh > 0) window.resizeTo(window.outerWidth + Math.max(dw, 0), window.outerHeight + Math.max(dh, 0));
    };
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [app]);

  if (!app) {
    return (
      <div className="chat-app app-standalone" data-testid="app-standalone-root" data-app-id={appId} data-state="missing">
        <p className="app-standalone-missing">应用不存在或已被删除。</p>
      </div>
    );
  }

  const Sample = app.sample;
  return (
    <div
      className="chat-app app-standalone"
      data-testid="app-standalone-root"
      data-app-id={app.id}
      data-state="ready"
    >
      {Sample ? (
        <Sample />
      ) : (
        <iframe
          className="app-standalone-frame"
          title={app.name}
          sandbox="allow-scripts"
          srcDoc={app.html ?? ""}
        />
      )}
    </div>
  );
}

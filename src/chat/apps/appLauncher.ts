/* Launches an app in an independent child window — Tauri WebviewWindow in
 * the shell, script-opened popup otherwise; both share #/app/<id>. Returns
 * false so the caller can fall back to the in-page window. */
import type { KhalaApp } from "./types";

export const APP_MIN_SIZE = { width: 360, height: 280 };

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function launchInTauri(app: KhalaApp): Promise<boolean> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = `app-${app.id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return true;
  }
  const win = new WebviewWindow(label, {
    url: `index.html#/app/${app.id}`,
    title: app.name,
    width: app.size?.width ?? 560,
    height: app.size?.height ?? 420,
    minWidth: APP_MIN_SIZE.width,
    minHeight: APP_MIN_SIZE.height,
    resizable: true,
    center: true,
  });
  return new Promise((resolve) => {
    win.once("tauri://created", () => resolve(true));
    win.once("tauri://error", () => resolve(false));
  });
}

/* Relaunching via window.open on a live named target reloads the child and
 * wipes its state, so keep handles and focus instead. */
const childWindows = new Map<string, Window>();

function launchInBrowser(app: KhalaApp): boolean {
  const existing = childWindows.get(app.id);
  if (existing && !existing.closed) {
    existing.focus();
    return true;
  }
  const size = app.size ?? { width: 560, height: 420 };
  /* opener kept: the child needs it for the resizeTo min clamp */
  const child = window.open(
    `#/app/${app.id}`,
    `khala-app-${app.id}`,
    `popup=yes,width=${size.width},height=${size.height},resizable=yes`,
  );
  if (child) childWindows.set(app.id, child);
  return child !== null;
}

export async function launchAppWindow(app: KhalaApp): Promise<boolean> {
  try {
    if (isTauri()) return await launchInTauri(app);
    return launchInBrowser(app);
  } catch (e) {
    console.warn("Failed to launch app window:", e);
    return false;
  }
}

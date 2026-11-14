/* Theme setting in localStorage("khala-theme"), cross-window synced.
 * The resolved theme lives on <html data-theme> (single source of truth,
 * also set pre-mount by the inline guard in index.html), so CSS — not
 * React state — drives every window, including standalone app popups. */
import { useCallback, useEffect, useState } from "react";

export type ThemeSetting = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "khala-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
/* Same-document echo: storage events never fire in the window that wrote,
 * so setSetting broadcasts this; cross-window still rides the storage event. */
const THEME_EVENT = "khala-theme-changed";

function isSetting(v: unknown): v is ThemeSetting {
  return v === "light" || v === "dark" || v === "system";
}

function readSetting(): ThemeSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isSetting(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/* "system" must unpin the native window (setTheme(null)): while a theme is
 * pinned, tao drops the OS theme-change broadcast, so neither the title bar
 * nor the tauri://theme-changed event follows the OS. */
async function applyTheme(setting: ThemeSetting, resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(setting === "system" ? null : resolved);
  } catch {
    // non-fatal: the CSS theme still applies
  }
}

export function useTheme() {
  const [setting, setSettingState] = useState<ThemeSetting>(readSetting);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const resolved = setting === "system" ? system : setting;

  useEffect(() => {
    const onEcho = () => setSettingState(readSetting());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettingState(readSetting());
    };
    window.addEventListener(THEME_EVENT, onEcho);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onEcho);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* Tauri: the OS theme event is authoritative; WebView2's media query can
   * lag the actual switch. */
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const off = await getCurrentWindow().onThemeChanged(({ payload }) => {
          if (payload === "dark" || payload === "light") setSystem(payload);
        });
        if (disposed) off();
        else unlisten = off;
      } catch {
        // event unavailable: matchMedia still covers it
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void applyTheme(setting, resolved);
  }, [setting, resolved]);

  const setSetting = useCallback((next: ThemeSetting) => {
    setSettingState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      // dispatch only after the write succeeds, else listeners re-read the stale value
      window.dispatchEvent(new Event(THEME_EVENT));
    } catch {
      // storage full/blocked: keep the in-memory setting for the session
    }
  }, []);

  return { setting, resolved, setSetting };
}

/* Resolved-theme hook for leaf consumers (ExtensionBlock, sample apps).
 * Reads <html data-theme> at mount, then follows attribute mutations — the
 * app's single theme source, shared with standalone app windows. */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

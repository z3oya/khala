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

/** Applies the resolved theme to <html>; in Tauri also to the native window. */
async function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    // requires the window:allow-set-theme capability
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(theme);
  } catch {
    // setTheme may reject (older runtime); the CSS theme still applies
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

  useEffect(() => {
    void applyTheme(resolved);
  }, [resolved]);

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

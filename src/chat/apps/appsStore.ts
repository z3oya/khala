/* Imported apps persist to localStorage: a standalone child window is a
 * separate document and must re-resolve them on its own. */
import { FileCode2 } from "lucide-react";
import type { KhalaApp } from "./types";
import { initialApps } from "./mockApps";

const KEY = "khala-apps";

interface StoredApp {
  id: string;
  name: string;
  html: string;
  updatedAtMs: number;
}

export function loadImported(): StoredApp[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as StoredApp[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAll(list: StoredApp[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function saveImported(app: KhalaApp) {
  const rest = loadImported().filter((a) => a.id !== app.id);
  saveAll([...rest, { id: app.id, name: app.name, html: app.html ?? "", updatedAtMs: app.updatedAtMs }]);
}

export function removeImported(id: string) {
  saveAll(loadImported().filter((a) => a.id !== id));
}

export function storedToApp(stored: StoredApp): KhalaApp {
  return {
    id: stored.id,
    name: stored.name,
    description: "",
    source: "imported",
    icon: FileCode2,
    updatedAtMs: stored.updatedAtMs,
    html: stored.html,
  };
}

/** Resolve an app by id across built (static) and imported (stored). */
export function resolveApp(id: string): KhalaApp | null {
  const built = initialApps.find((a) => a.id === id);
  if (built) return built;
  const stored = loadImported().find((a) => a.id === id);
  return stored ? storedToApp(stored) : null;
}

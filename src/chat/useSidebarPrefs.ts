/* Sidebar prefs in localStorage("khala-sidebar-prefs"), cross-window synced. */
import { useCallback, useEffect, useState } from "react";

export type ChatView = "recent" | "daily";

export interface SidebarPrefs {
  zones: { project: boolean; chat: boolean };
  expanded: Record<string, boolean>;
  chatView: ChatView;
  /** Persisted first-seen order; child sessions never reshuffle it. */
  order: string[];
}

const KEY = "khala-sidebar-prefs";
const DEFAULTS: SidebarPrefs = {
  zones: { project: true, chat: true },
  expanded: {},
  chatView: "recent",
  order: [],
};

function read(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<SidebarPrefs>;
    return {
      zones: { project: p.zones?.project !== false, chat: p.zones?.chat !== false },
      expanded: p.expanded && typeof p.expanded === "object" ? p.expanded : {},
      chatView: p.chatView === "daily" ? "daily" : "recent",
      order: Array.isArray(p.order) ? p.order.filter((d): d is string => typeof d === "string") : [],
    };
  } catch {
    return DEFAULTS;
  }
}

export function useSidebarPrefs() {
  const [prefs, setPrefs] = useState<SidebarPrefs>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPrefs(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<SidebarPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch, zones: { ...prev.zones, ...patch.zones } };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // storage full/blocked: keep in-memory prefs for the session
      }
      return next;
    });
  }, []);

  const setZone = useCallback((zone: "project" | "chat", open: boolean) => {
    update({ zones: { [zone]: open } as SidebarPrefs["zones"] });
  }, [update]);

  const setExpanded = useCallback((dir: string, open: boolean) => {
    setPrefs((prev) => {
      const expanded = { ...prev.expanded, [dir]: open };
      const next = { ...prev, expanded };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setChatView = useCallback((chatView: ChatView) => update({ chatView }), [update]);

  return { prefs, update, setZone, setExpanded, setChatView };
}

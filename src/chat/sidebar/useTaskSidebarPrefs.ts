/* Task sidebar prefs in localStorage("khala-task-sidebar-prefs"), cross-window synced. */
import { useCallback, useEffect, useState } from "react";

export type SidebarView = "projects" | "grouped" | "timeline";

export interface TaskSidebarPrefs {
  view: SidebarView;
  expanded: Record<string, boolean>;
  order: string[];
  collapsedGroups: string[];
  /** Collapsible zone ids in the projects view: "pinned" | "projects" | "unfiled". */
  collapsedZones: string[];
  /** Per-scope manual task order; key = `p:{projectId}` | "unfiled" (ordering.ts). */
  taskOrder: Record<string, string[]>;
}

const KEY = "khala-task-sidebar-prefs";
const LEGACY_KEY = "khala-sidebar-prefs";
const DEFAULTS: TaskSidebarPrefs = {
  view: "projects",
  expanded: {},
  order: [],
  collapsedGroups: [],
  collapsedZones: [],
  taskOrder: {},
};

function isView(v: unknown): v is SidebarView {
  return v === "projects" || v === "grouped" || v === "timeline";
}

function isTaskOrder(v: unknown): v is Record<string, string[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v).every(
    (list) => Array.isArray(list) && list.every((id): id is string => typeof id === "string"),
  );
}

/* Legacy key best-effort: only chatView maps (daily → timeline). */
function migrateLegacy(): TaskSidebarPrefs {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return DEFAULTS;
    const legacy = JSON.parse(raw) as { chatView?: unknown };
    return { ...DEFAULTS, view: legacy.chatView === "daily" ? "timeline" : "projects" };
  } catch {
    return DEFAULTS;
  }
}

function read(): TaskSidebarPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrateLegacy();
    const p = JSON.parse(raw) as Partial<TaskSidebarPrefs>;
    return {
      view: isView(p.view) ? p.view : "projects",
      expanded: p.expanded && typeof p.expanded === "object" ? p.expanded : {},
      order: Array.isArray(p.order) ? p.order.filter((v): v is string => typeof v === "string") : [],
      collapsedGroups: Array.isArray(p.collapsedGroups)
        ? p.collapsedGroups.filter((v): v is string => typeof v === "string")
        : [],
      collapsedZones: Array.isArray(p.collapsedZones)
        ? p.collapsedZones.filter((v): v is string => typeof v === "string")
        : [],
      taskOrder: isTaskOrder(p.taskOrder) ? p.taskOrder : {},
    };
  } catch {
    return DEFAULTS;
  }
}

export function useTaskSidebarPrefs() {
  const [prefs, setPrefs] = useState<TaskSidebarPrefs>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPrefs(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<TaskSidebarPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // storage full/blocked: keep in-memory prefs for the session
      }
      return next;
    });
  }, []);

  const setView = useCallback((view: SidebarView) => update({ view }), [update]);

  const setExpanded = useCallback(
    (projectId: string, open: boolean) => {
      setPrefs((prev) => {
        if (prev.expanded[projectId] === open) return prev;
        const next = { ...prev, expanded: { ...prev.expanded, [projectId]: open } };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setPrefs((prev) => {
      const collapsed = prev.collapsedGroups.includes(groupId)
        ? prev.collapsedGroups.filter((g) => g !== groupId)
        : [...prev.collapsedGroups, groupId];
      const next = { ...prev, collapsedGroups: collapsed };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleZoneCollapsed = useCallback((zone: string) => {
    setPrefs((prev) => {
      const collapsed = prev.collapsedZones.includes(zone)
        ? prev.collapsedZones.filter((z) => z !== zone)
        : [...prev.collapsedZones, zone];
      const next = { ...prev, collapsedZones: collapsed };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { prefs, update, setView, setExpanded, toggleGroupCollapsed, toggleZoneCollapsed };
}

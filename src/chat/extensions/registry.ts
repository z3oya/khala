/*
 * Fenced-block extension registry. Provider shells in ./providers/*.ext.ts
 * are discovered via import.meta.glob; shells are tiny and register
 * synchronously, the heavy library loads inside load() as an async chunk.
 *
 * Unplug: delete a provider file + remove its dependency — lookups miss and
 * fenced blocks fall back to CodeBlock. Add: drop a new .ext.ts with a
 * default export.
 */
import type { FencedBlockExtension } from "./types";

function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase();
}

export interface FencedRegistry {
  /** Registers a extension's langs; first registration wins a lang. */
  register(ext: FencedBlockExtension): void;
  lookup(lang: string): FencedBlockExtension | undefined;
}

export function createFencedRegistry(): FencedRegistry {
  const byLang = new Map<string, FencedBlockExtension>();
  return {
    register(ext) {
      for (const raw of ext.langs) {
        const lang = normalizeLang(raw);
        if (lang === "") continue;
        const prev = byLang.get(lang);
        if (prev) {
          if (import.meta.env.DEV) {
            console.warn(`[extensions] lang "${lang}" already claimed by "${prev.id}"; ignoring "${ext.id}"`);
          }
          continue;
        }
        byLang.set(lang, ext);
      }
    },
    lookup(lang) {
      return byLang.get(normalizeLang(lang));
    },
  };
}

/* Routing predicate for Markdown's fenced segments: an unclosed fence stays
 * on the plain-code path until the closing fence arrives. */
export function resolveCodeRoute(
  closed: boolean,
  lang: string,
  registry: FencedRegistry,
): FencedBlockExtension | null {
  if (!closed) return null;
  return registry.lookup(lang) ?? null;
}

/** Default singleton; auto-populated from providers/*.ext.ts. */
export const fencedRegistry = createFencedRegistry();

const providers = import.meta.glob("./providers/*.ext.ts", {
  eager: true,
}) as Record<string, { default: FencedBlockExtension }>;

for (const mod of Object.values(providers)) {
  fencedRegistry.register(mod.default);
}

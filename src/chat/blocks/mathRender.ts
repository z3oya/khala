/* Shared lazy math rendering with a tex→html cache; InlineMath and
 * MathBlock both go through it. A provider declaring math whose renderer
 * lacks renderMath resolves to null and the hosts take their fallbacks. */
import type { FencedBlockExtension, FencedBlockRenderer } from "../extensions/types";

const cache = new Map<string, string>();
const rendererPromises = new WeakMap<FencedBlockExtension, Promise<FencedBlockRenderer | null>>();

function ensureRenderer(ext: FencedBlockExtension): Promise<FencedBlockRenderer | null> {
  let promise = rendererPromises.get(ext);
  if (!promise) {
    promise = ext.load().then((r) => (typeof r.renderMath === "function" ? r : null));
    rendererPromises.set(ext, promise);
  }
  return promise;
}

export async function renderTex(
  ext: FencedBlockExtension,
  tex: string,
  display: boolean,
): Promise<string | null> {
  const key = display ? `d\u0000${tex}` : tex;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const renderer = await ensureRenderer(ext);
  if (!renderer?.renderMath) return null;
  try {
    const result = await renderer.renderMath(tex, { display });
    if (result.kind !== "html") return null;
    cache.set(key, result.html);
    return result.html;
  } catch {
    return null;
  }
}

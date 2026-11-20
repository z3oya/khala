/**
 * Rendering entry forwarder shell: the implementation is morphGlyphs' renderMarkToNode (multi-body / with morph → blend;
 * single sphere → sphere sprite; other single bodies → generic sprite). displaySize doubles as the glyph size inside blend
 * and the SVG frame width (two separate parameters in the source).
 */
export { renderMarkToNode } from "./morphGlyphs";

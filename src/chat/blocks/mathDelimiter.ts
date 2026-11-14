/*
 * Math delimiters for the markdown layer: $$ block segmentation and a
 * conservative inline $...$ matcher. Both are pure and test-pinned. A $$
 * run without a closing line stays in the plain lines verbatim, so the
 * streaming and unplugged renderings remain byte-identical with today's
 * plain-text paragraphs.
 */

export type MathSplitSegment =
  | { type: "math"; tex: string }
  | { type: "lines"; lines: string[] };

const MATH_LINE_RE = /^\s*\$\$\s*$/;
const MATH_SINGLE_RE = /^\s*\$\$(.+)\$\$\s*$/;

/* Splits a fence-free line run: whole-line $$ open/close pairs and
 * whole-line $$...$$ singles become math segments; everything else stays
 * lines. Fence bodies never reach this function — Markdown consumes them
 * first, which is what keeps ``` content invisible here. */
export function splitMathBlocks(lines: string[]): MathSplitSegment[] {
  const segs: MathSplitSegment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      segs.push({ type: "lines", lines: buffer });
      buffer = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const single = lines[i].match(MATH_SINGLE_RE);
    if (single) {
      flush();
      segs.push({ type: "math", tex: single[1].trim() });
      continue;
    }
    if (MATH_LINE_RE.test(lines[i])) {
      /* Emit only when the closing $$ line exists; otherwise the run stays
       * plain text exactly as it renders today. */
      let j = i + 1;
      while (j < lines.length && !MATH_LINE_RE.test(lines[j])) j += 1;
      if (j < lines.length) {
        flush();
        segs.push({ type: "math", tex: lines.slice(i + 1, j).join("\n") });
        i = j;
      } else {
        buffer.push(lines[i]);
      }
      continue;
    }
    buffer.push(lines[i]);
  }
  flush();
  return segs;
}

/* Inline $...$: the char after the opening $ must be alphanumeric, a
 * backslash or an opening parenthesis; the char before the closing $ must
 * be alphanumeric or one of )}^_; \$ escapes and $$ blocks never match;
 * digits-only content (prices) is rejected. */
const INLINE_MATH_RE =
  /^(?<!\\)\$(?:([A-Za-z0-9\\(][^$]*[A-Za-z0-9)}^_])|([A-Za-z0-9]))\$(?!\$)$/;

export function parseInlineMath(part: string): string | null {
  const m = part.match(INLINE_MATH_RE);
  if (!m) return null;
  const tex = m[1] ?? m[2] ?? "";
  if (/^\d+$/.test(tex)) return null;
  return tex;
}

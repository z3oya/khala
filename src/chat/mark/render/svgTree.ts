/**
 * SVG node construction and serialization.
 */
import type { SvgNode } from "../types";

const VOID_TAGS = new Set(["path", "use", "rect", "stop", "circle"]);

const ATTR_ESCAPE_RE = /[&<>"]/g;

const ATTR_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function el(
  tag: string,
  attrs: SvgNode["attrs"],
  children: SvgNode[] = [],
): SvgNode {
  return { tag, attrs, children };
}

export function svgRoot(
  size: number,
  id: string,
  width: number,
  children: SvgNode[],
): SvgNode {
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      id,
      width,
      height: width,
      viewBox: `0 0 ${size} ${size}`,
    },
    children,
  );
}

export function serializeSvg(node: SvgNode): string {
  let attrStr = "";
  for (const [name, value] of Object.entries(node.attrs)) {
    attrStr += ` ${name}="${String(value).replace(ATTR_ESCAPE_RE, (c) => ATTR_ESCAPE[c])}"`;
  }
  return VOID_TAGS.has(node.tag)
    ? `<${node.tag}${attrStr}/>`
    : `<${node.tag}${attrStr}>${node.children.map(serializeSvg).join("")}</${node.tag}>`;
}

export function fmt2(v: number, digits = 2): string {
  const scale = 10 ** digits;
  return String(Math.round(v * scale) / scale);
}

export function fmt2b(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;

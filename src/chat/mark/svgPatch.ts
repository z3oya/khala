/**
 * SVG DOM patcher — 1:1 port of grok-bot-mark.
 * patchSvg requires DOM and is covered by svgPatch.dom.test.ts (happy-dom);
 * the pure function buildTreeIndex is covered by svgPatch.test.ts.
 */
import type { SvgNode } from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";

const TREE_END = "/";

interface PatchCacheEntry {
  root: Element;
  names: string[];
  slots: Attr[];
  values: string[];
}

const patchCache = new WeakMap<HTMLElement, PatchCacheEntry>();

function writeTreeIndex(node: SvgNode, names: string[], values: string[]): void {
  names.push(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    names.push(name);
    values.push(String(value));
  }
  for (const child of node.children) writeTreeIndex(child, names, values);
  names.push(TREE_END);
}

/** buildTreeIndex: flattens the SvgNode tree into a (names, values) sequence (pure-function form of source r_). */
export function buildTreeIndex(node: SvgNode): { names: string[]; values: string[] } {
  const names: string[] = [];
  const values: string[] = [];
  writeTreeIndex(node, names, values);
  return { names, values };
}

function buildDom(doc: Document, node: SvgNode): Element {
  const dom = doc.createElementNS(SVG_NS, node.tag);
  for (const [name, value] of Object.entries(node.attrs)) dom.setAttribute(name, String(value));
  for (const child of node.children) dom.append(buildDom(doc, child));
  return dom;
}

function namesEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function patchSvg(host: HTMLElement, node: SvgNode): void {
  const { names, values } = buildTreeIndex(node);
  const cached = patchCache.get(host);
  if (cached != null && host.firstChild === cached.root && namesEqual(cached.names, names)) {
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== cached.values[i]) cached.slots[i].value = values[i];
    }
    cached.values = values;
    return;
  }
  const root = buildDom(host.ownerDocument, node);
  host.replaceChildren(root);
  const slots = [root, ...Array.from(root.querySelectorAll("*"))]
    .flatMap((dom) => Array.from(dom.attributes));
  patchCache.set(host, { root, names, slots, values });
}

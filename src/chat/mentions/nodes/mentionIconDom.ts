/* Icon path data for PromptMentionNode's vanilla-DOM rendering (Lexical nodes can't host
 * React components). Keep the per-icon lucide names in sync with the lucide-react imports
 * used by the bubble (MentionPanel/MessageList). */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type MentionLucideIconNode = ReadonlyArray<
  readonly ["path" | "circle" | "rect", Readonly<Record<string, string>>]
>;

/** lucide-react `WandSparkles` */
export const SKILL_MENTION_ICON_NODE = [
  [
    "path",
    {
      d: "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
    },
  ],
  ["path", { d: "m14 7 3 3" }],
  ["path", { d: "M5 6v4" }],
  ["path", { d: "M19 14v4" }],
  ["path", { d: "M10 2v2" }],
  ["path", { d: "M7 8H3" }],
  ["path", { d: "M21 16h-4" }],
  ["path", { d: "M11 3H9" }],
] as const satisfies MentionLucideIconNode;

/** lucide-react `MessagesSquare` */
export const SESSION_MENTION_ICON_NODE = [
  [
    "path",
    { d: "M14 9a2 2 0 0 1-2 2H6l-4 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" },
  ],
  ["path", { d: "M18 9h2a2 2 0 0 1 2 2v10l-4-4h-6a2 2 0 0 1-2-2v-1" }],
] as const satisfies MentionLucideIconNode;

/** lucide-react `SquareSlash` */
export const COMMAND_MENTION_ICON_NODE = [
  [
    "path",
    {
      d: "M21 5v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
    },
  ],
  ["path", { d: "m9 15 6-6" }],
] as const satisfies MentionLucideIconNode;

/** lucide-react `File` */
export const FILE_MENTION_ICON_NODE = [
  [
    "path",
    { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" },
  ],
  ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
] as const satisfies MentionLucideIconNode;

/** lucide-react `Folder` */
export const FOLDER_MENTION_ICON_NODE = [
  [
    "path",
    {
      d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
    },
  ],
] as const satisfies MentionLucideIconNode;

export function createMentionSvgIcon(iconNode: MentionLucideIconNode): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  for (const [tagName, attributes] of iconNode) {
    const node = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, value);
    }
    svg.append(node);
  }

  return svg;
}

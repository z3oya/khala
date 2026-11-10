/* Icon decoration via CSS variables only: a child img/svg would break Lexical's
 * selection mapping. */

import type { MentionCategory, MentionItemData } from "../mentionTypes";
import {
  COMMAND_MENTION_ICON_NODE,
  FILE_MENTION_ICON_NODE,
  FOLDER_MENTION_ICON_NODE,
  SESSION_MENTION_ICON_NODE,
  SKILL_MENTION_ICON_NODE,
  createMentionSvgIcon,
  type MentionLucideIconNode,
} from "./mentionIconDom";

function setMask(dom: HTMLElement, icon: MentionLucideIconNode) {
  const svg = createMentionSvgIcon(icon);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  dom.style.setProperty(
    "--mention-mask",
    `url(${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`)})`,
  );
  dom.style.setProperty("--mention-icon-color", "currentColor");
}

export function decoratePromptMention(
  dom: HTMLElement,
  category: MentionCategory,
  data?: MentionItemData,
) {
  if (category === "files") {
    setMask(dom, data?.kind === "directory" ? FOLDER_MENTION_ICON_NODE : FILE_MENTION_ICON_NODE);
    return;
  }
  const icon =
    category === "skills"
      ? SKILL_MENTION_ICON_NODE
      : category === "sessions"
        ? SESSION_MENTION_ICON_NODE
        : COMMAND_MENTION_ICON_NODE;
  setMask(dom, icon);
}

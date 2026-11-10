/* Class names shared by editor and bubble chips; colors live in chat.css tokens. */

import type { MentionCategory } from "./mentionTypes";

export const PROMPT_MENTION_BASE_CLASS_NAME = "mention";

export function getPromptMentionClassNames(category: MentionCategory): string {
  return `${PROMPT_MENTION_BASE_CLASS_NAME} mention--${category}`;
}

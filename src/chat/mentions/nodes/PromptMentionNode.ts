/* Token-mode TextNode: the caret cannot enter it and deletion removes it whole; node text
 * is the display label, getMarkdown() returns the canonical form for sending/copying. */

import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  TextNode,
} from "lexical";
import { getPromptMentionClassNames } from "../mentionChip";
import type { MentionCategory, MentionItemData } from "../mentionTypes";
import { decoratePromptMention } from "./promptMentionDecoration";

export interface PromptMentionPayload {
  id: string;
  category: MentionCategory;
  label: string;
  value: string;
  markdown: string;
  data?: MentionItemData;
}

type SerializedPromptMentionNode = SerializedTextNode & {
  category: MentionCategory;
  data?: MentionItemData;
  mentionId: string;
  markdown: string;
  type: "prompt-mention";
  value: string;
  version: 1;
};

export class PromptMentionNode extends TextNode {
  __category: MentionCategory;
  __data?: MentionItemData;
  __markdown: string;
  __mentionId: string;
  __value: string;

  static getType(): string {
    return "prompt-mention";
  }

  static clone(node: PromptMentionNode): PromptMentionNode {
    return new PromptMentionNode(
      {
        id: node.__mentionId,
        category: node.__category,
        label: node.__text,
        value: node.__value,
        markdown: node.__markdown,
        data: node.__data,
      },
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedPromptMentionNode): PromptMentionNode {
    const node = $createPromptMentionNode({
      id: serializedNode.mentionId,
      category: serializedNode.category,
      label: serializedNode.text,
      value: serializedNode.value,
      markdown: serializedNode.markdown,
      data: serializedNode.data,
    });
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  constructor(payload: PromptMentionPayload, key?: NodeKey) {
    super(payload.label.trim() || payload.value, key);
    this.__mentionId = payload.id;
    this.__category = payload.category;
    this.__value = payload.value;
    this.__markdown = payload.markdown;
    this.__data = payload.data;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = getPromptMentionClassNames(this.__category);
    dom.setAttribute("data-mention-category", this.__category);
    dom.setAttribute("spellcheck", "false");
    // The TextNode firstChild chain must lead to the display text; the icon stays a
    // non-participating CSS decoration (see promptMentionDecoration.ts).
    decoratePromptMention(dom, this.__category, this.__data);
    return dom;
  }

  updateDOM(prevNode: PromptMentionNode, dom: HTMLElement, config: EditorConfig): boolean {
    // Payload fields have no setters and token mode blocks text merging, so only the
    // TextNode-level properties can change.
    return super.updateDOM(prevNode as this, dom, config);
  }

  exportJSON(): SerializedPromptMentionNode {
    return {
      ...super.exportJSON(),
      type: "prompt-mention",
      version: 1,
      mentionId: this.__mentionId,
      category: this.__category,
      value: this.__value,
      markdown: this.__markdown,
      data: this.__data,
    };
  }

  getMarkdown(): string {
    return this.getLatest().__markdown;
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createPromptMentionNode(payload: PromptMentionPayload): PromptMentionNode {
  const node = new PromptMentionNode(payload);
  node.setMode("token");
  return $applyNodeReplacement(node);
}

export function $isPromptMentionNode(
  node: LexicalNode | null | undefined,
): node is PromptMentionNode {
  return node instanceof PromptMentionNode;
}

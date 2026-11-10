export type MentionCategory = "files" | "skills" | "commands" | "sessions";

export interface MentionItemData {
  kind?: "file" | "directory";
  path?: string;
  relativePath?: string;
}

export interface MentionItem {
  id: string;
  category: MentionCategory;
  label: string;
  description: string;
  value: string;
  markdown: string;
  keywords?: string[];
  data?: MentionItemData;
}

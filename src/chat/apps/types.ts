/* App-gallery types; mirrors goose's GooseApp at mock fidelity. */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type AppSource = "built" | "imported";

export interface AppSize {
  width: number;
  height: number;
}

export interface KhalaApp {
  id: string;
  name: string;
  description: string;
  /** "built" = made in chat; "imported" = loaded from an .html file. */
  source: AppSource;
  icon: LucideIcon;
  updatedAtMs: number;
  size?: AppSize;
  /** Built apps render a sample component; imported ones render html. */
  sample?: ComponentType;
  html?: string;
}

/**
 * Palette logic. Swatch/gradient-pair/solid color data comes from data/appearance.generated.ts.
 */
import type { ColorId } from "../types";
import { PALETTE } from "../data/appearance.generated";

export interface PaletteItem {
  id: ColorId;
  label: string;
  value: string;
}

export function paletteHex(color: string | null | undefined): string {
  return PALETTE.find((t) => t.id === color)?.value ?? PALETTE[0].value;
}

// Pickable swatch (black filtered out)
export const pickablePalette: readonly PaletteItem[] = PALETTE.filter((t) => t.id !== "black");

// Pickable color id list
export const PICKABLE_COLOR_IDS: readonly ColorId[] = pickablePalette.map(({ id }) => id);

// Full color id list
export const COLOR_IDS: readonly ColorId[] = PALETTE.map(({ id }) => id);

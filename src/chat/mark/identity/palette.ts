/**
 * Palette logic. Swatch/gradient-pair/solid color data comes from data/appearance.generated.ts.
 */
import type { ColorId } from "../types";
import { FLAT_COLORS, GRADIENT_PAIRS, PALETTE } from "../data/appearance.generated";

export { FLAT_COLORS, GRADIENT_PAIRS };

export interface PaletteItem {
  id: ColorId;
  label: string;
  value: string;
}

export interface GradientPair {
  lightFrom: string;
  lightTo: string;
  darkFrom: string;
  darkTo: string;
}

export interface FlatColor {
  light: string;
  dark: string;
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

// light-dark gradient pairs, angle always 135
export function gradientFor(color: ColorId): { from: string; to: string; angle: number } {
  const t = GRADIENT_PAIRS[color];
  return {
    from: `light-dark(${t.lightFrom}, ${t.darkFrom})`,
    to: `light-dark(${t.lightTo}, ${t.darkTo})`,
    angle: 135,
  };
}

export function flatFor(color: ColorId): string {
  const t = FLAT_COLORS[color];
  return `light-dark(${t.light}, ${t.dark})`;
}

export function flatPair(color: ColorId, key: "light" | "dark"): string {
  return FLAT_COLORS[color][key];
}

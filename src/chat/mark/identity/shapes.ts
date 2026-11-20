/**
 * Shape vocabularies and picker -> body mapping. Vocabulary data comes from data/shapes.generated.ts.
 */
import type { BodyId, ShapeId } from "../types";
import { ALL_SHAPE_IDS, RECIPE_BODY_ALIAS } from "../data/shapes.generated";

export { RECIPE_BODY_ALIAS };

// All valid ShapeIds (including pumpkin)
const SHAPE_ID_SET: ReadonlySet<string> = new Set(ALL_SHAPE_IDS);

export function isShapeId(v: string | null | undefined): v is ShapeId {
  return v != null && SHAPE_ID_SET.has(v);
}

// Aliases from the picker vocabulary to body ids
export function pickerToBody(shape: ShapeId): BodyId {
  switch (shape) {
    case "blob": return "sphere";
    case "flower": return "starFlower";
    case "heart": return "heartChubby";
    case "star": return "star6";
    default: return shape;
  }
}

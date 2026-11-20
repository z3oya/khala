/**
 * Look direction presets.
 */
import type { LookDir, Vec2, Vec3 } from "../types";

export interface LookPreset {
  rot: Vec3;
  pos: Vec2;
}

export const LOOK_PRESETS: Record<LookDir, LookPreset> = {
  left: { rot: [0, -20, 0], pos: [-0.1, 0] },
  right: { rot: [0, 20, 0], pos: [0.1, 0] },
  up: { rot: [-20, 0, 0], pos: [0, 0.1] },
  down: { rot: [20, 0, 0], pos: [0, -0.1] },
  center: { rot: [0, 0, 0], pos: [0, 0] },
};

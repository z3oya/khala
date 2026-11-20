/**
 * agentId / avatar preferences -> mark identity resolution. Default shapes come from data/shapes.generated.ts (8 default shapes, 13 menu shapes).
 */
import type { ColorId, ShapeId } from "../types";
import { DEFAULT_SHAPE_SET, MENUBAR_SHAPE_SET, PICKER_SHAPES } from "../data/shapes.generated";
import { avalanche, colorFor } from "../engine/math/rand";
import { COLOR_IDS } from "./palette";

export interface AgentIdentityInput {
  agentId: string;
  avatarShape?: string | null;
  avatarColor?: string | null;
}

export interface AgentIdentity {
  shape: ShapeId;
  color: ColorId;
}

// Only valid picker shapes pass through
export function resolveShape(v: string | null | undefined): ShapeId | undefined {
  return v == null ? undefined : PICKER_SHAPES.find((t) => t === v);
}

// Only valid color ids pass through
export function resolveColor(v: string | null | undefined): ColorId | undefined {
  return v == null ? undefined : COLOR_IDS.find((t) => t === v);
}

// agentId -> default shape (8-shape set)
export function defaultShapeFor(agentId: string): ShapeId {
  return DEFAULT_SHAPE_SET[avalanche(agentId) % DEFAULT_SHAPE_SET.length] ?? "blob";
}

// agentId -> default color (formula body in engine/math/rand.ts colorFor)
export const defaultColorFor: (agentId: string) => ColorId = colorFor;

export function resolveAgentIdentity(agent: AgentIdentityInput): AgentIdentity {
  return {
    shape: resolveShape(agent.avatarShape) ?? defaultShapeFor(agent.agentId),
    color: resolveColor(agent.avatarColor) ?? defaultColorFor(agent.agentId),
  };
}

// Menu side: default shape taken from the 13-shape set instead
export function resolveMenuIdentity(agent: AgentIdentityInput): AgentIdentity {
  return {
    shape: resolveShape(agent.avatarShape) ?? MENUBAR_SHAPE_SET[avalanche(agent.agentId) % MENUBAR_SHAPE_SET.length] ?? "blob",
    color: resolveColor(agent.avatarColor) ?? defaultColorFor(agent.agentId),
  };
}

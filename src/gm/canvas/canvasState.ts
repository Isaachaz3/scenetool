import type Konva from 'konva';
import { create } from 'zustand';
import type { Rect } from '../../core/geometry';
import type { DrawingItem, FogShape, Id, MeasureView, Vec2 } from '../../core/types';
import { PointerTrail } from '../../render/PointerTrail';

/** Konva nodes of scene items by id, filled by ref callbacks. */
export const itemNodes = new Map<Id, Konva.Node>();

export function registerNode(id: Id, node: Konva.Node | null): void {
  if (node) itemNodes.set(id, node);
  else itemNodes.delete(id);
}

export const stageRef: { current: Konva.Stage | null } = { current: null };

/** Last pointer position over the canvas, in world units (for paste). */
export const lastPointer: { world: Vec2 | null } = { world: null };

export interface PolygonDraft {
  target: 'draw' | 'fog';
  points: Vec2[];
  hover: Vec2 | null;
}

interface CanvasUi {
  band: Rect | null; // rubber band in world units
  gesture: 'pan' | 'drag' | 'band' | 'tool' | null; // gesture in progress
  measure: MeasureView | null; // ruler or movement line
  draft: DrawingItem | FogShape | null; // shape being drawn
  polygon: PolygonDraft | null; // polygon being clicked in
  contextMenu: Vec2 | null; // screen position of the right-click menu
}

export const useCanvasUi = create<CanvasUi>(() => ({
  band: null,
  gesture: null,
  measure: null,
  draft: null,
  polygon: null,
  contextMenu: null,
}));

/** The GM's own laser pointer trail. */
export const gmPointerTrail = new PointerTrail();

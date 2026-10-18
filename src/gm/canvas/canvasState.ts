import type Konva from 'konva';
import { create } from 'zustand';
import type { Rect } from '../../core/geometry';
import type { Id, Vec2 } from '../../core/types';

/** Konva nodes of scene items by id, filled by ref callbacks. */
export const itemNodes = new Map<Id, Konva.Node>();

export function registerNode(id: Id, node: Konva.Node | null): void {
  if (node) itemNodes.set(id, node);
  else itemNodes.delete(id);
}

export const stageRef: { current: Konva.Stage | null } = { current: null };

/** Last pointer position over the canvas, in world units (for paste). */
export const lastPointer: { world: Vec2 | null } = { world: null };

interface CanvasUi {
  band: Rect | null; // rubber band in world units
  gesture: 'pan' | 'drag' | 'band' | null; // gesture in progress
}

export const useCanvasUi = create<CanvasUi>(() => ({ band: null, gesture: null }));

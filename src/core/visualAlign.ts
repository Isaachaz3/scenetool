// Math of the three-step visual alignment: corner → size over 4 cells → refine at the far edge.
import type { ImageGrid, Vec2 } from './types';

export const SIZE_CELLS = 4;
export const MIN_ALIGN_DPI = 4;

export type AxisLock = 'x' | 'y' | null;

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Where the size handle sits: 4 cells to the right of the anchor, or to the left near the edge. */
export function sizeHandle(grid: ImageGrid, width: number): Vec2 {
  const dir = grid.offset.x + SIZE_CELLS * grid.dpi <= width ? 1 : -1;
  return { x: grid.offset.x + dir * SIZE_CELLS * grid.dpi, y: grid.offset.y };
}

/** DPI from the size handle: the anchor-to-handle distance covers 4 cells. */
export function dpiFromSize(anchor: Vec2, handle: Vec2): number {
  return Math.max(MIN_ALIGN_DPI, round2(Math.abs(handle.x - anchor.x) / SIZE_CELLS));
}

/** Whole cells from the anchor to the farther image edge on each axis (signed, never 0). */
export function farCells(grid: ImageGrid, width: number, height: number): { nx: number; ny: number } {
  const span = (pos: number, size: number) => {
    const after = Math.floor((size - pos) / grid.dpi + 1e-6);
    const before = Math.floor(pos / grid.dpi + 1e-6);
    const n = after >= before ? after : -before;
    return n === 0 ? 1 : n;
  };
  return { nx: span(grid.offset.x, width), ny: span(grid.offset.y, height) };
}

/** Grid intersection the refine handle sits on. */
export function farHandle(grid: ImageGrid, nx: number, ny: number): Vec2 {
  return { x: grid.offset.x + nx * grid.dpi, y: grid.offset.y + ny * grid.dpi };
}

/**
 * DPI that puts intersection (nx, ny) under the handle: least squares over both axes, or one
 * axis only when it is locked (Shift).
 */
export function dpiFromFar(anchor: Vec2, handle: Vec2, nx: number, ny: number, lock: AxisLock): number {
  const dx = handle.x - anchor.x;
  const dy = handle.y - anchor.y;
  const dpi = lock === 'x' ? dx / nx : lock === 'y' ? dy / ny : (dx * nx + dy * ny) / (nx * nx + ny * ny);
  return Math.max(MIN_ALIGN_DPI, round2(dpi));
}

/** Shift keeps a drag on the axis it moved along most. */
export function lockAxis(delta: Vec2): AxisLock {
  return Math.abs(delta.x) >= Math.abs(delta.y) ? 'x' : 'y';
}

export function applyLock(delta: Vec2, lock: AxisLock): Vec2 {
  if (lock === 'x') return { x: delta.x, y: 0 };
  if (lock === 'y') return { x: 0, y: delta.y };
  return delta;
}

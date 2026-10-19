import { CELL } from './constants';
import type { DiscToken, ImageGrid, ImageItem, Item, Vec2 } from './types';

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function rotate(p: Vec2, degrees: number): Vec2 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** World units per image pixel for an image with the given grid and item scale. */
export function imageScale(grid: ImageGrid, scale: Vec2 = { x: 1, y: 1 }): Vec2 {
  const s = CELL / grid.dpi;
  return { x: s * scale.x, y: s * scale.y };
}

/** w = position + R(θ)((p − offset)·s) */
export function imagePointToWorld(
  p: Vec2,
  item: Pick<ImageItem, 'grid' | 'position' | 'rotation' | 'scale'>,
): Vec2 {
  const s = imageScale(item.grid, item.scale);
  const local = { x: (p.x - item.grid.offset.x) * s.x, y: (p.y - item.grid.offset.y) * s.y };
  return add(item.position, rotate(local, item.rotation));
}

/** Grid of a token image: one cell by the larger side, anchored at the center. */
export function tokenGrid(width: number, height: number, sizeCells = 1): ImageGrid {
  return {
    dpi: Math.max(width, height) / sizeCells,
    offset: { x: width / 2, y: height / 2 },
    source: 'fallback',
  };
}

/** Nearest grid line intersection. */
export function snapToIntersection(p: Vec2): Vec2 {
  return { x: Math.round(p.x / CELL) * CELL, y: Math.round(p.y / CELL) * CELL };
}

/** Center of the cell containing p. */
export function snapToCellCenter(p: Vec2): Vec2 {
  return { x: (Math.floor(p.x / CELL) + 0.5) * CELL, y: (Math.floor(p.y / CELL) + 0.5) * CELL };
}

/**
 * Snaps one axis: an odd footprint (1, 3 cells, or anything below one cell) snaps to a cell
 * center, an even one (2, 4 cells) to a grid line.
 */
export function snapAxis(value: number, footprintCells: number): number {
  const n = Math.round(footprintCells);
  if (n >= 2 && n % 2 === 0) return Math.round(value / CELL) * CELL;
  return (Math.floor(value / CELL) + 0.5) * CELL;
}

/** Footprint in cells along the item's own axes, swapped when the item is turned sideways. */
export function itemFootprint(item: Item, imageSize?: { width: number; height: number }): Vec2 | null {
  let fp: Vec2 | null = null;
  if (item.kind === 'disc') fp = { x: item.sizeCells, y: item.sizeCells };
  else if (item.kind === 'image' && imageSize) {
    const s = imageScale(item.grid, item.scale);
    fp = { x: (imageSize.width * s.x) / CELL, y: (imageSize.height * s.y) / CELL };
  }
  if (!fp) return null;
  const quarter = Math.round((((item.rotation % 360) + 360) % 360) / 90) % 2;
  return quarter === 1 ? { x: fp.y, y: fp.x } : fp;
}

/**
 * Snap rule for an item's anchor: maps go to intersections, tokens and props to a cell center
 * or an intersection depending on the parity of their size. Text and drawings snap to
 * intersections.
 */
export function snapItemPosition(item: Item, p: Vec2, imageSize?: { width: number; height: number }): Vec2 {
  if (item.kind === 'image' && item.layer === 'map') return snapToIntersection(p);
  // A ruler starts at a cell center like its ends, unless it was placed without snapping.
  if (item.kind === 'ruler') {
    const c = snapToCellCenter(item.position);
    const onCenter = Math.abs(c.x - item.position.x) < 0.01 && Math.abs(c.y - item.position.y) < 0.01;
    return onCenter ? snapToCellCenter(p) : p;
  }
  const fp = itemFootprint(item, imageSize);
  if (!fp) return snapToIntersection(p);
  return { x: snapAxis(p.x, fp.x), y: snapAxis(p.y, fp.y) };
}

/** Size of a token in cells along its larger side. */
export function tokenSizeCells(item: ImageItem | DiscToken, imageSize?: { width: number; height: number }) {
  if (item.kind === 'disc') return item.sizeCells;
  if (!imageSize) return 1;
  const s = imageScale(item.grid, item.scale);
  return Math.max(imageSize.width * s.x, imageSize.height * s.y) / CELL;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectUnion(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** World-space bounding box of an image item. */
export function imageBounds(item: ImageItem, width: number, height: number): Rect {
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((c) => imagePointToWorld(c, item));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

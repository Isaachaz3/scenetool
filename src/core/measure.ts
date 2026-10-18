import { CELL } from './constants';
import { snapToCellCenter } from './geometry';
import { formatDistance } from './scale';
import type { GridScale, MeasurementMethod, Vec2 } from './types';

/** Index of the cell containing a world point. */
export function cellIndex(p: Vec2): Vec2 {
  return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
}

/**
 * Distance between two world points in cells. Grid methods count cells between the cells
 * containing the points; Euclidean uses the exact coordinates.
 */
export function measureCells(a: Vec2, b: Vec2, method: MeasurementMethod): number {
  if (method === 'euclidean') return Math.hypot(b.x - a.x, b.y - a.y) / CELL;
  const ca = cellIndex(a);
  const cb = cellIndex(b);
  const dx = Math.abs(cb.x - ca.x);
  const dy = Math.abs(cb.y - ca.y);
  switch (method) {
    case 'alternating': {
      const d = Math.min(dx, dy);
      return d + Math.floor(d / 2) + (Math.max(dx, dy) - d);
    }
    case 'manhattan':
      return dx + dy;
    default:
      return Math.max(dx, dy); // chessboard (D&D 5e); hex grids come in stage 3
  }
}

/** Sum over consecutive points (waypoints). */
export function measurePath(points: Vec2[], method: MeasurementMethod): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += measureCells(points[i - 1], points[i], method);
  return total;
}

export function measureLabel(points: Vec2[], method: MeasurementMethod, scale: GridScale): string {
  return formatDistance(measurePath(points, method), scale);
}

/** Ruler ends snap to cell centers, except for Euclidean and while Ctrl is held. */
export function rulerPoint(p: Vec2, method: MeasurementMethod, snap: boolean): Vec2 {
  return snap && method !== 'euclidean' ? snapToCellCenter(p) : p;
}

/** Rotation in degrees for a label along a→b that is never upside down. */
export function labelAngle(a: Vec2, b: Vec2): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

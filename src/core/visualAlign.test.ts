import { describe, expect, it } from 'vitest';
import type { ImageGrid } from './types';
import { dpiFromFar, dpiFromSize, farCells, farHandle, lockAxis, sizeHandle } from './visualAlign';

const grid = (dpi: number, x = 0, y = 0): ImageGrid => ({ dpi, offset: { x, y }, source: 'manual' });

describe('visual alignment', () => {
  it('puts the size handle 4 cells away, on the side with room', () => {
    expect(sizeHandle(grid(100, 20, 30), 2000)).toEqual({ x: 420, y: 30 });
    expect(sizeHandle(grid(100, 1900, 30), 2000)).toEqual({ x: 1500, y: 30 });
  });

  it('measures DPI over 4 cells', () => {
    expect(dpiFromSize({ x: 23, y: 41 }, { x: 23 + 4 * 137.25, y: 60 })).toBe(137.25);
    expect(dpiFromSize({ x: 500, y: 0 }, { x: 100, y: 0 })).toBe(100);
  });

  it('counts whole cells to the farther edge', () => {
    // 30 × 20 cells of 137 px, anchor at an intersection near the top left.
    expect(farCells(grid(137, 23, 41), 30 * 137 + 23, 20 * 137 + 41)).toEqual({ nx: 30, ny: 20 });
    expect(farCells(grid(100, 950, 50), 1000, 1000)).toEqual({ nx: -9, ny: 9 });
  });

  it('refines DPI so the far intersection lands under the handle', () => {
    const a = { x: 23, y: 41 };
    const h = farHandle(grid(137, 23, 41), 30, 20);
    expect(dpiFromFar(a, h, 30, 20, null)).toBe(137);
    // Off by 15 px horizontally only: least squares splits it, Shift on x takes it whole.
    const off = { x: h.x + 15, y: h.y };
    expect(dpiFromFar(a, off, 30, 20, 'x')).toBe(137.5);
    expect(dpiFromFar(a, off, 30, 20, null)).toBeCloseTo(137.35, 2);
    expect(dpiFromFar(a, { x: h.x, y: h.y - 10 }, 30, 20, 'y')).toBe(136.5);
  });

  it('locks Shift drags to the dominant axis', () => {
    expect(lockAxis({ x: 10, y: -3 })).toBe('x');
    expect(lockAxis({ x: 1, y: -3 })).toBe('y');
  });
});

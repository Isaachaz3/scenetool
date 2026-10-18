import { describe, expect, it } from 'vitest';
import { CELL } from './constants';
import { labelAngle, measureCells, measureLabel, measurePath, rulerPoint } from './measure';
import { simplify } from './simplify';
import type { MeasurementMethod } from './types';

const ft5 = { value: 5, unit: 'ft', decimals: 0 };
const center = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });

describe('distances', () => {
  // Acceptance: 5 cells diagonally at 5ft → 25 / 35 / 35 / 50 ft.
  const cases: [MeasurementMethod, string][] = [
    ['chessboard', '25ft'],
    ['alternating', '35ft'],
    ['euclidean', '35ft'],
    ['manhattan', '50ft'],
  ];
  for (const [method, label] of cases) {
    it(`${method}: 5 diagonal cells = ${label}`, () => {
      expect(measureLabel([center(2, 3), center(7, 8)], method, ft5)).toBe(label);
    });
  }

  it('counts cells between containing cells', () => {
    expect(measureCells({ x: 10, y: 10 }, { x: 140, y: 140 }, 'chessboard')).toBe(0);
    expect(measureCells(center(0, 0), center(3, 1), 'chessboard')).toBe(3);
    expect(measureCells(center(0, 0), center(3, 1), 'manhattan')).toBe(4);
    expect(measureCells(center(0, 0), center(-2, -2), 'alternating')).toBe(3);
    expect(measureCells(center(0, 0), center(4, 4), 'alternating')).toBe(6);
    expect(measureCells(center(0, 0), center(5, 2), 'alternating')).toBe(6);
    expect(measureCells(center(0, 0), center(3, 4), 'euclidean')).toBe(5);
  });

  it('sums waypoints and keeps the scale precision', () => {
    expect(measurePath([center(0, 0), center(2, 0), center(2, 3)], 'chessboard')).toBe(5);
    expect(
      measureLabel([center(0, 0), center(5, 0)], 'chessboard', { value: 1.5, unit: 'м', decimals: 1 }),
    ).toBe('7,5м');
  });

  it('snaps ruler ends to cell centers except for Euclidean or without snapping', () => {
    expect(rulerPoint({ x: 10, y: 160 }, 'chessboard', true)).toEqual({ x: 75, y: 225 });
    expect(rulerPoint({ x: 10, y: 160 }, 'euclidean', true)).toEqual({ x: 10, y: 160 });
    expect(rulerPoint({ x: 10, y: 160 }, 'chessboard', false)).toEqual({ x: 10, y: 160 });
  });

  it('keeps labels upright', () => {
    expect(labelAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(labelAngle({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(labelAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(labelAngle({ x: 0, y: 0 }, { x: -10, y: 10 })).toBeCloseTo(-45);
  });
});

describe('simplify', () => {
  it('drops points on a straight line and keeps corners', () => {
    expect(simplify([0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 3, 2], 0.1)).toEqual([0, 0, 3, 0, 3, 2]);
    expect(simplify([0, 0, 5, 5], 1)).toEqual([0, 0, 5, 5]);
  });
});

import { describe, expect, it } from 'vitest';
import { coverPosition, coverWindow, focusFromPixels } from './cover';

const tv = { width: 1920, height: 1080 };

describe('backdrop cover', () => {
  it('cuts the sides of a square picture on a wide screen, around the focus', () => {
    const img = { width: 1000, height: 1000 };
    const win = coverWindow(img, tv, { x: 0.5, y: 0.5 });
    expect(win.w).toBe(1);
    expect(win.h).toBeCloseTo(0.5625);
    expect(win.y).toBeCloseTo(0.21875);
    expect(coverPosition(img, tv, { x: 0.5, y: 0.5 }).y).toBeCloseTo(50);
    // A focus near the top keeps the top; the window never leaves the picture.
    expect(coverWindow(img, tv, { x: 0.5, y: 0.1 }).y).toBe(0);
    expect(coverPosition(img, tv, { x: 0.5, y: 0.1 }).y).toBe(0);
    expect(coverPosition(img, tv, { x: 0.5, y: 0.95 }).y).toBe(100);
  });

  it('keeps the whole picture when the proportions match', () => {
    expect(coverPosition({ width: 3840, height: 2160 }, tv, { x: 0.9, y: 0.1 })).toEqual({ x: 50, y: 50 });
  });

  it('finds the detailed part of a picture', () => {
    // 20 × 20, flat grey except a checkered patch in the right half, upper part.
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4).fill(128);
    for (let y = 3; y < 9; y++)
      for (let x = 12; x < 18; x++) {
        const v = (x + y) % 2 ? 255 : 0;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    const f = focusFromPixels(data, w, h);
    expect(f.x).toBeGreaterThan(0.6);
    expect(f.y).toBeLessThan(0.45);
    expect(focusFromPixels(new Uint8ClampedArray(w * h * 4).fill(10), w, h)).toEqual({ x: 0.5, y: 0.5 });
  });
});

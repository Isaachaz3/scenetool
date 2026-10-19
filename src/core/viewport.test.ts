import { describe, expect, it } from 'vitest';
import { playerFrameRect, zoomForFrameCorner } from './viewport';

describe('player view frame', () => {
  it('is the area the player screen shows', () => {
    const r = playerFrameRect({ x: 1000, y: 500, zoom: 0.5 }, undefined, { width: 1920, height: 1080 });
    expect(r).toEqual({ x: 1000 - 1920, y: 500 - 1080, width: 3840, height: 2160 });
  });

  it('accounts for the screen the zoom was stored for', () => {
    // Stored for a 1280 × 720 screen; a 1920 × 1080 screen shows the same area.
    const r = playerFrameRect(
      { x: 0, y: 0, zoom: 1 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    );
    expect(r.width).toBeCloseTo(1280);
    expect(r.height).toBeCloseTo(720);
  });

  it('turns a dragged corner into a zoom with the screen proportions', () => {
    const screen = { width: 1600, height: 900 };
    expect(zoomForFrameCorner({ x: 0, y: 0 }, { x: 800, y: 100 }, screen)).toBe(1);
    expect(zoomForFrameCorner({ x: 0, y: 0 }, { x: 100, y: -900 }, screen)).toBeCloseTo(0.5);
  });
});

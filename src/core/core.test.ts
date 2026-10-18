import { describe, expect, it } from 'vitest';
import { CELL } from './constants';
import {
  imageBounds,
  imagePointToWorld,
  snapItemPosition,
  snapToCellCenter,
  snapToIntersection,
} from './geometry';
import { formatDistance, formatScale, parseScale } from './scale';
import type { DiscToken, ImageItem } from './types';
import {
  fitRect,
  panBy,
  playerZoom,
  screenToWorld,
  viewportForScreen,
  worldToScreen,
  zoomAt,
} from './viewport';

function disc(sizeCells: number): DiscToken {
  return {
    id: 'd',
    kind: 'disc',
    layer: 'character',
    z: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    visible: true,
    locked: false,
    color: '#fff',
    text: '1',
    sizeCells,
  };
}

function image(layer: ImageItem['layer'], dpi: number, offset = { x: 0, y: 0 }): ImageItem {
  return {
    id: 'i',
    kind: 'image',
    layer,
    z: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    visible: true,
    locked: false,
    assetId: 'a',
    grid: { dpi, offset, source: 'manual' },
  };
}

describe('snapping', () => {
  it('snaps to intersections and centers', () => {
    expect(snapToIntersection({ x: 80, y: -80 })).toEqual({ x: 150, y: -150 });
    expect(snapToCellCenter({ x: 10, y: 160 })).toEqual({ x: 75, y: 225 });
  });

  it('snaps odd tokens to centers and even ones to intersections', () => {
    const p = { x: 140, y: 20 };
    expect(snapItemPosition(disc(1), p)).toEqual({ x: 75, y: 75 });
    expect(snapItemPosition(disc(3), p)).toEqual({ x: 75, y: 75 });
    expect(snapItemPosition(disc(0.5), p)).toEqual({ x: 75, y: 75 });
    expect(snapItemPosition(disc(2), p)).toEqual({ x: 150, y: 0 });
  });

  it('snaps image tokens by footprint and maps to intersections', () => {
    const token = image('character', 200, { x: 200, y: 200 }); // 400 px = 2 cells
    expect(snapItemPosition(token, { x: 140, y: 20 }, { width: 400, height: 400 })).toEqual({ x: 150, y: 0 });
    const prop = image('prop', 200, { x: 200, y: 100 }); // 2 × 1 cells
    expect(snapItemPosition(prop, { x: 140, y: 20 }, { width: 400, height: 200 })).toEqual({ x: 150, y: 75 });
    expect(
      snapItemPosition({ ...prop, rotation: 90 }, { x: 140, y: 20 }, { width: 400, height: 200 }),
    ).toEqual({
      x: 75,
      y: 0,
    });
    const map = image('map', 100);
    expect(snapItemPosition(map, { x: 140, y: 20 }, { width: 1000, height: 1000 })).toEqual({ x: 150, y: 0 });
  });
});

describe('image transform', () => {
  it('maps image pixels to world units through dpi, offset and rotation', () => {
    const item = { ...image('map', 100, { x: 50, y: 50 }), position: { x: 300, y: 300 } };
    expect(imagePointToWorld({ x: 50, y: 50 }, item)).toEqual({ x: 300, y: 300 });
    expect(imagePointToWorld({ x: 150, y: 50 }, item)).toEqual({ x: 300 + CELL, y: 300 });
    const turned = imagePointToWorld({ x: 150, y: 50 }, { ...item, rotation: 90 });
    expect(turned.x).toBeCloseTo(300);
    expect(turned.y).toBeCloseTo(300 + CELL);
  });

  it('computes bounds', () => {
    expect(imageBounds(image('map', 100), 1000, 500)).toEqual({ x: 0, y: 0, width: 1500, height: 750 });
  });
});

describe('viewport', () => {
  const screen = { width: 1000, height: 800 };

  it('converts between world and screen', () => {
    const v = { x: 100, y: 50, zoom: 2 };
    const s = worldToScreen({ x: 150, y: 50 }, v, screen);
    expect(s).toEqual({ x: 600, y: 400 });
    expect(screenToWorld(s, v, screen)).toEqual({ x: 150, y: 50 });
  });

  it('zooms around the cursor', () => {
    const v = { x: 0, y: 0, zoom: 1 };
    const cursor = { x: 900, y: 100 };
    const before = screenToWorld(cursor, v, screen);
    const z = zoomAt(v, 2, cursor, screen);
    expect(z.zoom).toBe(2);
    const after = screenToWorld(cursor, z, screen);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to 10–1000 %', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }, screen).zoom).toBe(10);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0.001, { x: 0, y: 0 }, screen).zoom).toBe(0.1);
  });

  it('pans by a screen delta', () => {
    expect(panBy({ x: 0, y: 0, zoom: 2 }, { x: 100, y: -50 })).toEqual({ x: -50, y: 25, zoom: 2 });
  });

  it('fits a rectangle', () => {
    const v = fitRect({ x: 0, y: 0, width: 2000, height: 1000 }, screen, 0);
    expect(v).toEqual({ x: 1000, y: 500, zoom: 0.5 });
  });

  it('picks a player zoom that shows the whole GM area', () => {
    expect(playerZoom(1, { width: 1000, height: 800 }, { width: 1920, height: 1080 })).toBeCloseTo(1.35);
    expect(playerZoom(2, { width: 1000, height: 1000 }, { width: 500, height: 2000 })).toBeCloseTo(1);
  });

  it('rescales the player view for another screen size', () => {
    const v = { x: 5, y: 6, zoom: 1 };
    expect(viewportForScreen(v, { width: 800, height: 600 }, { width: 1600, height: 1200 }).zoom).toBe(2);
    expect(viewportForScreen(v, undefined, { width: 1600, height: 1200 })).toBe(v);
  });
});

describe('grid scale', () => {
  it('parses number, unit and precision', () => {
    expect(parseScale('5ft')).toEqual({ value: 5, unit: 'ft', decimals: 0 });
    expect(parseScale('1,5м')).toEqual({ value: 1.5, unit: 'м', decimals: 1 });
    expect(parseScale('5.00mi')).toEqual({ value: 5, unit: 'mi', decimals: 2 });
    expect(parseScale(' 10 ft ')).toEqual({ value: 10, unit: 'ft', decimals: 0 });
    expect(parseScale('abc')).toBeNull();
    expect(parseScale('0ft')).toBeNull();
  });

  it('formats scales and distances', () => {
    expect(formatScale({ value: 5, unit: 'ft', decimals: 0 })).toBe('5ft');
    expect(formatScale({ value: 1.5, unit: 'м', decimals: 1 })).toBe('1,5м');
    expect(formatDistance(5, { value: 5, unit: 'ft', decimals: 0 })).toBe('25ft');
    expect(formatDistance(5, { value: 1.5, unit: 'м', decimals: 1 })).toBe('7,5м');
    expect(formatDistance(1, { value: 5, unit: 'mi', decimals: 2 })).toBe('5.00mi');
  });
});

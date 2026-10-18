import { describe, expect, it } from 'vitest';
import { CELL } from '../constants';
import { imagePointToWorld } from '../geometry';
import type { ImageItem } from '../types';
import { detectGrid, detectMapGrid, dividesEvenly, fromMetadata } from './detect';
import { baseName, parseGridFromName } from './filename';
import { readImageInfo, type ImageInfo } from './metadata';

// --- synthetic image headers -------------------------------------------------------------

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function u16(n: number): number[] {
  return [(n >>> 8) & 255, n & 255];
}
function u32le(n: number): number[] {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}
function str(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}
function pngChunk(type: string, data: number[]): number[] {
  return [...u32(data.length), ...str(type), ...data, 0, 0, 0, 0];
}

function png(width: number, height: number, dpi?: number, unit = 1): Uint8Array {
  const bytes = [0x89, ...str('PNG'), 0x0d, 0x0a, 0x1a, 0x0a];
  bytes.push(...pngChunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]));
  if (dpi !== undefined) {
    const ppm = Math.round(dpi / 0.0254);
    bytes.push(...pngChunk('pHYs', [...u32(ppm), ...u32(ppm), unit]));
  }
  bytes.push(...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', []));
  return new Uint8Array(bytes);
}

/** Big-endian TIFF with XResolution, ResolutionUnit and Orientation. */
function tiff(dpi: number, unit = 2, orientation = 1): number[] {
  const entries = 3;
  const ifdStart = 8;
  const rationalAt = ifdStart + 2 + entries * 12 + 4;
  return [
    ...str('MM'),
    ...u16(42),
    ...u32(ifdStart),
    ...u16(entries),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u16(0x011a),
    ...u16(5),
    ...u32(1),
    ...u32(rationalAt),
    ...u16(0x0128),
    ...u16(3),
    ...u32(1),
    ...u16(unit),
    0,
    0,
    ...u32(0),
    ...u32(dpi * 10),
    ...u32(10),
  ];
}

function jpeg(width: number, height: number, opts: { jfif?: number; exif?: number; orientation?: number }) {
  const bytes = [0xff, 0xd8];
  if (opts.jfif !== undefined) {
    const data = [...str('JFIF'), 0, 1, 2, 1, ...u16(opts.jfif), ...u16(opts.jfif), 0, 0];
    bytes.push(0xff, 0xe0, ...u16(data.length + 2), ...data);
  }
  if (opts.exif !== undefined) {
    const data = [...str('Exif'), 0, 0, ...tiff(opts.exif, 2, opts.orientation ?? 1)];
    bytes.push(0xff, 0xe1, ...u16(data.length + 2), ...data);
  }
  const sof = [8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  bytes.push(0xff, 0xc0, ...u16(sof.length + 2), ...sof);
  bytes.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

function webp(width: number, height: number, exifDpi?: number): Uint8Array {
  const vp8x = [0x08, 0, 0, 0, ...u32le(width - 1).slice(0, 3), ...u32le(height - 1).slice(0, 3)];
  const chunks = [...str('VP8X'), ...u32le(vp8x.length), ...vp8x];
  if (exifDpi !== undefined) {
    const t = tiff(exifDpi);
    chunks.push(...str('EXIF'), ...u32le(t.length), ...t);
    if (t.length % 2) chunks.push(0);
  }
  return new Uint8Array([...str('RIFF'), ...u32le(chunks.length + 4), ...str('WEBP'), ...chunks]);
}

// --- tests -------------------------------------------------------------------------------

describe('file name grid', () => {
  it('reads latin x, cyrillic х and ×', () => {
    expect(parseGridFromName('Tavern 30x20.png')).toEqual({ cols: 30, rows: 20 });
    expect(parseGridFromName('таверна 30х20.png')).toEqual({ cols: 30, rows: 20 });
    expect(parseGridFromName('Cave 12 × 8.jpg')).toEqual({ cols: 12, rows: 8 });
    expect(parseGridFromName('crypt_25X40.webp')).toEqual({ cols: 25, rows: 40 });
    expect(parseGridFromName('ПОДВАЛ 10Х12.png')).toEqual({ cols: 10, rows: 12 });
  });

  it('ignores pixel sizes and values above 300', () => {
    expect(parseGridFromName('map 4350x3300.png')).toBeNull();
    expect(parseGridFromName('map 301x20.png')).toBeNull();
    expect(parseGridFromName('map 4350x3300 29x22.png')).toEqual({ cols: 29, rows: 22 });
    expect(parseGridFromName('forest.png')).toBeNull();
  });

  it('strips the extension', () => {
    expect(baseName('Tavern 30x20.png')).toBe('Tavern 30x20');
    expect(baseName('noext')).toBe('noext');
  });
});

describe('image metadata', () => {
  it('reads PNG size and pHYs', () => {
    const info = readImageInfo(png(4350, 3300, 150));
    expect(info.format).toBe('png');
    expect(info.width).toBe(4350);
    expect(info.height).toBe(3300);
    expect(info.dpi[0].tag).toBe('pHYs');
    expect(info.dpi[0].dpi).toBeCloseTo(150, 1);
  });

  it('ignores pHYs without a unit', () => {
    expect(readImageInfo(png(100, 100, 150, 0)).dpi).toEqual([]);
  });

  it('reads JPEG JFIF density and EXIF XResolution', () => {
    const info = readImageInfo(jpeg(4000, 3000, { jfif: 72, exif: 200 }));
    expect(info.format).toBe('jpeg');
    expect(info.width).toBe(4000);
    expect(info.height).toBe(3000);
    expect(info.dpi).toEqual([
      { dpi: 72, tag: 'JFIF' },
      { dpi: 200, tag: 'EXIF' },
    ]);
  });

  it('swaps JPEG sides for rotated EXIF orientation', () => {
    const info = readImageInfo(jpeg(4000, 3000, { exif: 100, orientation: 6 }));
    expect(info.width).toBe(3000);
    expect(info.height).toBe(4000);
  });

  it('reads WebP VP8X size and EXIF', () => {
    const info = readImageInfo(webp(2000, 1500, 100));
    expect(info.format).toBe('webp');
    expect(info.width).toBe(2000);
    expect(info.height).toBe(1500);
    expect(info.dpi).toEqual([{ dpi: 100, tag: 'EXIF' }]);
  });

  it('returns unknown for other data', () => {
    expect(readImageInfo(new Uint8Array([1, 2, 3])).format).toBe('unknown');
  });
});

describe('grid detection cascade', () => {
  const noMeta: ImageInfo = { format: 'png', dpi: [] };

  it('uses the file name first and warns on mismatched rows', () => {
    const d = detectMapGrid('Tavern 30x20.png', noMeta, 3000, 2000);
    expect(d.grid).toEqual({ dpi: 100, offset: { x: 0, y: 0 }, source: 'filename' });
    expect(d.needsCheck).toBe(false);

    const bad = detectMapGrid('Tavern 30x20.png', noMeta, 3000, 2400);
    expect(bad.aspectMismatch).toBe(true);
    expect(bad.needsCheck).toBe(true);
  });

  it('accepts Dungeon Alchemist style metadata: 29 × 22 at 150 DPI', () => {
    const info = readImageInfo(png(4350, 3300, 150));
    const d = detectMapGrid('dungeon.png', info, 4350, 3300);
    expect(d.grid.source).toBe('metadata');
    expect(d.grid.dpi).toBe(150);
    expect(d.cols).toBe(29);
    expect(d.rows).toBe(22);
    expect(d.needsCheck).toBe(false);
  });

  it('rejects metadata the sides do not divide by', () => {
    expect(dividesEvenly(4350, 3300, 72)).toBe(false);
    const info = readImageInfo(png(4350, 3300, 72));
    expect(fromMetadata(info, 4350, 3300)).toBeNull();
    expect(detectMapGrid('x.png', info, 4350, 3300).grid.source).toBe('fallback');
  });

  it('flags 72 and 96 DPI for checking', () => {
    const info = readImageInfo(png(720, 1440, 72));
    const d = detectMapGrid('x.png', info, 720, 1440);
    expect(d.grid.source).toBe('metadata');
    expect(d.needsCheck).toBe(true);
  });

  it('prefers a real JPEG value over a 72 DPI default', () => {
    const info = readImageInfo(jpeg(4000, 3000, { jfif: 72, exif: 200 }));
    expect(detectMapGrid('x.jpg', info, 4000, 3000).grid.dpi).toBe(200);
  });

  it('falls back to 150 DPI', () => {
    const d = detectMapGrid('x.png', noMeta, 1000, 1000);
    expect(d.grid).toEqual({ dpi: 150, offset: { x: 0, y: 0 }, source: 'fallback' });
    expect(d.needsCheck).toBe(true);
  });

  it('applies importer size overrides', () => {
    expect(detectGrid('map', 'x.png', noMeta, 3500, 2000, { mode: 'cols', value: 35 }).grid.dpi).toBe(100);
    expect(detectGrid('map', 'x.png', noMeta, 3500, 2000, { mode: 'rows', value: 20 }).grid.dpi).toBe(100);
    expect(detectGrid('map', 'x.png', noMeta, 3500, 2000, { mode: 'dpi', value: 140.5 }).grid.dpi).toBe(
      140.5,
    );
  });

  it('sizes tokens to one cell by the larger side', () => {
    const d = detectGrid('character', 'goblin.png', noMeta, 300, 200);
    expect(d.grid.dpi).toBe(300);
    expect(d.grid.offset).toEqual({ x: 150, y: 100 });
  });

  it('sizes props from the file name', () => {
    const d = detectGrid('prop', 'table 2x1.png', noMeta, 400, 200);
    expect(d.grid.dpi).toBe(200);
    expect(d.grid.offset).toEqual({ x: 200, y: 100 });
  });
});

describe('alignment of Dungeon Alchemist maps', () => {
  // A 40 × 40 map exported at 100, 150 and 200 DPI must line up with the scene grid in the far
  // corner within a screen pixel at 100 % zoom (1 world unit = 1 CSS px).
  for (const dpi of [100, 150, 200]) {
    it(`${dpi} DPI`, () => {
      const size = 40 * dpi;
      const info = readImageInfo(png(size, size, dpi));
      const d = detectMapGrid('export.png', info, size, size);
      const item: Pick<ImageItem, 'grid' | 'position' | 'rotation' | 'scale'> = {
        grid: d.grid,
        position: { x: 3 * CELL, y: -2 * CELL },
        rotation: 0,
        scale: { x: 1, y: 1 },
      };
      const far = imagePointToWorld({ x: size, y: size }, item);
      expect(Math.abs(far.x - (3 + 40) * CELL)).toBeLessThan(1);
      expect(Math.abs(far.y - (-2 + 40) * CELL)).toBeLessThan(1);
    });
  }

  it('35 columns and an offset align a map with a known grid', () => {
    // 35 columns of 98 px with a 40 px border on the left and 12 px on top.
    const width = 40 + 35 * 98;
    const d = detectGrid('map', 'x.png', { format: 'png', dpi: [] }, width, 2000, {
      mode: 'cols',
      value: 35,
    });
    expect(d.grid.dpi).toBeCloseTo(width / 35);
    const grid = { dpi: 98, offset: { x: 40, y: 12 }, source: 'manual' as const };
    const item = { grid, position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } };
    const corner = imagePointToWorld({ x: 40 + 35 * 98, y: 12 + 20 * 98 }, item);
    expect(corner.x).toBeCloseTo(35 * CELL, 6);
    expect(corner.y).toBeCloseTo(20 * CELL, 6);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectMapGrid } from './detect';
import { readImageInfo } from './metadata';

// Real exports live in fixtures/ and stay out of git; the tests skip when a file is missing.
const DA_JPEG = 'fixtures/ravnina.jpg'; // Dungeon Alchemist, 48 × 48 cells at 150 DPI

describe('real Dungeon Alchemist export', () => {
  it.skipIf(!existsSync(DA_JPEG))('JPEG carries 150 DPI in JFIF and EXIF', () => {
    const info = readImageInfo(new Uint8Array(readFileSync(DA_JPEG)));
    expect(info).toMatchObject({ format: 'jpeg', width: 7200, height: 7200 });
    expect(info.dpi).toEqual([
      { dpi: 150, tag: 'JFIF' },
      { dpi: 150, tag: 'EXIF' },
    ]);
    const d = detectMapGrid('Равнина.jpg', info, 7200, 7200);
    expect(d.grid).toEqual({ dpi: 150, offset: { x: 0, y: 0 }, source: 'metadata' });
    expect([d.cols, d.rows, d.needsCheck]).toEqual([48, 48, false]);
  });
});

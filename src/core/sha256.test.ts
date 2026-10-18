import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256HexSync } from './sha256';

describe('sha256', () => {
  it('matches node crypto for several lengths', () => {
    for (const len of [0, 1, 55, 56, 63, 64, 65, 1000, 100_003]) {
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = (i * 31 + 7) & 255;
      const expected = createHash('sha256').update(data).digest('hex');
      expect(sha256HexSync(data)).toBe(expected);
    }
  });

  it('uses WebCrypto when available', async () => {
    const data = new TextEncoder().encode('abc');
    expect(await sha256Hex(data.buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

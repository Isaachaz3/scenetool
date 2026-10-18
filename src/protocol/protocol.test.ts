import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FOG, DEFAULT_GRID } from '../core/constants';
import type { Asset, DiscToken, ImageItem, Scene } from '../core/types';
import { AssetAssembler, chunkCount, chunks, decodeFrame, encodeFrame } from './binary';
import { gmMessage, parseGmMessage, parsePlayerMessage, playerMessage, PROTOCOL_VERSION } from './messages';
import { applyDiff, diffProjection, projectScene } from './projection';

const asset: Asset = {
  id: 'a1',
  type: 'map',
  name: 'Map',
  collectionId: 'c',
  blobId: 'b',
  thumbId: 't',
  hash: 'h1',
  mime: 'image/png',
  size: 10,
  width: 1500,
  height: 1500,
  grid: { dpi: 150, offset: { x: 0, y: 0 }, source: 'fallback' },
  defaults: { visible: true, locked: true, rotation: 0 },
  createdAt: 0,
  updatedAt: 0,
};

const map: ImageItem = {
  id: 'm',
  kind: 'image',
  layer: 'map',
  z: 0,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  visible: true,
  locked: true,
  assetId: 'a1',
  grid: asset.grid,
};

const token: DiscToken = {
  id: 't',
  kind: 'disc',
  layer: 'character',
  z: 0,
  position: { x: 75, y: 75 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  visible: true,
  locked: false,
  color: '#facc15',
  text: '1',
  sizeCells: 1,
};

const scene: Scene = {
  id: 's',
  name: 'S',
  collectionId: 'c',
  order: 0,
  grid: DEFAULT_GRID,
  fog: DEFAULT_FOG,
  items: { m: map, t: token },
  gmViewport: { x: 0, y: 0, zoom: 1 },
  playerViewport: { x: 0, y: 0, zoom: 1 },
  updatedAt: 0,
};

describe('projection', () => {
  it('drops hidden items and keeps asset refs of visible images', () => {
    const hidden = produce(scene, (d) => {
      d.items.t.visible = false;
    });
    const p = projectScene(hidden, { a1: asset });
    expect(Object.keys(p.items)).toEqual(['m']);
    expect(p.assets.a1.hash).toBe('h1');
    expect(JSON.stringify(p)).not.toContain('"t"');
  });

  it('drops images whose asset is unknown', () => {
    expect(Object.keys(projectScene(scene, {}).items)).toEqual(['t']);
  });

  it('turns hiding into remove and moving into upsert', () => {
    const assets = { a1: asset };
    const p0 = projectScene(scene, assets);
    expect(diffProjection(p0, projectScene(scene, assets))).toBeNull();

    const moved = produce(scene, (d) => {
      d.items.t.position = { x: 225, y: 75 };
    });
    const p1 = projectScene(moved, assets);
    const d1 = diffProjection(p0, p1)!;
    expect(d1.upsert.map((i) => i.id)).toEqual(['t']);
    expect(d1.remove).toEqual([]);

    const hidden = produce(moved, (d) => {
      d.items.t.visible = false;
    });
    const p2 = projectScene(hidden, assets);
    const d2 = diffProjection(p1, p2)!;
    expect(d2.upsert).toEqual([]);
    expect(d2.remove).toEqual(['t']);

    expect(applyDiff(applyDiff(p0, d1), d2)).toEqual(p2);
  });

  it('reports grid changes and new assets', () => {
    const empty = produce(scene, (d) => {
      d.items = {};
    });
    const p0 = projectScene(empty, { a1: asset });
    const p1 = projectScene(
      produce(scene, (d) => {
        d.grid.opacity = 1;
      }),
      { a1: asset },
    );
    const diff = diffProjection(p0, p1)!;
    expect(diff.grid?.opacity).toBe(1);
    expect(diff.assets?.a1.hash).toBe('h1');
  });
});

describe('messages', () => {
  it('round-trips and validates', () => {
    const msg = gmMessage({ type: 'view:set', x: 1, y: 2, zoom: 1.5, duration: 400 });
    expect(msg.v).toBe(PROTOCOL_VERSION);
    expect(parseGmMessage(JSON.stringify(msg))).toEqual(msg);
    expect(parseGmMessage(JSON.stringify({ ...msg, v: 99 }))).toBeNull();
    expect(parseGmMessage('{"type":"hello","v":1}')).toBeNull();
    expect(parseGmMessage('not json')).toBeNull();
    expect(parseGmMessage(42)).toBeNull();

    const hello = playerMessage({ type: 'hello', cached: ['h1'] });
    expect(parsePlayerMessage(JSON.stringify(hello))).toEqual(hello);
    expect(parsePlayerMessage(JSON.stringify(msg))).toBeNull();
  });
});

describe('binary frames', () => {
  it('encodes and decodes a frame', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const frame = encodeFrame({ hash: 'abc', index: 2, total: 3 }, data);
    const view = new DataView(frame);
    const headerLength = view.getUint32(0);
    expect(new TextDecoder().decode(new Uint8Array(frame, 4, headerLength))).toBe(
      '{"hash":"abc","index":2,"total":3}',
    );
    const decoded = decodeFrame(frame)!;
    expect(decoded.header).toEqual({ hash: 'abc', index: 2, total: 3 });
    expect([...decoded.data]).toEqual([1, 2, 3, 4, 5]);
    expect(decodeFrame(new ArrayBuffer(2))).toBeNull();
  });

  it('splits into chunks of at most 1 MB and reassembles', async () => {
    const size = 2.5 * 1024 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < size; i++) src[i] = i % 251;
    const total = chunkCount(size);
    expect(total).toBe(3);

    const asm = new AssetAssembler();
    asm.begin('h', size, 'image/png', total);
    const parts = [...chunks(src.buffer)];
    expect(parts.map((p) => p.byteLength)).toEqual([1048576, 1048576, 524288]);
    // Deliver out of order through encoded frames.
    for (const i of [2, 0, 1]) {
      const f = decodeFrame(encodeFrame({ hash: 'h', index: i, total }, parts[i]))!;
      asm.chunk(f.header, f.data);
    }
    const blob = asm.end('h')!;
    expect(blob.type).toBe('image/png');
    const back = new Uint8Array(await blob.arrayBuffer());
    expect(back.length).toBe(size);
    expect(back[size - 1]).toBe(src[size - 1]);
    expect(back[1048576]).toBe(src[1048576]);
  });

  it('rejects incomplete assets', () => {
    const asm = new AssetAssembler();
    asm.begin('h', 10, 'image/png', 2);
    asm.chunk({ hash: 'h', index: 0, total: 2 }, new Uint8Array(5));
    expect(asm.end('h')).toBeNull();
  });
});

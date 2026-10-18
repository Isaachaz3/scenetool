import { describe, expect, it } from 'vitest';
import { blobPath, countConflicts, planImport, type LibraryData } from './backup';
import { DEFAULT_FOG, DEFAULT_GRID } from './constants';
import type { Asset, ImageItem, Scene } from './types';

const asset = (id: string, hash: string, name = id): Asset => ({
  id,
  type: 'map',
  name,
  collectionId: 'c1',
  blobId: `b-${id}`,
  thumbId: `t-${id}`,
  hash,
  mime: 'image/png',
  size: 1,
  width: 10,
  height: 10,
  grid: { dpi: 150, offset: { x: 0, y: 0 }, source: 'fallback' },
  defaults: { visible: true, locked: true, rotation: 0 },
  createdAt: 0,
  updatedAt: 0,
});

const image = (id: string, assetId: string): ImageItem => ({
  id,
  kind: 'image',
  layer: 'map',
  z: 0,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  visible: true,
  locked: true,
  assetId,
  grid: { dpi: 150, offset: { x: 0, y: 0 }, source: 'fallback' },
});

const scene = (id: string, items: ImageItem[], name = id): Scene => ({
  id,
  name,
  collectionId: 'c1',
  order: 0,
  grid: DEFAULT_GRID,
  fog: DEFAULT_FOG,
  items: Object.fromEntries(items.map((it) => [it.id, it])),
  gmViewport: { x: 0, y: 0, zoom: 1 },
  playerViewport: { x: 0, y: 0, zoom: 1 },
  updatedAt: 1,
});

const lib = (assets: Asset[], scenes: Scene[]): LibraryData => ({
  collections: [{ id: 'c1', name: 'Default', order: 0, createdAt: 0 }],
  assets,
  scenes,
});

let n = 0;
const newId = () => `new${++n}`;

describe('backup import plan', () => {
  it('restores everything into an empty library', () => {
    const backup = lib([asset('a1', 'h1')], [scene('s1', [image('i1', 'a1')])]);
    const empty: LibraryData = { collections: [], assets: [], scenes: [] };
    const plan = planImport(empty, backup, 'replace', newId, ' (импорт)');
    expect(plan.collections.map((c) => c.id)).toEqual(['c1']);
    expect(plan.assets.map((a) => a.id)).toEqual(['a1']);
    expect(plan.scenes[0].items.i1).toMatchObject({ assetId: 'a1' });
    expect(countConflicts(empty, backup)).toBe(0);
  });

  it('reuses a file already in the library under its existing id', () => {
    const existing = lib([asset('x9', 'h1')], []);
    const backup = lib([asset('a1', 'h1')], [scene('s1', [image('i1', 'a1')])]);
    const plan = planImport(existing, backup, 'replace', newId, ' (импорт)');
    expect(plan.assets).toEqual([]);
    expect(plan.skipped.assets).toBe(1);
    expect((plan.scenes[0].items.i1 as ImageItem).assetId).toBe('x9');
  });

  it('skips identical scenes and counts real conflicts', () => {
    const s = scene('s1', [image('i1', 'a1')]);
    const existing = lib([asset('a1', 'h1')], [s]);
    expect(
      planImport(existing, lib([asset('a1', 'h1')], [{ ...s, updatedAt: 99 }]), 'replace', newId, '').skipped
        .scenes,
    ).toBe(1);
    const changed = lib([asset('a1', 'h2')], [scene('s1', [image('i1', 'a1')], 'renamed')]);
    expect(countConflicts(existing, changed)).toBe(2);
  });

  it('replaces on conflict', () => {
    const existing = lib([asset('a1', 'h1')], [scene('s1', [], 'old')]);
    const backup = lib([asset('a1', 'h2')], [scene('s1', [image('i1', 'a1')], 'new')]);
    const plan = planImport(existing, backup, 'replace', newId, ' (импорт)');
    expect(plan.assets.map((a) => [a.id, a.hash])).toEqual([['a1', 'h2']]);
    expect(plan.scenes.map((x) => [x.id, x.name])).toEqual([['s1', 'new']]);
    expect(plan.replacedScenes).toEqual(['s1']);
  });

  it('keeps both versions under new ids', () => {
    const existing = lib([asset('a1', 'h1')], [scene('s1', [], 'old')]);
    const backup = lib([asset('a1', 'h2')], [scene('s1', [image('i1', 'a1')], 'new')]);
    const plan = planImport(existing, backup, 'keep-both', newId, ' (импорт)');
    const copy = plan.assets[0];
    expect(copy.id).not.toBe('a1');
    expect(copy.blobId).not.toBe('b-a1');
    expect(plan.scenes[0].id).not.toBe('s1');
    expect(plan.scenes[0].name).toBe('new (импорт)');
    expect((plan.scenes[0].items.i1 as ImageItem).assetId).toBe(copy.id);
    expect(plan.replacedScenes).toEqual([]);
  });

  it('drops images whose file is missing and fixes unknown collections', () => {
    const backup: LibraryData = {
      collections: [],
      assets: [],
      scenes: [{ ...scene('s1', [image('i1', 'gone')]), collectionId: 'nowhere' }],
    };
    const plan = planImport(lib([], []), backup, 'replace', newId, '');
    expect(plan.scenes[0].items).toEqual({});
    expect(plan.scenes[0].collectionId).toBe('c1');
  });

  it('merges collections with the same name', () => {
    const backup: LibraryData = {
      collections: [
        { id: 'other-default', name: 'Default', order: 0, createdAt: 0 },
        { id: 'dungeons', name: 'Подземелья', order: 1, createdAt: 0 },
      ],
      assets: [{ ...asset('a1', 'h1'), collectionId: 'other-default' }],
      scenes: [{ ...scene('s1', []), collectionId: 'dungeons' }],
    };
    const plan = planImport(lib([], []), backup, 'replace', newId, '');
    expect(plan.collections.map((c) => c.id)).toEqual(['dungeons']);
    expect(plan.assets[0].collectionId).toBe('c1');
    expect(plan.scenes[0].collectionId).toBe('dungeons');
  });

  it('names blob files by hash and type', () => {
    expect(blobPath('abc', 'image/jpeg')).toBe('blobs/abc.jpg');
    expect(blobPath('abc', 'application/x')).toBe('blobs/abc.bin');
  });
});

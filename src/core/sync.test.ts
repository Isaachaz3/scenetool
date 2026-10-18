import { describe, expect, it } from 'vitest';
import type { Collection, Scene } from './types';
import {
  decidePull,
  docKey,
  filePath,
  mergeCollections,
  nextCursor,
  pendingPush,
  strayScenes,
  thumbPath,
  type RemoteDoc,
} from './sync';

const row = (over: Partial<RemoteDoc>): RemoteDoc => ({
  kind: 'scene',
  id: 's1',
  data: {},
  updated_at: 100,
  deleted: false,
  synced_at: '2026-10-18T10:00:00.000Z',
  ...over,
});

describe('cloud sync decisions', () => {
  it('pushes documents whose version differs from the last pushed one', () => {
    const local = [
      { kind: 'scene' as const, id: 'a', version: 5 },
      { kind: 'scene' as const, id: 'b', version: 7 },
      { kind: 'asset' as const, id: 'a', version: 1 },
    ];
    const pushed = { [docKey('scene', 'a')]: 5, [docKey('scene', 'b')]: 6 };
    expect(pendingPush(local, pushed).map((d) => `${d.kind}:${d.id}`)).toEqual(['scene:b', 'asset:a']);
  });

  it('applies newer or unknown remote documents and keeps newer local ones', () => {
    expect(decidePull(row({ updated_at: 100 }), undefined)).toBe('apply');
    expect(decidePull(row({ updated_at: 100 }), 90)).toBe('apply');
    expect(decidePull(row({ updated_at: 100 }), 100)).toBe('skip');
    expect(decidePull(row({ updated_at: 100 }), 120)).toBe('skip');
  });

  it('deletes local copies of remote tombstones', () => {
    expect(decidePull(row({ deleted: true }), 50)).toBe('delete');
    expect(decidePull(row({ deleted: true }), undefined)).toBe('skip');
  });

  it('moves the cursor to the latest server time', () => {
    const rows = [
      row({ synced_at: '2026-10-18T10:00:01.000Z' }),
      row({ synced_at: '2026-10-18T10:00:03.000Z' }),
      row({ synced_at: '2026-10-18T10:00:02.000Z' }),
    ];
    expect(nextCursor(rows, null)).toBe('2026-10-18T10:00:03.000Z');
    expect(nextCursor([], '2026-10-18T09:00:00.000Z')).toBe('2026-10-18T09:00:00.000Z');
  });

  it('keeps every file under the user folder', () => {
    expect(filePath('u1', 'abc')).toBe('u1/files/abc');
    expect(thumbPath('u1', 't1')).toBe('u1/thumbs/t1');
  });

  it('merges never-pushed local collections into same-named cloud ones', () => {
    const col = (id: string, name: string): Collection => ({ id, name, order: 0, createdAt: 1 });
    const local = [col('l1', 'Default'), col('l2', 'Maps'), col('l3', 'Default'), col('r1', 'Default')];
    const remote = [col('r1', 'Default'), col('r2', 'Tokens')];
    const merge = mergeCollections(local, remote, {
      [docKey('collection', 'l3')]: 1,
      [docKey('collection', 'r1')]: 1,
    });
    expect([...merge]).toEqual([['l1', 'r1']]);
  });

  it('finds empty scenes that never reached the cloud', () => {
    const scene = (id: string, items: number) =>
      ({
        id,
        items: Object.fromEntries(Array.from({ length: items }, (_, i) => [`i${i}`, {}])),
      }) as unknown as Scene;
    const pushed = { [docKey('scene', 'b')]: 1 };
    expect(strayScenes([scene('a', 0), scene('b', 0), scene('c', 2)], pushed)).toEqual(['a']);
  });
});

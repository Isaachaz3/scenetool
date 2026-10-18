import { enablePatches, produceWithPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { History } from './history';

enablePatches();

type S = { items: Record<string, { x: number }>; view: number };

function change(h: History, s: S, fn: (d: S) => void, key?: string, now?: number): S {
  const [next, patches, inverse] = produceWithPatches(s, fn);
  h.push(patches, inverse, key, now);
  return next;
}

describe('history', () => {
  it('undoes and redoes', () => {
    const h = new History();
    let s: S = { items: { a: { x: 0 } }, view: 0 };
    s = change(h, s, (d) => {
      d.items.a.x = 1;
    });
    s = change(h, s, (d) => {
      d.items.b = { x: 5 };
    });
    s = h.undo(s)!;
    expect(s.items.b).toBeUndefined();
    s = h.undo(s)!;
    expect(s.items.a.x).toBe(0);
    expect(h.undo(s)).toBeNull();
    s = h.redo(s)!;
    s = h.redo(s)!;
    expect(s.items).toEqual({ a: { x: 1 }, b: { x: 5 } });
  });

  it('leaves untracked fields alone', () => {
    const h = new History();
    let s: S = { items: { a: { x: 0 } }, view: 0 };
    s = change(h, s, (d) => {
      d.items.a.x = 1;
    });
    s = { ...s, view: 42 }; // camera moves are not part of history
    s = h.undo(s)!;
    expect(s).toEqual({ items: { a: { x: 0 } }, view: 42 });
  });

  it('merges entries with the same key', () => {
    const h = new History();
    let s: S = { items: { a: { x: 0 } }, view: 0 };
    s = change(h, s, (d) => void (d.items.a.x = 1), 'k', 0);
    s = change(h, s, (d) => void (d.items.a.x = 2), 'k', 500);
    expect(h.size).toBe(1);
    s = h.undo(s)!;
    expect(s.items.a.x).toBe(0);
  });

  it('keeps at most the limit', () => {
    const h = new History(3);
    let s: S = { items: { a: { x: 0 } }, view: 0 };
    for (let i = 1; i <= 5; i++) s = change(h, s, (d) => void (d.items.a.x = i));
    expect(h.size).toBe(3);
    while (h.canUndo) s = h.undo(s)!;
    expect(s.items.a.x).toBe(2);
  });

  it('drops redo after a new change', () => {
    const h = new History();
    let s: S = { items: { a: { x: 0 } }, view: 0 };
    s = change(h, s, (d) => void (d.items.a.x = 1));
    s = h.undo(s)!;
    expect(h.canRedo).toBe(true);
    change(h, s, (d) => void (d.items.a.x = 3));
    expect(h.canRedo).toBe(false);
  });
});

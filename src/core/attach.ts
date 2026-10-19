// Mounts and attachments: a character dropped on a mount rides it, an attachment dropped on a
// character follows it. Children keep their offset and move with the parent.
import { CELL, layerRank } from './constants';
import { imageBounds, type Rect } from './geometry';
import type { Id, Item, Size, Vec2 } from './types';

export type SizeOf = (item: Item) => Size | undefined;

/** Which layer can carry which: mounts carry characters, characters carry attachments. */
export function canCarry(parent: Item, child: Item): boolean {
  return (
    (parent.layer === 'mount' && child.layer === 'character') ||
    (parent.layer === 'character' && child.layer === 'attachment')
  );
}

/** World box of a token or picture; null for items that cannot carry anything. */
export function itemRect(item: Item, sizeOf: SizeOf, position = item.position): Rect | null {
  if (item.kind === 'disc') {
    const r = (item.sizeCells * CELL) / 2;
    return { x: position.x - r, y: position.y - r, width: 2 * r, height: 2 * r };
  }
  if (item.kind === 'image') {
    const size = sizeOf(item);
    return size ? imageBounds({ ...item, position }, size.width, size.height) : null;
  }
  return null;
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Every item attached to one of `ids`, directly or through other children. */
export function descendants(ids: Id[], items: Record<Id, Item>): Id[] {
  const out: Id[] = [];
  const seen = new Set(ids);
  let frontier = ids;
  while (frontier.length) {
    const next: Id[] = [];
    for (const it of Object.values(items)) {
      if (it.attachedTo && frontier.includes(it.attachedTo) && !seen.has(it.id)) {
        seen.add(it.id);
        out.push(it.id);
        next.push(it.id);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * The item a dropped `child` lands on: the topmost one that can carry it and contains the
 * child's center, leaving out the child's own descendants.
 */
export function findCarrier(child: Item, at: Vec2, items: Record<Id, Item>, sizeOf: SizeOf): Item | null {
  const box = itemRect(child, sizeOf, at);
  if (!box) return null;
  const c = rectCenter(box);
  const exclude = new Set([child.id, ...descendants([child.id], items)]);
  let best: Item | null = null;
  for (const it of Object.values(items)) {
    if (exclude.has(it.id) || !canCarry(it, child)) continue;
    const r = itemRect(it, sizeOf);
    if (!r || c.x < r.x || c.x > r.x + r.width || c.y < r.y || c.y > r.y + r.height) continue;
    if (!best || layerRank(it.layer) > layerRank(best.layer) || (it.layer === best.layer && it.z > best.z))
      best = it;
  }
  return best;
}

/** Menu "Прикрепить": the selected item on the lowest layer carries the others. */
export function pickParent(selected: Item[]): Item | null {
  const candidates = selected.filter((it) => it.kind === 'image' || it.kind === 'disc');
  if (candidates.length < 2) return null;
  return candidates.reduce((a, b) => (layerRank(b.layer) < layerRank(a.layer) ? b : a));
}

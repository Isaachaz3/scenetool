import { describe, expect, it } from 'vitest';
import { canCarry, descendants, findCarrier, pickParent } from './attach';
import type { DiscToken, Item } from './types';

const disc = (
  id: string,
  layer: Item['layer'],
  x: number,
  y: number,
  sizeCells = 1,
  extra: Partial<DiscToken> = {},
): DiscToken => ({
  id,
  kind: 'disc',
  layer,
  z: 0,
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  visible: true,
  locked: false,
  color: '#f00',
  text: '',
  sizeCells,
  ...extra,
});
const noSize = () => undefined;

describe('mounts and attachments', () => {
  const cart = disc('cart', 'mount', 0, 0, 3);
  const hero = disc('hero', 'character', 500, 0);
  const poisoned = disc('poison', 'attachment', 900, 0, 0.5, { attachedTo: 'hero' });
  const items: Record<string, Item> = { cart, hero, poison: poisoned };

  it('lets mounts carry characters and characters carry attachments', () => {
    expect(canCarry(cart, hero)).toBe(true);
    expect(canCarry(hero, poisoned)).toBe(true);
    expect(canCarry(hero, cart)).toBe(false);
    expect(canCarry(cart, poisoned)).toBe(false);
  });

  it('finds the carrier under the dropped center', () => {
    expect(findCarrier(hero, { x: 100, y: 50 }, items, noSize)?.id).toBe('cart');
    expect(findCarrier(hero, { x: 400, y: 0 }, items, noSize)).toBeNull();
    expect(findCarrier(poisoned, { x: 510, y: 10 }, items, noSize)?.id).toBe('hero');
  });

  it('collects children through several levels', () => {
    const riding = { ...items, hero: { ...hero, attachedTo: 'cart' } };
    expect(descendants(['cart'], riding).sort()).toEqual(['hero', 'poison']);
    expect(descendants(['hero'], riding)).toEqual(['poison']);
  });

  it('never lands an item on its own child', () => {
    const riding = { ...items, hero: { ...hero, attachedTo: 'cart' } };
    // A cart cannot be carried, but even a character dropped on its attachment stays free.
    expect(findCarrier(riding.hero, { x: 900, y: 0 }, riding, noSize)).toBeNull();
  });

  it('picks the lowest layer as the parent for the menu', () => {
    expect(pickParent([hero, cart, poisoned])?.id).toBe('cart');
    expect(pickParent([hero])).toBeNull();
  });
});

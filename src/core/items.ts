import { layerRank } from './constants';
import type { Item } from './types';

/** Items sorted bottom to top: by layer, then by z within the layer. */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => layerRank(a.layer) - layerRank(b.layer) || a.z - b.z);
}

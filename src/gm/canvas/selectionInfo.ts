import { ITEM_LAYERS } from '../../core/constants';
import { tokenSizeCells } from '../../core/geometry';
import type { Item, Layer } from '../../core/types';
import { imageSizeOf } from '../../state/items';

export const TOKEN_SIZES = [0.5, 1, 2, 3, 4];
export const PICKABLE_LAYERS: Layer[] = ITEM_LAYERS.filter((l) => l !== 'fog' && l !== 'ruler');

/** What the plaque and the context menu can offer for the current selection. */
export function selectionInfo(selected: Item[]) {
  const ids = selected.map((it) => it.id);
  const tokens = selected.filter((it) => it.kind === 'disc' || (it.kind === 'image' && it.layer !== 'map'));
  const token = tokens.length === 1 ? tokens[0] : null;
  const size =
    token && (token.kind === 'disc' || token.kind === 'image')
      ? Math.round(tokenSizeCells(token, imageSizeOf(token)) * 100) / 100
      : null;
  const single = selected.length === 1 ? selected[0] : null;
  return {
    ids,
    tokenIds: tokens.map((it) => it.id),
    fogOnly: selected.length > 0 && selected.every((it) => it.kind === 'fog'),
    allHidden: selected.length > 0 && selected.every((it) => !it.visible),
    allLocked: selected.length > 0 && selected.every((it) => it.locked),
    allCut: selected.length > 0 && selected.every((it) => it.kind === 'fog' && it.cut),
    size,
    label: token && (token.kind === 'image' || token.kind === 'disc') ? (token.label ?? '') : '',
    layer: new Set(selected.map((it) => it.layer)).size === 1 ? selected[0].layer : '',
    alignable: single?.kind === 'image' ? single : null,
  };
}

export const formatSize = (n: number) => String(n).replace('.', ',');

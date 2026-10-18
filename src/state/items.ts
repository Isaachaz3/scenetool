import { nanoid } from 'nanoid';
import { CELL, DEFAULT_TEXT_STYLE, layerForAssetType } from '../core/constants';
import { sortItems } from '../core/items';
import { add, imageScale, rotate, snapItemPosition, sub } from '../core/geometry';
import type {
  Asset,
  DiscToken,
  Id,
  ImageItem,
  Item,
  Layer,
  Scene,
  TextItem,
  TextStyle,
  Vec2,
} from '../core/types';
import { activeScene, changeScene, getGm, setGm, useGm } from './store';

export function imageSizeOf(item: Item, assets = getGm().assets) {
  if (item.kind !== 'image') return undefined;
  const a = assets[item.assetId];
  return a ? { width: a.width, height: a.height } : undefined;
}

/** Snaps an item's anchor to the scene grid when snapping is on. */
export function snapFor(item: Item, p: Vec2, scene: Scene | null = activeScene(), disable = false): Vec2 {
  if (!scene || !scene.grid.snapping || disable) return p;
  return snapItemPosition(item, p, imageSizeOf(item));
}

function nextZ(scene: Scene, layer: Layer): number {
  let z = -1;
  for (const it of Object.values(scene.items)) if (it.layer === layer && it.z > z) z = it.z;
  return z + 1;
}

export function newImageItem(asset: Asset, scene: Scene): ImageItem {
  const layer = layerForAssetType(asset.type);
  return {
    id: nanoid(),
    kind: 'image',
    layer,
    z: nextZ(scene, layer),
    position: { x: 0, y: 0 },
    rotation: asset.defaults.rotation,
    scale: { x: 1, y: 1 },
    visible: asset.defaults.visible,
    locked: asset.defaults.locked,
    name: asset.name,
    assetId: asset.id,
    grid: { ...asset.grid, offset: { ...asset.grid.offset } },
    ...(asset.defaults.label ? { label: asset.defaults.label } : {}),
  };
}

/** Anchor position that puts the center of the image at `center`. */
export function anchorForCenter(item: ImageItem, asset: Asset, center: Vec2): Vec2 {
  const s = imageScale(item.grid, item.scale);
  const local = {
    x: (item.grid.offset.x - asset.width / 2) * s.x,
    y: (item.grid.offset.y - asset.height / 2) * s.y,
  };
  return add(center, rotate(local, item.rotation));
}

/** Adds an asset to the active scene centered at `world`. */
export function placeAsset(asset: Asset, world: Vec2): Id | null {
  const scene = activeScene();
  if (!scene) return null;
  const item = newImageItem(asset, scene);
  item.position = snapFor(item, anchorForCenter(item, asset, world), scene);
  changeScene((d) => {
    d.items[item.id] = item;
  });
  if (asset.type === 'map' && !scene.thumbId) {
    changeScene(
      (d) => {
        d.thumbId = asset.thumbId;
      },
      { history: false },
    );
  }
  if (!item.locked) useGm.setState({ selection: [item.id] });
  return item.id;
}

export function addDisc(opts: { color: string; text: string; sizeCells: number }, world: Vec2): Id | null {
  const scene = activeScene();
  if (!scene) return null;
  const disc: DiscToken = {
    id: nanoid(),
    kind: 'disc',
    layer: 'character',
    z: nextZ(scene, 'character'),
    position: world,
    rotation: 0,
    scale: { x: 1, y: 1 },
    visible: true,
    locked: false,
    color: opts.color,
    text: opts.text,
    sizeCells: opts.sizeCells,
  };
  disc.position = snapFor(disc, world, scene);
  changeScene((d) => {
    d.items[disc.id] = disc;
  });
  useGm.setState({ selection: [disc.id] });
  return disc.id;
}

export function addText(text: string, style: TextStyle, world: Vec2): Id | null {
  const scene = activeScene();
  if (!scene || !text.trim()) return null;
  const item: TextItem = {
    id: nanoid(),
    kind: 'text',
    layer: 'text',
    z: nextZ(scene, 'text'),
    position: world,
    rotation: 0,
    scale: { x: 1, y: 1 },
    visible: true,
    locked: false,
    text,
    style: { ...DEFAULT_TEXT_STYLE, ...style },
  };
  changeScene((d) => {
    d.items[item.id] = item;
  });
  return item.id;
}

export function updateItems(ids: Id[], fn: (item: Item) => void, key?: string): void {
  changeScene(
    (d) => {
      for (const id of ids) {
        const it = d.items[id];
        if (it) fn(it as Item);
      }
    },
    { key },
  );
}

export function deleteItems(ids: Id[]): void {
  if (ids.length === 0) return;
  changeScene((d) => {
    for (const id of ids) delete d.items[id];
  });
  useGm.setState((s) => ({ selection: s.selection.filter((id) => !ids.includes(id)) }));
}

export function toggleVisible(ids: Id[]): void {
  const scene = activeScene();
  if (!scene || ids.length === 0) return;
  const anyVisible = ids.some((id) => scene.items[id]?.visible);
  updateItems(ids, (it) => {
    it.visible = !anyVisible;
  });
}

export function toggleLock(ids: Id[]): void {
  const scene = activeScene();
  if (!scene || ids.length === 0) return;
  const anyUnlocked = ids.some((id) => scene.items[id] && !scene.items[id].locked);
  updateItems(ids, (it) => {
    it.locked = anyUnlocked;
  });
}

/** Next free number for numbered discs: 1, 2, 3… */
function nextDiscNumber(scene: Scene, extra: Item[]): number {
  let max = 0;
  for (const it of [...Object.values(scene.items), ...extra]) {
    if (it.kind === 'disc' && /^\d+$/.test(it.text)) max = Math.max(max, Number(it.text));
  }
  return max + 1;
}

/** Copies of `items` with new ids, shifted by `offset`; numbered discs count up. */
export function cloneItems(items: Item[], offset: Vec2, scene: Scene): Item[] {
  const copies: Item[] = [];
  const zByLayer = new Map<Layer, number>();
  for (const src of sortItems(items)) {
    const z = zByLayer.get(src.layer) ?? nextZ(scene, src.layer);
    zByLayer.set(src.layer, z + 1);
    const copy = structuredClone(src) as Item;
    copy.id = nanoid();
    copy.z = z;
    copy.position = add(src.position, offset);
    if (copy.kind === 'disc' && /^\d+$/.test(copy.text)) copy.text = String(nextDiscNumber(scene, copies));
    copies.push(copy);
  }
  return copies;
}

export function duplicateItems(ids: Id[]): void {
  const scene = activeScene();
  if (!scene) return;
  const items = ids.map((id) => scene.items[id]).filter(Boolean);
  if (items.length === 0) return;
  const copies = cloneItems(items, { x: CELL, y: CELL }, scene);
  changeScene((d) => {
    for (const c of copies) d.items[c.id] = c;
  });
  useGm.setState({ selection: copies.map((c) => c.id) });
}

let clipboard: Item[] = [];

export function copyItems(ids: Id[]): void {
  const scene = activeScene();
  if (!scene) return;
  clipboard = ids
    .map((id) => scene.items[id])
    .filter(Boolean)
    .map((it) => structuredClone(it) as Item);
}

/** Pastes the clipboard centered at `world` (or one cell off the originals). */
export function pasteItems(world?: Vec2): void {
  const scene = activeScene();
  if (!scene || clipboard.length === 0) return;
  let offset: Vec2 = { x: CELL, y: CELL };
  if (world) {
    const cx = clipboard.reduce((s, it) => s + it.position.x, 0) / clipboard.length;
    const cy = clipboard.reduce((s, it) => s + it.position.y, 0) / clipboard.length;
    const lead = clipboard[0];
    const target = snapFor(lead, add(lead.position, sub(world, { x: cx, y: cy })), scene);
    offset = sub(target, lead.position);
  }
  const copies = cloneItems(clipboard, offset, scene);
  changeScene((d) => {
    for (const c of copies) d.items[c.id] = c;
  });
  useGm.setState({ selection: copies.map((c) => c.id) });
}

/** Sets a token's size in cells along its larger side and re-snaps it. */
export function setSizeCells(ids: Id[], cells: number): void {
  const { assets } = getGm();
  const scene = activeScene();
  if (!scene) return;
  changeScene((d) => {
    for (const id of ids) {
      const it = d.items[id] as Item | undefined;
      if (!it) continue;
      if (it.kind === 'disc') it.sizeCells = cells;
      else if (it.kind === 'image' && it.layer !== 'map') {
        const a = assets[it.assetId];
        if (!a) continue;
        const k = (cells * it.grid.dpi) / Math.max(a.width, a.height);
        it.scale = { x: k, y: k };
      } else continue;
      if (scene.grid.snapping) it.position = snapItemPosition(it, it.position, imageSizeOf(it, assets));
    }
  });
}

/** Moves items one step up or down within their layer. */
export function moveZ(ids: Id[], dir: 1 | -1): void {
  const scene = activeScene();
  if (!scene) return;
  changeScene((d) => {
    for (const id of ids) {
      const it = d.items[id];
      if (!it) continue;
      const sameLayer = Object.values(d.items)
        .filter((o) => o.layer === it.layer)
        .sort((a, b) => a.z - b.z);
      const i = sameLayer.findIndex((o) => o.id === id);
      const other = sameLayer[i + dir];
      if (!other) continue;
      [it.z, other.z] = [other.z, it.z];
      if (it.z === other.z) it.z += dir;
    }
  });
}

export function setLayer(ids: Id[], layer: Layer): void {
  const scene = activeScene();
  if (!scene) return;
  let z = nextZ(scene, layer);
  updateItems(ids, (it) => {
    if (it.layer === layer) return;
    it.layer = layer;
    it.z = z++;
  });
}

export function setSelection(ids: Id[]): void {
  setGm((d) => {
    d.selection = ids;
  });
}

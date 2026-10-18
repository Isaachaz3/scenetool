import type { Asset, FogSettings, GridSettings, Id, Item, Scene } from '../core/types';

/** What the player window needs to draw an image without access to the library. */
export interface AssetRef {
  hash: string;
  mime: string;
  size: number;
  width: number;
  height: number;
}

/** The scene as players see it: hidden items are not just invisible, they are absent. */
export interface PlayerScene {
  id: Id;
  grid: GridSettings;
  fog: FogSettings;
  items: Record<Id, Item>;
  assets: Record<Id, AssetRef>; // assetId → file, only for items present in `items`
}

export interface SceneDiff {
  upsert: Item[];
  remove: Id[];
  grid?: GridSettings;
  fog?: FogSettings;
  assets?: Record<Id, AssetRef>; // newly referenced assets
}

export function assetRef(a: Asset): AssetRef {
  return { hash: a.hash, mime: a.mime, size: a.size, width: a.width, height: a.height };
}

function isVisibleToPlayers(item: Item, items: Record<Id, Item>): boolean {
  if (!item.visible) return false;
  const parent = item.attachedTo ? items[item.attachedTo] : undefined;
  return parent ? parent.visible : true;
}

/**
 * Player projection of a scene. Item objects are reused by reference so that diffs between
 * projections of Immer states are cheap identity checks.
 */
export function projectScene(scene: Scene, assets: Record<Id, Asset>): PlayerScene {
  const items: Record<Id, Item> = {};
  const refs: Record<Id, AssetRef> = {};
  for (const item of Object.values(scene.items)) {
    if (!isVisibleToPlayers(item, scene.items)) continue;
    if (item.kind === 'image') {
      const asset = assets[item.assetId];
      if (!asset) continue;
      refs[item.assetId] = assetRef(asset);
    }
    items[item.id] = item;
  }
  return { id: scene.id, grid: scene.grid, fog: scene.fog, items, assets: refs };
}

/** Diff between two projections of the same scene; null when nothing changed. */
export function diffProjection(prev: PlayerScene, next: PlayerScene): SceneDiff | null {
  const upsert: Item[] = [];
  const remove: Id[] = [];
  for (const [id, item] of Object.entries(next.items)) {
    if (prev.items[id] !== item) upsert.push(item);
  }
  for (const id of Object.keys(prev.items)) {
    if (!(id in next.items)) remove.push(id);
  }
  const diff: SceneDiff = { upsert, remove };
  let changed = upsert.length > 0 || remove.length > 0;
  if (prev.grid !== next.grid) {
    diff.grid = next.grid;
    changed = true;
  }
  if (prev.fog !== next.fog) {
    diff.fog = next.fog;
    changed = true;
  }
  const added: Record<Id, AssetRef> = {};
  for (const [id, ref] of Object.entries(next.assets)) {
    if (prev.assets[id]?.hash !== ref.hash) added[id] = ref;
  }
  if (Object.keys(added).length > 0) {
    diff.assets = added;
    changed = true;
  }
  return changed ? diff : null;
}

/** Player side: applies a diff to its copy of the scene. */
export function applyDiff(scene: PlayerScene, diff: SceneDiff): PlayerScene {
  const items = { ...scene.items };
  for (const id of diff.remove) delete items[id];
  for (const item of diff.upsert) items[item.id] = item;
  return {
    ...scene,
    items,
    grid: diff.grid ?? scene.grid,
    fog: diff.fog ?? scene.fog,
    assets: diff.assets ? { ...scene.assets, ...diff.assets } : scene.assets,
  };
}

/** Hashes referenced by a projection. */
export function sceneHashes(scene: PlayerScene): string[] {
  return [...new Set(Object.values(scene.assets).map((a) => a.hash))];
}

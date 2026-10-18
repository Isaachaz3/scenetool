import { nanoid } from 'nanoid';
import { DEFAULT_FOG, DEFAULT_GRID } from '../core/constants';
import { imageBounds, rectUnion, type Rect } from '../core/geometry';
import type {
  Asset,
  FogSettings,
  GridSettings,
  Id,
  ImageGrid,
  Item,
  Scene,
  Size,
  Viewport,
} from '../core/types';
import { fitRect } from '../core/viewport';
import { recordDeletion } from '../cloud/remote';
import { db, putSetting } from '../db/db';
import { t } from '../i18n/ru';
import { newImageItem } from './items';
import { forgetSaved } from './persistence';
import { activeScene, changeScene, dropHistory, getGm, refreshHistoryFlags, setGm, useGm } from './store';

export function newScene(name: string, grid?: Partial<GridSettings>): Scene {
  const s = getGm();
  const order = Math.max(-1, ...Object.values(s.scenes).map((x) => x.order)) + 1;
  return {
    id: nanoid(),
    name,
    collectionId: s.collectionId,
    order,
    grid: { ...DEFAULT_GRID, showToPlayers: s.settings.playerDefaults.grid, ...grid },
    fog: { ...DEFAULT_FOG, gmOpacity: s.settings.fogGmOpacity },
    items: {},
    gmViewport: { x: 0, y: 0, zoom: 1 },
    playerViewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: Date.now(),
  };
}

export function nextSceneName(): string {
  return t.scene.defaultName(Object.keys(getGm().scenes).length + 1);
}

export function addScene(scene: Scene, open = true): void {
  setGm((d) => {
    d.scenes[scene.id] = scene;
  });
  if (open) openScene(scene.id);
}

export function openScene(id: Id): void {
  const s = getGm();
  if (!s.scenes[id] || s.activeSceneId === id) return;
  useGm.setState({ activeSceneId: id, selection: [], drag: null, align: null, textEdit: null });
  refreshHistoryFlags();
  void putSetting('lastSceneId', id);
}

export function renameScene(id: Id, name: string): void {
  setGm((d) => {
    const sc = d.scenes[id];
    if (sc) {
      sc.name = name;
      sc.updatedAt = Date.now();
    }
  });
}

export function duplicateScene(id: Id): void {
  const src = getGm().scenes[id];
  if (!src) return;
  const copy: Scene = {
    ...structuredClone(src),
    id: nanoid(),
    name: src.name + t.scene.copySuffix,
    order: Math.max(...Object.values(getGm().scenes).map((x) => x.order)) + 1,
    updatedAt: Date.now(),
  };
  addScene(copy, false);
}

/** `fromCloud`: the deletion came from another device, so it is not sent back. */
export async function deleteScene(id: Id, opts: { fromCloud?: boolean } = {}): Promise<void> {
  const s = getGm();
  if (!s.scenes[id]) return;
  const rest = Object.values(s.scenes)
    .filter((x) => x.id !== id)
    .sort((a, b) => a.order - b.order);
  if (s.activeSceneId === id) {
    const next = rest.find((x) => x.collectionId === s.collectionId) ?? rest[0];
    if (next) openScene(next.id);
    else addScene(newScene(t.scene.defaultName(1)));
  }
  setGm((d) => {
    delete d.scenes[id];
  });
  dropHistory(id);
  forgetSaved(id);
  await db.scenes.delete(id);
  if (!opts.fromCloud) await recordDeletion({ kind: 'scene', id, at: Date.now() });
}

/** World bounds of the maps of a scene, or of all its items when there is no map. */
export function sceneBounds(scene: Scene, assets: Record<Id, Asset> = getGm().assets): Rect | null {
  const boundsOf = (items: Item[]) =>
    rectUnion(
      items.flatMap((it) => {
        if (it.kind === 'image') {
          const a = assets[it.assetId];
          return a ? [imageBounds(it, a.width, a.height)] : [];
        }
        if (it.kind === 'disc') {
          const r = (it.sizeCells * 150) / 2;
          return [{ x: it.position.x - r, y: it.position.y - r, width: 2 * r, height: 2 * r }];
        }
        return [{ x: it.position.x, y: it.position.y, width: 1, height: 1 }];
      }),
    );
  const items = Object.values(scene.items);
  return boundsOf(items.filter((it) => it.layer === 'map')) ?? boundsOf(items);
}

export function setGmViewport(v: Viewport): void {
  changeScene(
    (d) => {
      d.gmViewport = v;
    },
    { history: false },
  );
}

/** "Сбросить вид": fit the map, or every item, into the screen. */
export function resetView(screen: Size): void {
  const scene = activeScene();
  if (!scene) return;
  const bounds = sceneBounds(scene);
  setGmViewport(bounds ? fitRect(bounds, screen) : { x: 0, y: 0, zoom: 1 });
}

export function updateGrid(patch: Partial<GridSettings>, key?: string): void {
  changeScene(
    (d) => {
      Object.assign(d.grid, patch);
    },
    { key },
  );
}

export function updateFog(patch: Partial<FogSettings>, key?: string): void {
  changeScene(
    (d) => {
      Object.assign(d.fog, patch);
    },
    { key },
  );
}

/** "Сцена из карты": a scene with the map anchored at the origin, opened and fitted. */
export function createSceneFromMap(
  asset: Asset,
  name: string,
  grid: Partial<GridSettings>,
  screen: Size,
  mapGrid: ImageGrid = asset.grid,
): Id {
  const scene = newScene(name, grid);
  const item = newImageItem(asset, scene);
  item.grid = { ...mapGrid, offset: { ...mapGrid.offset } };
  item.position = { x: 0, y: 0 };
  scene.items[item.id] = item;
  scene.thumbId = asset.thumbId;
  const bounds = imageBounds(item, asset.width, asset.height);
  scene.gmViewport = fitRect(bounds, screen);
  scene.playerViewport = { ...scene.gmViewport };
  addScene(scene);
  return scene.id;
}

/** Updates the grid of every instance of `assetId` in the active scene. */
export function applyAssetGridToScene(assetId: Id, grid: ImageGrid): void {
  changeScene((d) => {
    for (const it of Object.values(d.items)) {
      if (it.kind === 'image' && it.assetId === assetId) it.grid = { ...grid, offset: { ...grid.offset } };
    }
  });
}

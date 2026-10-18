import { nanoid } from 'nanoid';
import type { Asset, AppSettings, Collection, Id } from '../core/types';
import { recordDeletion } from '../cloud/remote';
import { db, putSetting } from '../db/db';
import { gmImages, notifyThumb } from '../gm/images';
import { activeScene, dropHistory, getGm, refreshHistoryFlags, setGm, useGm } from './store';
import { writePrefs } from './ui';

/** Number of scenes each asset is placed in. */
export function assetUsage(assetId: Id): number {
  return Object.values(getGm().scenes).filter((s) =>
    Object.values(s.items).some((it) => it.kind === 'image' && it.assetId === assetId),
  ).length;
}

export async function updateAsset(id: Id, patch: Partial<Omit<Asset, 'id'>>): Promise<void> {
  const asset = getGm().assets[id];
  if (!asset) return;
  const next = { ...asset, ...patch, updatedAt: Date.now() };
  setGm((d) => {
    d.assets[id] = next;
  });
  await db.assets.put(next);
}

/** Removes the asset, its files and its instances in every scene (`fromCloud`: not sent back). */
export async function deleteAsset(id: Id, opts: { fromCloud?: boolean } = {}): Promise<void> {
  const asset = getGm().assets[id];
  if (!asset) return;
  const fileShared = Object.values(getGm().assets).some((a) => a.id !== id && a.hash === asset.hash);
  const touched: Id[] = [];
  setGm((d) => {
    delete d.assets[id];
    for (const scene of Object.values(d.scenes)) {
      let changed = false;
      for (const it of Object.values(scene.items)) {
        if (it.kind === 'image' && it.assetId === id) {
          delete scene.items[it.id];
          changed = true;
        }
      }
      if (scene.thumbId === asset.thumbId) {
        delete scene.thumbId;
        changed = true;
      }
      if (changed) {
        scene.updatedAt = Date.now();
        touched.push(scene.id);
      }
    }
    d.selection = d.selection.filter((sid) => {
      const sc = d.activeSceneId ? d.scenes[d.activeSceneId] : undefined;
      return sc ? sid in sc.items : false;
    });
  });
  // Undo could bring back items whose file is gone: start those histories over.
  for (const sid of touched) dropHistory(sid);
  refreshHistoryFlags();
  gmImages.invalidate(id);
  await db.transaction('rw', db.assets, db.blobs, async () => {
    await db.assets.delete(id);
    await db.blobs.bulkDelete([asset.blobId, asset.thumbId]);
  });
  notifyThumb(asset.thumbId);
  if (!opts.fromCloud) {
    await recordDeletion({
      kind: 'asset',
      id,
      at: Date.now(),
      thumbId: asset.thumbId,
      ...(fileShared ? {} : { hash: asset.hash }),
    });
  }
}

export async function createCollection(name: string): Promise<Collection> {
  const order = Math.max(-1, ...getGm().collections.map((c) => c.order)) + 1;
  const c: Collection = { id: nanoid(), name, order, createdAt: Date.now() };
  setGm((d) => {
    d.collections.push(c);
  });
  await db.collections.put(c);
  selectCollection(c.id);
  return c;
}

export function selectCollection(id: Id): void {
  useGm.setState({ collectionId: id });
  writePrefs({ collectionId: id });
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const settings = { ...getGm().settings, ...patch };
  useGm.setState({ settings });
  await putSetting('app', settings);
}

export function activeSceneUses(assetId: Id): boolean {
  const scene = activeScene();
  return !!scene && Object.values(scene.items).some((it) => it.kind === 'image' && it.assetId === assetId);
}

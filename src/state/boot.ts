import { nanoid } from 'nanoid';
import { DEFAULT_SETTINGS } from '../core/constants';
import type { AppSettings, Asset, Collection, Id, Scene } from '../core/types';
import { db, getSetting, putSetting } from '../db/db';
import { t } from '../i18n/ru';
import { markSaved, startAutosave } from './persistence';
import { addScene, newScene } from './scenes';
import { useGm, type ToolId } from './store';
import { readPrefs } from './ui';

const BOOT_TOOLS: ToolId[] = ['move', 'select', 'fog', 'draw', 'measure', 'pointer', 'text'];

/** Loads the library and scenes from IndexedDB and opens the last scene. */
export async function boot(): Promise<void> {
  try {
    await db.open();
  } catch (err) {
    console.error(err);
    useGm.setState({ fatal: t.errors.storageOpen });
    return;
  }

  let collections = await db.collections.orderBy('order').toArray();
  if (collections.length === 0) {
    const def: Collection = {
      id: nanoid(),
      name: t.manager.defaultCollection,
      order: 0,
      createdAt: Date.now(),
    };
    await db.collections.put(def);
    collections = [def];
  }

  // Assets are metadata only; files and thumbnails are loaded lazily.
  const assetList = await db.assets.toArray();
  const trackList = await db.tracks.toArray();
  const sceneList = await db.scenes.toArray();
  const settings = { ...DEFAULT_SETTINGS, ...((await getSetting<AppSettings>('app')) ?? {}) };
  const lastSceneId = await getSetting<Id>('lastSceneId');

  if (!(await getSetting<boolean>('persistRequested'))) {
    await putSetting('persistRequested', true);
    void navigator.storage?.persist?.().catch(() => false);
  }

  const assets: Record<Id, Asset> = {};
  for (const a of assetList) assets[a.id] = a;
  const scenes: Record<Id, Scene> = {};
  for (const s of sceneList) {
    scenes[s.id] = s;
    markSaved(s);
  }

  const prefs = readPrefs();
  const collectionId = collections.some((c) => c.id === prefs.collectionId)
    ? prefs.collectionId!
    : collections[0].id;
  const tool = BOOT_TOOLS.includes(prefs.tool as ToolId) ? (prefs.tool as ToolId) : 'move';

  const sorted = sceneList.sort((a, b) => a.order - b.order);
  const active = (lastSceneId && scenes[lastSceneId]) || sorted[0] || null;

  useGm.setState({
    ready: true,
    settings,
    collections,
    collectionId,
    assets,
    tracks: Object.fromEntries(trackList.map((tr) => [tr.id, tr])),
    scenes,
    activeSceneId: active?.id ?? null,
    tool,
  });

  startAutosave();
  if (!active) addScene(newScene(t.scene.defaultName(1)));
}

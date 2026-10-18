import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { nanoid } from 'nanoid';
import {
  blobPath,
  countConflicts,
  planImport,
  type BackupManifest,
  type ConflictPolicy,
  type ImportPlan,
  type LibraryData,
} from '../core/backup';
import type { Asset, Collection, Scene } from '../core/types';
import { db, putSetting, SCHEMA_VERSION } from '../db/db';
import { t } from '../i18n/ru';
import { flushScenes, markSaved } from '../state/persistence';
import { dropHistory, getGm, refreshHistoryFlags, setGm } from '../state/store';
import { makeThumbnail, notifyThumb } from './images';

/**
 * One .vttlite.zip: manifest.json, collections.json, scenes/*.json, assets/*.json and the
 * original files as blobs/<hash>.<ext>. Images are stored, not recompressed.
 */
export async function exportBackup(): Promise<Blob> {
  await flushScenes();
  const [collections, scenes, assets] = await Promise.all([
    db.collections.toArray(),
    db.scenes.toArray(),
    db.assets.toArray(),
  ]);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let failure = null as Error | null;
  const zip = new Zip((err, data) => {
    if (err) failure = err;
    else chunks.push(data as Uint8Array<ArrayBuffer>);
  });
  const addJson = (name: string, value: unknown) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(JSON.stringify(value)), true);
  };
  const manifest: BackupManifest = {
    app: 'vtt-lite',
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    counts: { scenes: scenes.length, assets: assets.length, collections: collections.length },
  };
  addJson('manifest.json', manifest);
  addJson('collections.json', collections);
  for (const s of scenes) addJson(`scenes/${s.id}.json`, s);
  const written = new Set<string>();
  for (const a of assets) {
    addJson(`assets/${a.id}.json`, a);
    const path = blobPath(a.hash, a.mime);
    if (written.has(path)) continue;
    const rec = await db.blobs.get(a.blobId);
    if (!rec) continue;
    const f = new ZipPassThrough(path);
    zip.add(f);
    f.push(new Uint8Array(await rec.blob.arrayBuffer()), true);
    written.add(path);
  }
  zip.end();
  if (failure) throw failure;
  await putSetting('lastBackupAt', Date.now());
  return new Blob(chunks, { type: 'application/zip' });
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `vtt-lite-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.vttlite.zip`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ParsedBackup {
  data: LibraryData;
  files: Map<string, Uint8Array>; // zip path → bytes
}

export class BackupError extends Error {}

export async function readBackup(file: File): Promise<ParsedBackup> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupError(t.storage.badFile);
  }
  const json = <T>(name: string): T => JSON.parse(strFromU8(entries[name])) as T;
  if (!entries['manifest.json']) throw new BackupError(t.storage.badFile);
  const manifest = json<BackupManifest>('manifest.json');
  if (manifest.app !== 'vtt-lite') throw new BackupError(t.storage.badFile);
  if (manifest.schemaVersion > SCHEMA_VERSION) throw new BackupError(t.storage.newerVersion);
  const collections = entries['collections.json'] ? json<Collection[]>('collections.json') : [];
  const scenes: Scene[] = [];
  const assets: Asset[] = [];
  const files = new Map<string, Uint8Array>();
  for (const name of Object.keys(entries)) {
    if (name.startsWith('scenes/') && name.endsWith('.json')) scenes.push(json<Scene>(name));
    else if (name.startsWith('assets/') && name.endsWith('.json')) assets.push(json<Asset>(name));
    else if (name.startsWith('blobs/')) files.set(name, entries[name]);
  }
  // Only assets whose file is in the archive can be restored.
  const restorable = assets.filter((a) => files.has(blobPath(a.hash, a.mime)));
  return { data: { collections, scenes, assets: restorable }, files };
}

function currentLibrary(): LibraryData {
  const s = getGm();
  return { collections: s.collections, scenes: Object.values(s.scenes), assets: Object.values(s.assets) };
}

export function backupConflicts(parsed: ParsedBackup): number {
  return countConflicts(currentLibrary(), parsed.data);
}

/** Merges the backup into the library and IndexedDB. */
export async function importBackup(parsed: ParsedBackup, policy: ConflictPolicy): Promise<ImportPlan> {
  await flushScenes();
  const plan = planImport(currentLibrary(), parsed.data, policy, nanoid, t.storage.importSuffix);
  const blobs = plan.assets.map((a) => ({
    id: a.blobId,
    kind: 'file' as const,
    blob: new Blob([parsed.files.get(blobPath(a.hash, a.mime)) as Uint8Array<ArrayBuffer>], { type: a.mime }),
  }));
  await db.transaction('rw', [db.collections, db.assets, db.blobs, db.scenes], async () => {
    await db.collections.bulkPut(plan.collections);
    await db.blobs.bulkPut(blobs);
    await db.assets.bulkPut(plan.assets);
    await db.scenes.bulkPut(plan.scenes);
  });
  setGm((d) => {
    d.collections.push(...plan.collections);
    for (const a of plan.assets) d.assets[a.id] = a;
    for (const s of plan.scenes) d.scenes[s.id] = s;
  });
  for (const s of plan.scenes) markSaved(getGm().scenes[s.id]);
  for (const id of plan.replacedScenes) dropHistory(id);
  refreshHistoryFlags();
  // Thumbnails are not in the archive: make them again in the background.
  void (async () => {
    for (let i = 0; i < plan.assets.length; i++) {
      const a = plan.assets[i];
      try {
        const thumb = await makeThumbnail(blobs[i].blob, a.width, a.height);
        await db.blobs.put({ id: a.thumbId, kind: 'thumb', blob: thumb });
        notifyThumb(a.thumbId);
      } catch (err) {
        console.warn('Thumbnail failed', a.name, err);
      }
    }
  })();
  return plan;
}

import Dexie, { type Table } from 'dexie';
import type { Asset, Collection, Id, Scene } from '../core/types';

/** Bump together with a new `version()` block below; each block is one migration. */
export const SCHEMA_VERSION = 1;

export interface BlobRecord {
  id: Id;
  kind: 'file' | 'thumb';
  blob: Blob;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class VttDatabase extends Dexie {
  assets!: Table<Asset, Id>;
  blobs!: Table<BlobRecord, Id>;
  scenes!: Table<Scene, Id>;
  collections!: Table<Collection, Id>;
  settings!: Table<SettingRecord, string>;

  constructor(name = 'vtt-lite') {
    super(name);
    this.version(1).stores({
      assets: 'id, type, collectionId, hash, updatedAt',
      blobs: 'id, kind',
      scenes: 'id, collectionId, order',
      collections: 'id, order',
      settings: 'key',
    });
  }
}

export const db = new VttDatabase();

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const rec = await db.settings.get(key);
  return rec?.value as T | undefined;
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

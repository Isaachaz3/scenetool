import Dexie, { type Table } from 'dexie';
import type { AmbientTrack, Asset, Collection, Id, Scene } from '../core/types';

/** Bump together with a new `version()` block below; each block is one migration. */
export const SCHEMA_VERSION = 2;

export interface BlobRecord {
  id: Id;
  kind: 'file' | 'thumb' | 'audio';
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
  tracks!: Table<AmbientTrack, Id>;

  constructor(name = 'vtt-lite') {
    super(name);
    this.version(1).stores({
      assets: 'id, type, collectionId, hash, updatedAt',
      blobs: 'id, kind',
      scenes: 'id, collectionId, order',
      collections: 'id, order',
      settings: 'key',
    });
    // 2: ambient sound tracks.
    this.version(2).stores({ tracks: 'id, hash, updatedAt' });
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

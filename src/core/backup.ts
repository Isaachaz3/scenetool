import type { Asset, Collection, Id, Scene } from './types';

/** manifest.json of a .vttlite.zip backup. */
export interface BackupManifest {
  app: 'vtt-lite';
  schemaVersion: number;
  createdAt: number;
  counts: { scenes: number; assets: number; collections: number };
}

export interface LibraryData {
  collections: Collection[];
  scenes: Scene[];
  assets: Asset[];
}

export type ConflictPolicy = 'replace' | 'keep-both';

export interface ImportPlan {
  collections: Collection[]; // to add
  assets: Asset[]; // to store; their files must be written
  scenes: Scene[]; // to store, with asset ids remapped
  replacedScenes: Id[]; // ids whose existing scene is overwritten
  skipped: { assets: number; scenes: number }; // identical to what is already there
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export function blobPath(hash: string, mime: string): string {
  return `blobs/${hash}.${EXT_BY_MIME[mime] ?? 'bin'}`;
}

function sameScene(a: Scene, b: Scene): boolean {
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}

/** Conflicts: same id but different content (an asset with the same file is not one). */
export function countConflicts(existing: LibraryData, backup: LibraryData): number {
  const byId = new Map(existing.assets.map((a) => [a.id, a]));
  const hashes = new Set(existing.assets.map((a) => a.hash));
  const scenes = new Map(existing.scenes.map((s) => [s.id, s]));
  let n = 0;
  for (const a of backup.assets) {
    const cur = byId.get(a.id);
    if (cur && cur.hash !== a.hash && !hashes.has(a.hash)) n++;
  }
  for (const s of backup.scenes) {
    const cur = scenes.get(s.id);
    if (cur && !sameScene(cur, s)) n++;
  }
  return n;
}

/**
 * Merge by id and file hash. A file already in the library is reused under its existing id;
 * on a conflict `policy` either overwrites or keeps both versions under new ids.
 */
export function planImport(
  existing: LibraryData,
  backup: LibraryData,
  policy: ConflictPolicy,
  newId: () => Id,
  copySuffix: string,
): ImportPlan {
  const plan: ImportPlan = {
    collections: [],
    assets: [],
    scenes: [],
    replacedScenes: [],
    skipped: { assets: 0, scenes: 0 },
  };
  // Collections merge by id, then by name: every library has its own "Default".
  const collectionIds = new Set(existing.collections.map((c) => c.id));
  const byName = new Map(existing.collections.map((c) => [c.name, c.id]));
  const collectionMap = new Map<Id, Id>();
  for (const c of backup.collections) {
    if (collectionIds.has(c.id)) continue;
    const same = byName.get(c.name);
    if (same) {
      collectionMap.set(c.id, same);
      continue;
    }
    plan.collections.push(c);
    collectionIds.add(c.id);
    byName.set(c.name, c.id);
  }
  const fallbackCollection = existing.collections[0]?.id ?? backup.collections[0]?.id;
  const inCollection = <T extends { collectionId: Id }>(x: T): T => {
    const id = collectionMap.get(x.collectionId) ?? x.collectionId;
    if (collectionIds.has(id) || !fallbackCollection)
      return id === x.collectionId ? x : { ...x, collectionId: id };
    return { ...x, collectionId: fallbackCollection };
  };

  const byId = new Map(existing.assets.map((a) => [a.id, a]));
  const byHash = new Map(existing.assets.map((a) => [a.hash, a]));
  const assetMap = new Map<Id, Id>(); // backup id → id in the merged library
  for (const a of backup.assets) {
    const sameFile = byHash.get(a.hash);
    if (sameFile) {
      assetMap.set(a.id, sameFile.id);
      plan.skipped.assets++;
      continue;
    }
    const clash = byId.get(a.id);
    if (clash && policy === 'keep-both') {
      const copy = {
        ...inCollection(a),
        id: newId(),
        blobId: newId(),
        thumbId: newId(),
        name: a.name + copySuffix,
      };
      assetMap.set(a.id, copy.id);
      plan.assets.push(copy);
    } else {
      assetMap.set(a.id, a.id);
      plan.assets.push(inCollection(a));
    }
    byHash.set(a.hash, a);
  }

  const known = new Set([...existing.assets.map((a) => a.id), ...plan.assets.map((a) => a.id)]);
  const scenes = new Map(existing.scenes.map((s) => [s.id, s]));
  for (const src of backup.scenes) {
    const items: Scene['items'] = {};
    for (const [id, it] of Object.entries(src.items)) {
      if (it.kind !== 'image') {
        items[id] = it;
        continue;
      }
      const assetId = assetMap.get(it.assetId) ?? it.assetId;
      if (known.has(assetId)) items[id] = { ...it, assetId };
    }
    let scene: Scene = inCollection({ ...src, items });
    const cur = scenes.get(src.id);
    if (cur && sameScene(cur, scene)) {
      plan.skipped.scenes++;
      continue;
    }
    if (cur && policy === 'keep-both') scene = { ...scene, id: newId(), name: scene.name + copySuffix };
    else if (cur) plan.replacedScenes.push(cur.id);
    plan.scenes.push(scene);
  }
  return plan;
}

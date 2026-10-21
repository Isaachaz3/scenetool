// Pure decisions of the cloud sync: what to push, what a pulled row does locally.
import type { AmbientTrack, Asset, Collection, Id, Scene } from './types';

export type DocKind = 'collection' | 'asset' | 'track' | 'scene';

/** A row of public.vtt_docs. */
export interface RemoteDoc {
  kind: DocKind;
  id: Id;
  data: unknown;
  updated_at: number;
  deleted: boolean;
  synced_at: string;
}

export interface LocalDoc {
  kind: DocKind;
  id: Id;
  version: number;
}

export const docKey = (kind: DocKind, id: Id) => `${kind}:${id}`;

/** Change time of a document; collections are never edited, so their creation time is enough. */
export function versionOf(kind: DocKind, doc: Scene | Asset | Collection | AmbientTrack): number {
  if (kind === 'collection') return (doc as Collection).createdAt;
  return (doc as Scene | Asset | AmbientTrack).updatedAt;
}

/** Local documents changed since they were last pushed (or pulled). */
export function pendingPush(local: LocalDoc[], pushed: Record<string, number>): LocalDoc[] {
  return local.filter((d) => pushed[docKey(d.kind, d.id)] !== d.version);
}

export type PullAction = 'apply' | 'delete' | 'skip';

/** Last writer wins by the document's own change time. */
export function decidePull(remote: RemoteDoc, localVersion: number | undefined): PullAction {
  if (remote.deleted) return localVersion === undefined ? 'skip' : 'delete';
  if (localVersion === undefined || remote.updated_at > localVersion) return 'apply';
  return 'skip';
}

/** Highest server time seen; the next pull starts there (rows at that instant come again). */
export function nextCursor(rows: RemoteDoc[], cursor: string | null): string | null {
  let best = cursor;
  for (const r of rows) if (!best || r.synced_at > best) best = r.synced_at;
  return best;
}

/**
 * First sync of a device that already had a library: its collections join the cloud ones
 * with the same name (every library starts with its own "Default"). Collections that were
 * ever pushed are left alone. Returns local collection id → cloud collection id.
 */
export function mergeCollections(
  local: Collection[],
  remote: Collection[],
  pushed: Record<string, number>,
): Map<Id, Id> {
  const byName = new Map(remote.map((c) => [c.name, c.id]));
  const out = new Map<Id, Id>();
  for (const c of local) {
    if (docKey('collection', c.id) in pushed) continue;
    const target = byName.get(c.name);
    if (target && target !== c.id) out.set(c.id, target);
  }
  return out;
}

/** Empty scenes that never reached the cloud, like the first scene of a new library. */
export function strayScenes(local: Scene[], pushed: Record<string, number>): Id[] {
  return local
    .filter((s) => Object.keys(s.items).length === 0 && !(docKey('scene', s.id) in pushed))
    .map((s) => s.id);
}

/** Storage paths of an asset's original file and thumbnail. */
export function filePath(userId: string, hash: string): string {
  return `${userId}/files/${hash}`;
}

export function thumbPath(userId: string, thumbId: Id): string {
  return `${userId}/thumbs/${thumbId}`;
}

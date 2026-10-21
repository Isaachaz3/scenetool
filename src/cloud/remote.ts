import type { DocKind } from '../core/sync';
import type { Id } from '../core/types';
import { getSetting, putSetting } from '../db/db';

/**
 * Downloads of files that are not on this device yet. Set by the cloud sync while signed in,
 * so the image loaders do not depend on Supabase themselves.
 */
export const remoteFiles: {
  file: ((ref: { hash: string }) => Promise<Blob | null>) | null; // an asset or an audio track
  thumb: ((thumbId: Id) => Promise<Blob | null>) | null;
} = { file: null, thumb: null };

/** A local deletion that still has to reach the cloud. */
export interface Tombstone {
  kind: DocKind;
  id: Id;
  at: number;
  hash?: string; // asset file to remove from storage (when no other asset uses it)
  thumbId?: Id;
}

const KEY = 'cloud:tombstones';
let chain: Promise<unknown> = Promise.resolve();
export const deletionListeners = new Set<() => void>();

export function recordDeletion(t: Tombstone): Promise<void> {
  const next = chain.then(async () => {
    const list = (await getSetting<Tombstone[]>(KEY)) ?? [];
    list.push(t);
    await putSetting(KEY, list);
  });
  chain = next.catch(() => undefined);
  void next.then(() => deletionListeners.forEach((cb) => cb()));
  return next;
}

export async function readTombstones(): Promise<Tombstone[]> {
  await chain;
  return (await getSetting<Tombstone[]>(KEY)) ?? [];
}

export function clearTombstones(done: Tombstone[]): Promise<void> {
  const next = chain.then(async () => {
    const list = (await getSetting<Tombstone[]>(KEY)) ?? [];
    const sent = new Set(done.map((t) => `${t.kind}:${t.id}:${t.at}`));
    await putSetting(
      KEY,
      list.filter((t) => !sent.has(`${t.kind}:${t.id}:${t.at}`)),
    );
  });
  chain = next.catch(() => undefined);
  return next;
}

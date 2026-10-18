import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import {
  decidePull,
  docKey,
  filePath,
  mergeCollections,
  nextCursor,
  pendingPush,
  strayScenes,
  thumbPath,
  versionOf,
  type DocKind,
  type LocalDoc,
  type RemoteDoc,
} from '../core/sync';
import type { Asset, Collection, Scene } from '../core/types';
import { db, getSetting, putSetting } from '../db/db';
import { gmImages, notifyThumb } from '../gm/images';
import { t } from '../i18n/ru';
import { deleteAsset, selectCollection } from '../state/assets';
import { flushScenes, markSaved } from '../state/persistence';
import { deleteScene } from '../state/scenes';
import { dropHistory, getGm, refreshHistoryFlags, setGm, useGm } from '../state/store';
import { CLOUD_BUCKET, DOCS_TABLE, SUPABASE_KEY, SUPABASE_URL } from './config';
import { clearTombstones, deletionListeners, readTombstones, remoteFiles } from './remote';

export type CloudStatus = 'loading' | 'signed-out' | 'idle' | 'syncing' | 'error';

interface CloudState {
  status: CloudStatus;
  email: string | null;
  lastSyncAt: number | null;
  progress: string | null;
  error: string | null;
}

export const useCloud = create<CloudState>(() => ({
  status: 'loading',
  email: null,
  lastSyncAt: null,
  progress: null,
  error: null,
}));

/** Per-user sync bookkeeping kept in IndexedDB. */
interface Meta {
  cursor: string | null; // server time of the last pulled row
  pushed: Record<string, number>; // doc key → version known to be in the cloud
  uploaded: Record<string, true>; // storage paths known to be in the cloud
}

const PAGE = 500;
const BATCH = 25;
const KIND_ORDER: Record<DocKind, number> = { collection: 0, asset: 1, scene: 2 };

let client: SupabaseClient | null = null;
let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

const metaKey = (uid: string) => `cloud:${uid}`;

async function loadMeta(uid: string): Promise<Meta> {
  return (await getSetting<Meta>(metaKey(uid))) ?? { cursor: null, pushed: {}, uploaded: {} };
}

function saveMeta(uid: string, meta: Meta): Promise<void> {
  return putSetting(metaKey(uid), meta);
}

/** Readable message for auth, network and missing-schema errors. */
function describe(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number } | null;
  const m = (e?.message ?? String(err)).toLowerCase();
  if (m.includes('invalid login')) return t.cloud.errors.invalid;
  if (m.includes('not confirmed')) return t.cloud.errors.notConfirmed;
  if (m.includes('already registered') || m.includes('already been registered')) return t.cloud.errors.exists;
  if (m.includes('at least 6') || m.includes('weak')) return t.cloud.errors.weak;
  if (m.includes('rate limit')) return t.cloud.errors.rate;
  if (
    e?.code === 'PGRST205' ||
    e?.code === '42P01' ||
    m.includes(DOCS_TABLE) ||
    m.includes('bucket not found')
  ) {
    return t.cloud.errors.schema;
  }
  if (m.includes('failed to fetch') || m.includes('network') || !navigator.onLine)
    return t.cloud.errors.network;
  return t.cloud.errors.generic(e?.message ?? String(err));
}

async function download(path: string): Promise<Blob | null> {
  if (!client) return null;
  const { data, error } = await client.storage.from(CLOUD_BUCKET).download(path);
  return error ? null : data;
}

function applySession(session: Session | null) {
  const uid = session?.user.id ?? null;
  const changed = uid !== userId;
  userId = uid;
  if (!uid || !session) {
    remoteFiles.file = null;
    remoteFiles.thumb = null;
    useCloud.setState({ status: 'signed-out', email: null, progress: null });
    return;
  }
  remoteFiles.file = (asset) => download(filePath(uid, asset.hash));
  remoteFiles.thumb = (thumbId) => download(thumbPath(uid, thumbId));
  const status = useCloud.getState().status;
  useCloud.setState({
    email: session.user.email ?? null,
    status: status === 'syncing' || status === 'error' ? status : 'idle',
  });
  if (changed) schedule(0);
}

/** Creates the client, restores the session (also from an email confirmation link) and starts syncing. */
export async function initCloud(): Promise<void> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'vtt-lite-auth',
      },
    });
  } catch (err) {
    console.warn('Cloud unavailable', err);
    useCloud.setState({ status: 'signed-out' });
    return;
  }
  // No Supabase calls inside this callback: schedule work instead.
  client.auth.onAuthStateChange((_event, session) => applySession(session));
  const { data } = await client.auth.getSession();
  applySession(data.session);
  window.addEventListener('focus', () => schedule(500));
  window.addEventListener('online', () => schedule(500));
  setInterval(() => schedule(0), 60_000);
  useGm.subscribe((s, prev) => {
    if (s.scenes !== prev.scenes || s.assets !== prev.assets || s.collections !== prev.collections)
      schedule(3000);
  });
  deletionListeners.add(() => schedule(1000));
}

function schedule(delay: number) {
  if (!userId) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!client) return t.cloud.errors.network;
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? describe(error) : null;
}

/** Returns an error, or whether the address has to be confirmed by email first. */
export async function signUp(
  email: string,
  password: string,
): Promise<{ error?: string; confirm?: boolean }> {
  if (!client) return { error: t.cloud.errors.network };
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) return { error: describe(error) };
  return { confirm: !data.session };
}

export async function signOut(): Promise<void> {
  await client?.auth.signOut();
}

// --- sync -------------------------------------------------------------------------------------

/**
 * Deletions go up first, then what other devices wrote comes down, then local changes go up.
 * Pulling before pushing keeps an older offline edit from replacing a newer one.
 */
export async function syncNow(): Promise<void> {
  if (!client || !userId) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  const uid = userId;
  useCloud.setState({ status: 'syncing', error: null });
  try {
    await flushScenes();
    const meta = await loadMeta(uid);
    const first = meta.cursor === null;
    await pushDeletions(client, uid, meta);
    const applied = await pull(client, uid, meta);
    if (first) await adopt(applied, meta);
    await saveMeta(uid, meta);
    await pushChanges(client, uid, meta);
    await saveMeta(uid, meta);
    useCloud.setState({ status: 'idle', lastSyncAt: Date.now(), progress: null });
  } catch (err) {
    console.warn('Cloud sync failed', err);
    useCloud.setState({ status: 'error', error: describe(err), progress: null });
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(1000);
    }
  }
}

async function upsert(c: SupabaseClient, rows: object[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await c
      .from(DOCS_TABLE)
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'owner,kind,id' });
    if (error) throw error;
  }
}

async function pushDeletions(c: SupabaseClient, uid: string, meta: Meta) {
  const list = await readTombstones();
  if (list.length === 0) return;
  await upsert(
    c,
    list.map((d) => ({ owner: uid, kind: d.kind, id: d.id, data: null, updated_at: d.at, deleted: true })),
  );
  // The server keeps a newer edit from another device over an older deletion.
  const rows: RemoteDoc[] = [];
  const ids = [...new Set(list.map((d) => d.id))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await c
      .from(DOCS_TABLE)
      .select('kind,id,data,updated_at,deleted,synced_at')
      .in('id', ids.slice(i, i + 100));
    if (error) throw error;
    rows.push(...(data as RemoteDoc[]));
  }
  const byKey = new Map(rows.map((r) => [docKey(r.kind, r.id), r]));
  const paths: string[] = [];
  for (const d of list) {
    const key = docKey(d.kind, d.id);
    const row = byKey.get(key);
    if (row && !row.deleted) {
      await applyRemote(row, uid, meta); // the edit won: bring the document back
      meta.pushed[key] = row.updated_at;
      continue;
    }
    delete meta.pushed[key];
    if (d.hash) paths.push(filePath(uid, d.hash));
    if (d.thumbId) paths.push(thumbPath(uid, d.thumbId));
  }
  if (paths.length) await c.storage.from(CLOUD_BUCKET).remove(paths);
  for (const p of paths) delete meta.uploaded[p];
  await clearTombstones(list);
}

/** Uploads the original and the thumbnail so other devices can show the asset. */
async function uploadFiles(c: SupabaseClient, uid: string, asset: Asset, meta: Meta) {
  const file = filePath(uid, asset.hash);
  if (!meta.uploaded[file]) {
    const blob = (await db.blobs.get(asset.blobId))?.blob;
    if (blob) {
      const { error } = await c.storage
        .from(CLOUD_BUCKET)
        .upload(file, blob, { contentType: asset.mime, upsert: true });
      if (error) throw error;
    }
    meta.uploaded[file] = true; // a file missing here came from the cloud in the first place
  }
  const thumb = thumbPath(uid, asset.thumbId);
  if (!meta.uploaded[thumb]) {
    const blob = (await db.blobs.get(asset.thumbId))?.blob;
    if (!blob) return; // still being made: next sync
    const { error } = await c.storage
      .from(CLOUD_BUCKET)
      .upload(thumb, blob, { contentType: blob.type || 'image/webp', upsert: true });
    if (error) throw error;
    meta.uploaded[thumb] = true;
  }
}

async function pushChanges(c: SupabaseClient, uid: string, meta: Meta) {
  const s = getGm();
  const assets = Object.values(s.assets);
  const needFiles = assets.filter(
    (a) => !meta.uploaded[filePath(uid, a.hash)] || !meta.uploaded[thumbPath(uid, a.thumbId)],
  );
  for (let i = 0; i < needFiles.length; i++) {
    useCloud.setState({ progress: t.cloud.uploading(i + 1, needFiles.length) });
    await uploadFiles(c, uid, needFiles[i], meta);
  }
  const docs = new Map<string, Collection | Asset | Scene>();
  const local: LocalDoc[] = [];
  const add = (kind: DocKind, doc: Collection | Asset | Scene) => {
    docs.set(docKey(kind, doc.id), doc);
    local.push({ kind, id: doc.id, version: versionOf(kind, doc) });
  };
  s.collections.forEach((x) => add('collection', x));
  assets.forEach((x) => add('asset', x));
  Object.values(s.scenes).forEach((x) => add('scene', x));
  const pending = pendingPush(local, meta.pushed);
  if (pending.length === 0) return;
  useCloud.setState({ progress: t.cloud.pushing });
  await upsert(
    c,
    pending.map((d) => ({
      owner: uid,
      kind: d.kind,
      id: d.id,
      data: docs.get(docKey(d.kind, d.id)),
      updated_at: d.version,
      deleted: false,
    })),
  );
  for (const d of pending) meta.pushed[docKey(d.kind, d.id)] = d.version;
}

function localVersion(kind: DocKind, id: string): number | undefined {
  const s = getGm();
  if (kind === 'collection') {
    const c = s.collections.find((x) => x.id === id);
    return c ? versionOf('collection', c) : undefined;
  }
  if (kind === 'asset') return s.assets[id]?.updatedAt;
  return s.scenes[id]?.updatedAt;
}

/** Applies what changed in the cloud since the last pull; returns the applied rows. */
async function pull(c: SupabaseClient, uid: string, meta: Meta): Promise<RemoteDoc[]> {
  useCloud.setState({ progress: t.cloud.pulling });
  const rows: RemoteDoc[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = c
      .from(DOCS_TABLE)
      .select('kind,id,data,updated_at,deleted,synced_at')
      .order('synced_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (meta.cursor) q = q.gte('synced_at', meta.cursor);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data as RemoteDoc[]));
    if (data.length < PAGE) break;
  }
  rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const applied: RemoteDoc[] = [];
  for (const row of rows) {
    const key = docKey(row.kind, row.id);
    if (!row.deleted && meta.pushed[key] === row.updated_at) continue; // our own write
    const action = decidePull(row, localVersion(row.kind, row.id));
    if (action === 'apply') {
      await applyRemote(row, uid, meta);
      meta.pushed[key] = row.updated_at;
      applied.push(row);
    } else if (action === 'delete') {
      await deleteLocal(row.kind, row.id);
      delete meta.pushed[key];
    }
  }
  meta.cursor = nextCursor(rows, meta.cursor);
  return applied;
}

/**
 * First sync on this device: its own starter library folds into the one from the cloud
 * instead of adding a second "Default" and an empty scene to every device.
 */
async function adopt(applied: RemoteDoc[], meta: Meta) {
  const remote = applied.filter((r) => r.kind === 'collection').map((r) => r.data as Collection);
  const merge = mergeCollections(getGm().collections, remote, meta.pushed);
  if (merge.size) {
    const now = Date.now();
    const moved = Object.values(getGm().assets)
      .filter((a) => merge.has(a.collectionId))
      .map((a) => ({ ...a, collectionId: merge.get(a.collectionId)!, updatedAt: now }));
    await db.assets.bulkPut(moved);
    await db.collections.bulkDelete([...merge.keys()]);
    setGm((d) => {
      for (const a of moved) d.assets[a.id] = a;
      for (const sc of Object.values(d.scenes)) {
        const to = merge.get(sc.collectionId);
        if (to) {
          sc.collectionId = to;
          sc.updatedAt = now;
        }
      }
      d.collections = d.collections.filter((x) => !merge.has(x.id));
    });
    const current = merge.get(getGm().collectionId);
    if (current) selectCollection(current);
  }
  if (applied.some((r) => r.kind === 'scene')) {
    for (const id of strayScenes(Object.values(getGm().scenes), meta.pushed)) {
      await deleteScene(id, { fromCloud: true }); // never reached the cloud: nothing to tell it
    }
  }
}

async function applyRemote(row: RemoteDoc, uid: string, meta: Meta) {
  if (row.kind === 'collection') {
    const col = row.data as Collection;
    await db.collections.put(col);
    setGm((d) => {
      const i = d.collections.findIndex((x) => x.id === col.id);
      if (i >= 0) d.collections[i] = col;
      else d.collections.push(col);
    });
  } else if (row.kind === 'asset') {
    const asset = row.data as Asset;
    const before = getGm().assets[asset.id];
    // Same id with another file: the local copies are stale and are fetched again.
    if (before && before.hash !== asset.hash) await db.blobs.bulkDelete([asset.blobId, asset.thumbId]);
    await db.assets.put(asset);
    setGm((d) => {
      d.assets[asset.id] = asset;
    });
    meta.uploaded[filePath(uid, asset.hash)] = true;
    meta.uploaded[thumbPath(uid, asset.thumbId)] = true;
    notifyThumb(asset.thumbId);
    gmImages.invalidate(asset.id);
  } else {
    const scene = row.data as Scene;
    await db.scenes.put(scene);
    setGm((d) => {
      d.scenes[scene.id] = scene;
    });
    markSaved(getGm().scenes[scene.id]);
    dropHistory(scene.id);
    refreshHistoryFlags();
  }
}

async function deleteLocal(kind: DocKind, id: string) {
  if (kind === 'scene') await deleteScene(id, { fromCloud: true });
  else if (kind === 'asset') await deleteAsset(id, { fromCloud: true });
  else {
    const s = getGm();
    if (s.collections.length <= 1) return; // a library always keeps one collection
    await db.collections.delete(id);
    setGm((d) => {
      d.collections = d.collections.filter((x) => x.id !== id);
      if (d.collectionId === id) d.collectionId = d.collections[0].id;
    });
  }
}

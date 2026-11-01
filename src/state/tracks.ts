import { nanoid } from 'nanoid';
import { globalChannels, parseYouTubeId, sceneAmbient, trackKind } from '../core/ambient';
import { sha256Hex } from '../core/sha256';
import type {
  AmbientChannel,
  AmbientSettings,
  AmbientTrack,
  Id,
  SceneAmbient,
  SoundPad,
  SoundpadSettings,
  TrackKind,
} from '../core/types';
import { recordDeletion, remoteFiles } from '../cloud/remote';
import { db } from '../db/db';
import { updateSettings } from './assets';
import { getGm, setGm } from './store';

export class TrackError extends Error {}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

function store(track: AmbientTrack) {
  setGm((d) => {
    d.tracks[track.id] = track;
  });
  return db.tracks.put(track);
}

/** Title of a YouTube video, if YouTube answers; the id otherwise. */
async function youTubeTitle(id: string): Promise<string> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { title?: string };
      if (data.title) return data.title;
    }
  } catch {
    // offline or blocked: keep the id
  }
  return `YouTube ${id}`;
}

/** Adds a YouTube video by its link; the same video twice is one track. */
export async function addYouTubeTrack(
  link: string,
  invalid: string,
  kind: TrackKind = 'music',
): Promise<AmbientTrack> {
  const youtubeId = parseYouTubeId(link);
  if (!youtubeId) throw new TrackError(invalid);
  // The same video may be both music and a sound: dedupe inside one library.
  const dup = Object.values(getGm().tracks).find(
    (tr) => tr.youtubeId === youtubeId && trackKind(tr) === kind,
  );
  if (dup) return dup;
  const now = Date.now();
  const track: AmbientTrack = {
    id: nanoid(),
    name: await youTubeTitle(youtubeId),
    kind,
    source: 'youtube',
    youtubeId,
    volume: 1,
    createdAt: now,
    updatedAt: now,
  };
  await store(track);
  return track;
}

/** Adds an audio file (MP3, OGG, WAV…); the same file twice is one track. */
export async function addFileTrack(file: File, kind: TrackKind = 'music'): Promise<AmbientTrack> {
  const hash = await sha256Hex(await file.arrayBuffer());
  const dup = Object.values(getGm().tracks).find((tr) => tr.hash === hash && trackKind(tr) === kind);
  if (dup) return dup;
  const now = Date.now();
  const track: AmbientTrack = {
    id: nanoid(),
    name: baseName(file.name),
    kind,
    source: 'file',
    blobId: nanoid(),
    hash,
    mime: file.type || 'audio/mpeg',
    size: file.size,
    volume: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.blobs.put({ id: track.blobId!, kind: 'audio', blob: file });
  await store(track);
  return track;
}

/** The audio file of a track: from IndexedDB, or downloaded from the cloud and kept locally. */
export async function getTrackBlob(track: AmbientTrack): Promise<Blob | undefined> {
  if (!track.blobId || !track.hash) return undefined;
  const local = (await db.blobs.get(track.blobId))?.blob;
  if (local) return local;
  const remote = await remoteFiles.file?.({ hash: track.hash }).catch(() => null);
  if (!remote) return undefined;
  await db.blobs.put({ id: track.blobId, kind: 'audio', blob: remote });
  return remote;
}

export async function updateTrack(
  id: Id,
  patch: Partial<Pick<AmbientTrack, 'name' | 'volume'>>,
): Promise<void> {
  const track = getGm().tracks[id];
  if (!track) return;
  await store({ ...track, ...patch, updatedAt: Date.now() });
}

/** Removes the track and every reference to it (`fromCloud`: not sent back). */
export async function deleteTrack(id: Id, opts: { fromCloud?: boolean } = {}): Promise<void> {
  const track = getGm().tracks[id];
  if (!track) return;
  const now = Date.now();
  setGm((d) => {
    delete d.tracks[id];
    for (const sc of Object.values(d.scenes)) {
      // Sound tokens of the track go with it.
      const tokens = Object.values(sc.items).filter((it) => it.kind === 'sound' && it.trackId === id);
      for (const it of tokens) delete sc.items[it.id];
      const before = sceneAmbient(sc);
      const inMixer = before.channels.some((c) => c.trackId === id);
      if (inMixer) {
        sc.ambient = { ...before, channels: before.channels.filter((c) => c.trackId !== id) };
        delete sc.ambientTrackId;
      }
      if (inMixer || tokens.length) sc.updatedAt = now;
    }
  });
  const pads = soundpad().pads;
  if (pads.some((p) => p.trackId === id)) await setSoundpad({ pads: pads.filter((p) => p.trackId !== id) });
  const global = globalChannels(getGm().settings.ambient);
  if (global.some((c) => c.trackId === id)) await setGlobalChannels(global.filter((c) => c.trackId !== id));
  await db.tracks.delete(id);
  if (track.blobId) await db.blobs.delete(track.blobId);
  if (!opts.fromCloud) {
    await recordDeletion({ kind: 'track', id, at: now, ...(track.hash ? { hash: track.hash } : {}) });
  }
}

// --- soundpad -------------------------------------------------------------------------------------

const DEFAULT_PAD_VOLUME = 1;

function soundpad(): SoundpadSettings {
  return getGm().settings.soundpad ?? { pads: [], volume: 0.85 };
}

export function setSoundpad(patch: Partial<SoundpadSettings>): Promise<void> {
  return updateSettings({ soundpad: { ...soundpad(), ...patch } });
}

/** Adds a button for the sound (once). */
export function addPad(trackId: Id): Promise<void> {
  const pads = soundpad().pads;
  if (pads.some((p) => p.trackId === trackId)) return Promise.resolve();
  return setSoundpad({ pads: [...pads, { trackId, volume: DEFAULT_PAD_VOLUME }] });
}

export function updatePad(trackId: Id, patch: Partial<Omit<SoundPad, 'trackId'>>): Promise<void> {
  return setSoundpad({ pads: soundpad().pads.map((p) => (p.trackId === trackId ? { ...p, ...patch } : p)) });
}

export function removePad(trackId: Id): Promise<void> {
  return setSoundpad({ pads: soundpad().pads.filter((p) => p.trackId !== trackId) });
}

export function setAmbient(patch: Partial<AmbientSettings>): Promise<void> {
  return updateSettings({ ambient: { ...getGm().settings.ambient, ...patch } });
}

// --- mixer channels ------------------------------------------------------------------------------

const newChannel = (trackId: Id): AmbientChannel => ({ trackId, volume: 1, muted: false });

function setGlobalChannels(channels: AmbientChannel[]): Promise<void> {
  const { globalTrackId: _legacy, ...rest } = getGm().settings.ambient;
  return updateSettings({ ambient: { ...rest, channels } });
}

/** Where a channel lives: the global strip set, or the scene's. */
export type ChannelOwner = { scope: 'global' } | { scope: 'scene'; sceneId: Id };

function setSceneAmbientData(sceneId: Id, next: (cur: SceneAmbient) => SceneAmbient): void {
  setGm((d) => {
    const sc = d.scenes[sceneId];
    if (!sc) return;
    sc.ambient = next(sceneAmbient(sc));
    delete sc.ambientTrackId;
    sc.updatedAt = Date.now();
  });
}

function editChannels(owner: ChannelOwner, fn: (list: AmbientChannel[]) => AmbientChannel[]): void {
  if (owner.scope === 'global') void setGlobalChannels(fn(globalChannels(getGm().settings.ambient)));
  else setSceneAmbientData(owner.sceneId, (cur) => ({ ...cur, channels: fn(cur.channels) }));
}

/** Adds a strip for the track (once per owner). */
export function addChannel(owner: ChannelOwner, trackId: Id): void {
  editChannels(owner, (list) =>
    list.some((c) => c.trackId === trackId) ? list : [...list, newChannel(trackId)],
  );
}

export function updateChannel(
  owner: ChannelOwner,
  trackId: Id,
  patch: Partial<Omit<AmbientChannel, 'trackId'>>,
): void {
  editChannels(owner, (list) => list.map((c) => (c.trackId === trackId ? { ...c, ...patch } : c)));
}

export function removeChannel(owner: ChannelOwner, trackId: Id): void {
  editChannels(owner, (list) => list.filter((c) => c.trackId !== trackId));
}

/** Whether the global channels pause while this scene is open. */
export function setSceneMuteGlobal(sceneId: Id, muteGlobal: boolean): void {
  setSceneAmbientData(sceneId, (cur) => ({ ...cur, muteGlobal }));
}

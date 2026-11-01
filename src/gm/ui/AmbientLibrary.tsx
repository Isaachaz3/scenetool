import { AlertTriangle, MapPin, Music, Pencil, Plus, Trash2, Upload, Volume2, Youtube } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { globalChannels, sceneAmbient, trackKind } from '../../core/ambient';
import type { AmbientTrack, TrackKind } from '../../core/types';
import { formatBytes, t } from '../../i18n/ru';
import { placeSound } from '../../state/items';
import { activeScene, getGm, useGm } from '../../state/store';
import {
  addChannel,
  addFileTrack,
  addPad,
  addYouTubeTrack,
  deleteTrack,
  TrackError,
  updateTrack,
} from '../../state/tracks';
import { confirmDialog, openDialog, promptDialog, toast } from '../../state/ui';
import { useAmbient } from '../ambient';

export const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac';

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|flac)$/i.test(f.name);
}

export async function importAudioFiles(files: File[], kind: TrackKind): Promise<void> {
  for (const f of files) {
    try {
      const tr = await addFileTrack(f, kind);
      toast(t.ambient.added(tr.name));
    } catch (err) {
      console.error(err);
      toast(`${f.name}: ${t.ambient.addFailed}`, 'error');
    }
  }
}

/** Center of the GM's view, where a sound token lands from the library. */
export function viewCenter() {
  const s = getGm();
  const v = s.activeSceneId ? s.scenes[s.activeSceneId]?.gmViewport : undefined;
  return { x: v?.x ?? 0, y: v?.y ?? 0 };
}

/** Where a music track is used: the global mixer and the scenes that have it. */
function useMusicUsage(track: AmbientTrack): string[] {
  const global = useGm((s) => globalChannels(s.settings.ambient).some((c) => c.trackId === track.id));
  // A joined string: a selector must not return a new array on every call.
  const scenes = useGm((s) =>
    Object.values(s.scenes)
      .filter((sc) => sceneAmbient(sc).channels.some((c) => c.trackId === track.id))
      .map((sc) => `«${sc.name}»`)
      .join(', '),
  );
  const where = [global ? t.ambient.usedGlobal : '', scenes].filter(Boolean);
  return where.length ? [t.ambient.usedIn(where.join(', '))] : [t.ambient.unused];
}

/** Where a sound is used: the soundpad and sound tokens on scenes. */
function useSoundUsage(track: AmbientTrack): string[] {
  const onPad = useGm((s) => !!s.settings.soundpad?.pads.some((p) => p.trackId === track.id));
  const tokens = useGm((s) =>
    Object.values(s.scenes).reduce(
      (n, sc) =>
        n + Object.values(sc.items).filter((it) => it.kind === 'sound' && it.trackId === track.id).length,
      0,
    ),
  );
  const where = [onPad ? t.sounds.usedPad : '', tokens ? t.sounds.usedTokens(tokens) : ''].filter(Boolean);
  return where.length ? where : [t.sounds.unused];
}

function MusicActions({ track }: { track: AmbientTrack }) {
  const global = useGm((s) => globalChannels(s.settings.ambient).some((c) => c.trackId === track.id));
  const scene = useGm((s) => activeScene(s));
  const inScene = !!scene && sceneAmbient(scene).channels.some((c) => c.trackId === track.id);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={global}
        onClick={() => addChannel({ scope: 'global' }, track.id)}
      >
        <Plus size={14} /> {t.ambient.toGlobal}
      </button>
      {scene ? (
        <button
          type="button"
          className="btn"
          disabled={inScene}
          title={scene.name}
          onClick={() => addChannel({ scope: 'scene', sceneId: scene.id }, track.id)}
        >
          <Plus size={14} /> {t.ambient.toScene}
        </button>
      ) : null}
    </>
  );
}

function SoundActions({ track }: { track: AmbientTrack }) {
  const onPad = useGm((s) => !!s.settings.soundpad?.pads.some((p) => p.trackId === track.id));
  const hasScene = useGm((s) => !!s.activeSceneId);
  return (
    <>
      <button type="button" className="btn" disabled={onPad} onClick={() => void addPad(track.id)}>
        <Plus size={14} /> {t.sounds.toPad}
      </button>
      {hasScene ? (
        <button
          type="button"
          className="btn"
          title={t.sounds.gmOnly}
          onClick={() => {
            placeSound(track.id, viewCenter());
            openDialog(null);
          }}
        >
          <MapPin size={14} /> {t.sounds.toScene}
        </button>
      ) : null}
    </>
  );
}

function Row({ track, kind }: { track: AmbientTrack; kind: TrackKind }) {
  const soundUsage = useSoundUsage(track);
  const musicUsage = useMusicUsage(track);
  const usage = kind === 'sound' ? soundUsage : musicUsage;
  const problem = useAmbient((s) => s.errors[track.id]);
  return (
    <li className="lib-row">
      <span className="lib-icon">
        {track.source === 'youtube' ? (
          <Youtube size={20} />
        ) : kind === 'sound' ? (
          <Volume2 size={20} />
        ) : (
          <Music size={20} />
        )}
      </span>
      <div className="lib-info">
        <span className="lib-name" title={track.name}>
          {track.name}
        </span>
        <span className="muted lib-meta">
          {track.source === 'youtube' ? (
            <a href={`https://www.youtube.com/watch?v=${track.youtubeId}`} target="_blank" rel="noreferrer">
              youtu.be/{track.youtubeId}
            </a>
          ) : (
            `${track.mime ?? ''} · ${formatBytes(track.size ?? 0)}`
          )}
          {' · '}
          {usage.join(' · ')}
        </span>
        {problem ? (
          <span className="warn lib-problem">
            <AlertTriangle size={12} /> {t.ambient.problems[problem]}
          </span>
        ) : null}
      </div>
      {kind === 'sound' ? <SoundActions track={track} /> : <MusicActions track={track} />}
      <button
        type="button"
        className="icon-btn small"
        aria-label={t.ambient.rename}
        title={t.ambient.rename}
        onClick={async () => {
          const name = await promptDialog(t.ambient.rename, track.name);
          if (name?.trim()) void updateTrack(track.id, { name: name.trim() });
        }}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className="icon-btn small"
        aria-label={t.ambient.delete}
        title={t.ambient.delete}
        onClick={async () => {
          if (await confirmDialog(t.ambient.deleteConfirm(track.name))) void deleteTrack(track.id);
        }}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

/**
 * Asset manager tab of one sound library: music for the ambient mixer, or short sounds for the
 * soundpad and the sound tokens. Both hold YouTube links and audio files.
 */
export function AmbientLibrary({ kind }: { kind: TrackKind }) {
  const trackMap = useGm((s) => s.tracks);
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(trackMap)
      .filter((tr) => trackKind(tr) === kind && (!q || tr.name.toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [trackMap, kind, query]);

  const addLink = async () => {
    setBusy(true);
    try {
      const tr = await addYouTubeTrack(link, t.ambient.badLink, kind);
      setLink('');
      toast(t.ambient.added(tr.name));
    } catch (err) {
      toast(err instanceof TrackError ? err.message : t.ambient.addFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="am-main lib"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files].filter(isAudioFile);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        void importAudioFiles(files, kind);
      }}
    >
      <div className="am-head">
        <input
          className="search-input"
          placeholder={t.dock.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <form
          className="lib-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) void addLink();
          }}
        >
          <input
            className="text-input"
            placeholder={t.ambient.linkPlaceholder}
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button type="submit" className="btn" disabled={busy || !link.trim()}>
            <Youtube size={16} /> {t.ambient.addLink}
          </button>
        </form>
        <button type="button" className="btn primary" onClick={() => fileInput.current?.click()}>
          <Upload size={16} /> {t.ambient.addFile}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void importAudioFiles(files, kind);
          }}
        />
      </div>
      {tracks.length === 0 && !query ? (
        <div className="tray-empty">{kind === 'sound' ? t.sounds.empty : t.ambient.empty}</div>
      ) : null}
      <ul className="lib-list">
        {tracks.map((tr) => (
          <Row key={tr.id} track={tr} kind={kind} />
        ))}
      </ul>
      <p className="muted ambient-note">{kind === 'sound' ? t.sounds.libraryHint : t.ambient.libraryHint}</p>
    </div>
  );
}

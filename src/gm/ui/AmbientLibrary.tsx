import { Music, Pencil, Plus, Trash2, Upload, Youtube } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { globalChannels, sceneAmbient } from '../../core/ambient';
import type { AmbientTrack } from '../../core/types';
import { formatBytes, t } from '../../i18n/ru';
import { activeScene, useGm } from '../../state/store';
import {
  addChannel,
  addFileTrack,
  addYouTubeTrack,
  deleteTrack,
  TrackError,
  updateTrack,
} from '../../state/tracks';
import { confirmDialog, promptDialog, toast } from '../../state/ui';

export const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac';

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|flac)$/i.test(f.name);
}

export async function importAudioFiles(files: File[]): Promise<void> {
  for (const f of files) {
    try {
      const tr = await addFileTrack(f);
      toast(t.ambient.added(tr.name));
    } catch (err) {
      console.error(err);
      toast(`${f.name}: ${t.ambient.addFailed}`, 'error');
    }
  }
}

/** Where a track is used: the global mixer and the scenes that have it. */
function useUsage(track: AmbientTrack) {
  const global = useGm((s) => globalChannels(s.settings.ambient).some((c) => c.trackId === track.id));
  // A joined string: a selector must not return a new array on every call.
  const scenes = useGm((s) =>
    Object.values(s.scenes)
      .filter((sc) => sceneAmbient(sc).channels.some((c) => c.trackId === track.id))
      .map((sc) => `«${sc.name}»`)
      .join(', '),
  );
  return { global, scenes };
}

function Row({ track, query }: { track: AmbientTrack; query: string }) {
  const { global, scenes } = useUsage(track);
  const scene = useGm((s) => activeScene(s));
  const inScene = !!scene && sceneAmbient(scene).channels.some((c) => c.trackId === track.id);
  if (query && !track.name.toLowerCase().includes(query)) return null;
  const usage = [global ? t.ambient.usedGlobal : '', scenes].filter(Boolean);
  return (
    <li className="lib-row">
      <span className="lib-icon">
        {track.source === 'youtube' ? <Youtube size={20} /> : <Music size={20} />}
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
          {usage.length ? t.ambient.usedIn(usage.join(', ')) : t.ambient.unused}
        </span>
      </div>
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

/** Asset manager tab: YouTube links and audio files of the ambient mixer. */
export function AmbientLibrary() {
  const trackMap = useGm((s) => s.tracks);
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tracks = useMemo(() => Object.values(trackMap).sort((a, b) => b.createdAt - a.createdAt), [trackMap]);

  const addLink = async () => {
    setBusy(true);
    try {
      const tr = await addYouTubeTrack(link, t.ambient.badLink);
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
        void importAudioFiles(files);
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
            void importAudioFiles(files);
          }}
        />
      </div>
      {tracks.length === 0 ? <div className="tray-empty">{t.ambient.empty}</div> : null}
      <ul className="lib-list">
        {tracks.map((tr) => (
          <Row key={tr.id} track={tr} query={query.trim().toLowerCase()} />
        ))}
      </ul>
      <p className="muted ambient-note">{t.ambient.libraryHint}</p>
    </div>
  );
}

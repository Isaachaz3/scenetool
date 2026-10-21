import { Music, Pause, Pencil, Play, Plus, Trash2, Upload, Youtube } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AmbientTrack } from '../../core/types';
import { t } from '../../i18n/ru';
import { activeScene, useGm } from '../../state/store';
import {
  addFileTrack,
  addYouTubeTrack,
  deleteTrack,
  setAmbient,
  setSceneAmbient,
  TrackError,
  updateTrack,
} from '../../state/tracks';
import { confirmDialog, promptDialog, toast } from '../../state/ui';
import { useAmbient } from '../ambient';
import { useClickOutside } from './common';

const pct = (v: number) => Math.round(v * 100);

function TrackRow({ track }: { track: AmbientTrack }) {
  return (
    <li className="ambient-track">
      <span className="ambient-track-icon" title={track.source === 'youtube' ? 'YouTube' : track.mime}>
        {track.source === 'youtube' ? <Youtube size={16} /> : <Music size={16} />}
      </span>
      <span className="ambient-track-name" title={track.name}>
        {track.name}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pct(track.volume)}
        title={t.ambient.trackVolume(pct(track.volume))}
        aria-label={t.ambient.trackVolume(pct(track.volume))}
        onChange={(e) => void updateTrack(track.id, { volume: Number(e.target.value) / 100 })}
      />
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

function TrackSelect({
  value,
  none,
  onChange,
  tracks,
}: {
  value: string;
  none: string;
  onChange: (id: string | null) => void;
  tracks: AmbientTrack[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{none}</option>
      {tracks.map((tr) => (
        <option key={tr.id} value={tr.id}>
          {tr.name}
        </option>
      ))}
    </select>
  );
}

/** Ambient sound: master volume and pause, the global and the scene track, the library. */
function Panel() {
  const ambient = useGm((s) => s.settings.ambient);
  const trackMap = useGm((s) => s.tracks);
  const scene = useGm((s) => activeScene(s));
  const playing = useAmbient((s) => s.playing);
  const blocked = useAmbient((s) => s.blocked);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tracks = Object.values(trackMap).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const now = playing ? trackMap[playing.trackId] : undefined;

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
    <div className="panel ambient-panel">
      <div className="ambient-head">
        <button
          type="button"
          className="icon-btn"
          aria-label={ambient.muted ? t.ambient.play : t.ambient.pause}
          title={ambient.muted ? t.ambient.play : t.ambient.pause}
          onClick={() => void setAmbient({ muted: !ambient.muted })}
        >
          {ambient.muted ? <Play size={18} /> : <Pause size={18} />}
        </button>
        <input
          type="range"
          className="grow"
          min={0}
          max={100}
          value={pct(ambient.volume)}
          aria-label={t.ambient.volume}
          onChange={(e) => void setAmbient({ volume: Number(e.target.value) / 100 })}
        />
        <span className="ambient-volume">{pct(ambient.volume)}%</span>
      </div>
      <p className="ambient-now">
        {now ? t.ambient.nowPlaying(now.name, playing!.slot === 'scene', ambient.muted) : t.ambient.silence}
      </p>
      {blocked && !ambient.muted ? <p className="warn ambient-note">{t.ambient.blocked}</p> : null}

      <label className="ambient-field">
        <span>{t.ambient.global}</span>
        <TrackSelect
          value={ambient.globalTrackId ?? ''}
          none={t.ambient.none}
          tracks={tracks}
          onChange={(id) => void setAmbient({ globalTrackId: id })}
        />
      </label>
      {scene ? (
        <label className="ambient-field">
          <span>{t.ambient.scene(scene.name)}</span>
          <TrackSelect
            value={scene.ambientTrackId ?? ''}
            none={t.ambient.sceneNone}
            tracks={tracks}
            onChange={(id) => setSceneAmbient(scene.id, id)}
          />
        </label>
      ) : null}

      <h4>{t.ambient.library}</h4>
      {tracks.length === 0 ? <p className="muted ambient-note">{t.ambient.empty}</p> : null}
      <ul className="ambient-tracks">
        {tracks.map((tr) => (
          <TrackRow key={tr.id} track={tr} />
        ))}
      </ul>
      <form
        className="ambient-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) void addLink();
        }}
      >
        <input
          className="text-input grow"
          placeholder={t.ambient.linkPlaceholder}
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy || !link.trim()}>
          <Plus size={16} /> {t.ambient.addLink}
        </button>
      </form>
      <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
        <Upload size={16} /> {t.ambient.addFile}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.mp3,.ogg,.wav,.m4a,.flac"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          for (const f of files) {
            try {
              const tr = await addFileTrack(f);
              toast(t.ambient.added(tr.name));
            } catch (err) {
              console.error(err);
              toast(`${f.name}: ${t.ambient.addFailed}`, 'error');
            }
          }
        }}
      />
      <p className="muted ambient-note">{t.ambient.hint}</p>
    </div>
  );
}

/** Status-row button: what is playing; opens the ambient panel. */
export function AmbientChip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const playing = useAmbient((s) => s.playing);
  const muted = useGm((s) => s.settings.ambient.muted);
  const name = useGm((s) => (playing ? s.tracks[playing.trackId]?.name : undefined));
  useClickOutside(ref, () => setOpen(false), open);
  const on = !!name && !muted;
  return (
    <div className="ambient-wrap" ref={ref}>
      {open ? <Panel /> : null}
      <button
        type="button"
        className={'panel status-chip ambient-chip' + (on ? ' on' : '')}
        title={name ? t.ambient.nowPlaying(name, playing!.slot === 'scene', muted) : t.ambient.title}
        onClick={() => setOpen(!open)}
      >
        <Music size={16} />
        <span>{on ? name : t.ambient.title}</span>
      </button>
    </div>
  );
}

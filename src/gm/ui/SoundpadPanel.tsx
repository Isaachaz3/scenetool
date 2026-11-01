import { Library, Play, Plus, Square, Volume2, X, Youtube } from 'lucide-react';
import { useRef, useState } from 'react';
import { faderToDb, formatDb, trackKind } from '../../core/ambient';
import type { SoundPad } from '../../core/types';
import { t } from '../../i18n/ru';
import { useGm } from '../../state/store';
import { addPad, removePad, setSoundpad, updatePad } from '../../state/tracks';
import { openDialog } from '../../state/ui';
import { DEFAULT_SOUNDPAD, stopAllSounds, toggleSound, useSoundpad } from '../soundpad';
import { useClickOutside } from './common';

function Pad({ pad }: { pad: SoundPad }) {
  const track = useGm((s) => s.tracks[pad.trackId]);
  const playing = useSoundpad((s) => !!s.playing[pad.trackId]);
  if (!track) return null;
  return (
    <div className={'pad' + (playing ? ' on' : '')}>
      <button
        type="button"
        className="pad-main"
        title={playing ? t.sounds.stop(track.name) : t.sounds.play(track.name)}
        onClick={() => void toggleSound(track.id)}
      >
        {playing ? (
          <Square size={18} />
        ) : track.source === 'youtube' ? (
          <Youtube size={18} />
        ) : (
          <Play size={18} />
        )}
        <span className="pad-name">{track.name}</span>
      </button>
      <div className="pad-foot">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(pad.volume * 1000)}
          title={`${t.sounds.padVolume(track.name)}: ${formatDb(faderToDb(pad.volume))}`}
          aria-label={t.sounds.padVolume(track.name)}
          onChange={(e) => void updatePad(track.id, { volume: Number(e.target.value) / 1000 })}
          onDoubleClick={() => void updatePad(track.id, { volume: 1 })}
        />
        <button
          type="button"
          className="icon-btn small"
          aria-label={t.sounds.removePad}
          title={t.sounds.removePad}
          onClick={() => void removePad(track.id)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** Buttons that play short sounds once, apart from the ambient mixer. */
function Soundpad() {
  const settings = useGm((s) => s.settings.soundpad ?? DEFAULT_SOUNDPAD);
  const trackMap = useGm((s) => s.tracks);
  const anyPlaying = useSoundpad((s) => Object.keys(s.playing).length > 0);
  const pads = settings.pads.filter((p) => trackMap[p.trackId]);
  const taken = new Set(pads.map((p) => p.trackId));
  const free = Object.values(trackMap)
    .filter((tr) => trackKind(tr) === 'sound' && !taken.has(tr.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return (
    <div className="panel soundpad">
      <div className="mixer-head">
        <h4>{t.sounds.soundpad}</h4>
        <label className="soundpad-volume" title={formatDb(faderToDb(settings.volume))}>
          <Volume2 size={16} />
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(settings.volume * 1000)}
            aria-label={t.sounds.volume}
            onChange={(e) => void setSoundpad({ volume: Number(e.target.value) / 1000 })}
            onDoubleClick={() => void setSoundpad({ volume: 1 })}
          />
        </label>
        <button type="button" className="btn" disabled={!anyPlaying} onClick={stopAllSounds}>
          <Square size={14} /> {t.sounds.stopAll}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => openDialog({ kind: 'assetManager', tab: 'sounds' })}
        >
          <Library size={16} /> {t.sounds.library}
        </button>
      </div>
      <div className="pads">
        {pads.map((p) => (
          <Pad key={p.trackId} pad={p} />
        ))}
        <label className="pad add" title={t.sounds.addPad}>
          <Plus size={18} />
          <span>{t.sounds.addPad}</span>
          <select
            value=""
            disabled={free.length === 0}
            onChange={(e) => e.target.value && void addPad(e.target.value)}
          >
            <option value="">{free.length ? t.sounds.pickSound : t.sounds.noFree}</option>
            {free.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted ambient-note">{t.sounds.hint}</p>
    </div>
  );
}

export function SoundpadChip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const playing = useSoundpad((s) => Object.keys(s.playing).length);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div className="ambient-wrap" ref={ref}>
      {open ? <Soundpad /> : null}
      <button
        type="button"
        className={'panel status-chip ambient-chip' + (playing ? ' on' : '')}
        onClick={() => setOpen(!open)}
      >
        <Volume2 size={16} />
        <span>{t.sounds.title}</span>
      </button>
    </div>
  );
}

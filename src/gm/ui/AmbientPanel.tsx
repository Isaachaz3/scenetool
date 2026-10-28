import {
  AlertTriangle,
  Eye,
  EyeOff,
  Library,
  Music,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  dbToMeter,
  faderToDb,
  formatDb,
  globalChannels,
  sceneAmbient,
  youTubeStateName,
  type AmbientSlot,
} from '../../core/ambient';
import type { AmbientChannel, AmbientTrack, Id } from '../../core/types';
import { t } from '../../i18n/ru';
import { activeScene, useGm } from '../../state/store';
import {
  addChannel,
  removeChannel,
  setAmbient,
  setSceneMuteGlobal,
  updateChannel,
  type ChannelOwner,
} from '../../state/tracks';
import { openDialog } from '../../state/ui';
import { channelLevel, masterLevel, toggleYouTubePlayers, useAmbient } from '../ambient';
import { useClickOutside } from './common';

const DECAY_DB_PER_FRAME = 1.2;

/** OBS-like level meter: green up to −20 dB, yellow to −9, red above; falls back smoothly. */
function Meter({ read }: { read: () => number | null }) {
  const fill = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = -Infinity;
    const frame = () => {
      const db = read();
      if (box.current) box.current.classList.toggle('off', db === null);
      shown = db === null ? -Infinity : Math.max(db, shown - DECAY_DB_PER_FRAME);
      if (fill.current) fill.current.style.height = `${(1 - dbToMeter(shown)) * 100}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [read]);
  return (
    <span className="meter-v" ref={box} title={t.ambient.meterHint}>
      <span className="meter-v-cover" ref={fill} />
    </span>
  );
}

function Fader({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="range"
      className="fader"
      min={0}
      max={1000}
      value={Math.round(value * 1000)}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) / 1000)}
      onDoubleClick={() => onChange(1)}
    />
  );
}

function Strip({
  slot,
  owner,
  channel,
  track,
}: {
  slot: AmbientSlot;
  owner: ChannelOwner;
  channel: AmbientChannel;
  track: AmbientTrack;
}) {
  const read = useRef(() => channelLevel(slot, track.id)).current;
  const problem = useAmbient((s) => s.errors[track.id]);
  const ytState = useAmbient((s) => s.ytStates[track.id]);
  const status =
    track.source !== 'youtube'
      ? undefined
      : ytState === undefined
        ? t.ambient.ytLoading
        : t.ambient.ytState[youTubeStateName(ytState)];
  return (
    <div
      className={'strip ' + slot + (problem ? ' broken' : '')}
      title={problem ? t.ambient.problems[problem] : undefined}
    >
      <div className="strip-badge">{slot === 'global' ? t.ambient.globalBadge : t.ambient.sceneBadge}</div>
      <div className="strip-name" title={status ? `${track.name}\n${status}` : track.name}>
        {track.name}
      </div>
      {status ? <div className="strip-status">{status.replace('YouTube: ', '')}</div> : null}
      <div className="strip-db">
        {problem ? <AlertTriangle size={12} className="strip-warn" /> : null}
        {formatDb(faderToDb(channel.volume))}
      </div>
      <div className="strip-body">
        <Fader
          value={channel.volume}
          label={t.ambient.fader(track.name)}
          onChange={(volume) => updateChannel(owner, track.id, { volume })}
        />
        <Meter read={read} />
      </div>
      <div className="strip-foot">
        <button
          type="button"
          className={'icon-btn small' + (channel.muted ? ' danger' : '')}
          aria-label={channel.muted ? t.ambient.unmute : t.ambient.mute}
          title={channel.muted ? t.ambient.unmute : t.ambient.mute}
          onClick={() => updateChannel(owner, track.id, { muted: !channel.muted })}
        >
          {channel.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          type="button"
          className="icon-btn small"
          aria-label={t.ambient.removeChannel}
          title={t.ambient.removeChannel}
          onClick={() => removeChannel(owner, track.id)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** "+" strip: a select over the library that adds a channel. */
function AddStrip({ owner, taken, tracks }: { owner: ChannelOwner; taken: Set<Id>; tracks: AmbientTrack[] }) {
  const free = tracks.filter((tr) => !taken.has(tr.id));
  return (
    <label className="strip add" title={t.ambient.addChannel}>
      <Plus size={18} />
      <span>{t.ambient.addChannel}</span>
      <select
        value=""
        disabled={free.length === 0}
        onChange={(e) => e.target.value && addChannel(owner, e.target.value)}
      >
        <option value="">{free.length ? t.ambient.pickTrack : t.ambient.noFreeTracks}</option>
        {free.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The mixer: global strips, the open scene's strips and the master, like the OBS audio mixer. */
function Mixer() {
  const ambient = useGm((s) => s.settings.ambient);
  const trackMap = useGm((s) => s.tracks);
  const scene = useGm((s) => activeScene(s));
  const blocked = useAmbient((s) => s.blocked);
  const showPlayers = useAmbient((s) => s.showPlayers);
  const tracks = Object.values(trackMap).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const global = globalChannels(ambient).filter((c) => trackMap[c.trackId]);
  const sa = sceneAmbient(scene);
  const sceneChannels = sa.channels.filter((c) => trackMap[c.trackId]);
  const readMaster = useRef(masterLevel).current;
  const hasYouTube = [...global, ...sceneChannels].some((c) => trackMap[c.trackId]?.source === 'youtube');
  const globalOwner: ChannelOwner = { scope: 'global' };

  return (
    <div className="panel mixer">
      <div className="mixer-head">
        <h4>{t.ambient.mixer}</h4>
        {hasYouTube ? (
          <button
            type="button"
            className="btn"
            title={t.ambient.showPlayersHint}
            onClick={toggleYouTubePlayers}
          >
            {showPlayers ? <EyeOff size={16} /> : <Eye size={16} />}{' '}
            {showPlayers ? t.ambient.hidePlayers : t.ambient.showPlayers}
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          onClick={() => openDialog({ kind: 'assetManager', tab: 'ambient' })}
        >
          <Library size={16} /> {t.ambient.library}
        </button>
      </div>
      {blocked && !ambient.muted ? <p className="warn ambient-note">{t.ambient.blocked}</p> : null}
      {tracks.length === 0 ? <p className="muted ambient-note">{t.ambient.empty}</p> : null}
      <div className="mixer-strips">
        <section className="mixer-group">
          <div className="mixer-group-title">{t.ambient.globalGroup}</div>
          <div className="mixer-group-strips">
            {global.map((c) => (
              <Strip
                key={c.trackId}
                slot="global"
                owner={globalOwner}
                channel={c}
                track={trackMap[c.trackId]}
              />
            ))}
            <AddStrip owner={globalOwner} taken={new Set(global.map((c) => c.trackId))} tracks={tracks} />
          </div>
        </section>
        {scene ? (
          <section className="mixer-group">
            <div className="mixer-group-title" title={scene.name}>
              {t.ambient.sceneGroup(scene.name)}
            </div>
            <div className="mixer-group-strips">
              {sceneChannels.map((c) => (
                <Strip
                  key={c.trackId}
                  slot="scene"
                  owner={{ scope: 'scene', sceneId: scene.id }}
                  channel={c}
                  track={trackMap[c.trackId]}
                />
              ))}
              <AddStrip
                owner={{ scope: 'scene', sceneId: scene.id }}
                taken={new Set(sceneChannels.map((c) => c.trackId))}
                tracks={tracks}
              />
            </div>
            <label className="mixer-check">
              <input
                type="checkbox"
                checked={sa.muteGlobal}
                onChange={(e) => setSceneMuteGlobal(scene.id, e.target.checked)}
              />
              {t.ambient.muteGlobal}
            </label>
          </section>
        ) : null}
        <section className="mixer-group master">
          <div className="mixer-group-title">{t.ambient.master}</div>
          <div className="strip master">
            <div className="strip-badge">{t.ambient.masterBadge}</div>
            <div className="strip-name">{t.ambient.masterName}</div>
            <div className="strip-db">{formatDb(faderToDb(ambient.volume))}</div>
            <div className="strip-body">
              <Fader
                value={ambient.volume}
                label={t.ambient.volume}
                onChange={(volume) => void setAmbient({ volume })}
              />
              <Meter read={readMaster} />
            </div>
            <div className="strip-foot">
              <button
                type="button"
                className={'icon-btn small' + (ambient.muted ? ' danger' : '')}
                aria-label={ambient.muted ? t.ambient.play : t.ambient.pause}
                title={ambient.muted ? t.ambient.play : t.ambient.pause}
                onClick={() => void setAmbient({ muted: !ambient.muted })}
              >
                {ambient.muted ? <Play size={16} /> : <Pause size={16} />}
              </button>
            </div>
          </div>
        </section>
      </div>
      <p className="muted ambient-note">{t.ambient.hint}</p>
    </div>
  );
}

/** Corner button: how many channels play; opens the mixer. */
export function AmbientChip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const muted = useGm((s) => s.settings.ambient.muted);
  const count = useGm((s) => {
    const sa = sceneAmbient(activeScene(s));
    const sceneOn = sa.channels.filter((c) => s.tracks[c.trackId] && !c.muted).length;
    const globalOn =
      sa.channels.some((c) => s.tracks[c.trackId]) && sa.muteGlobal
        ? 0
        : globalChannels(s.settings.ambient).filter((c) => s.tracks[c.trackId] && !c.muted).length;
    return sceneOn + globalOn;
  });
  useClickOutside(ref, () => setOpen(false), open);
  const on = count > 0 && !muted;
  return (
    <div className="ambient-wrap" ref={ref}>
      {open ? <Mixer /> : null}
      <button
        type="button"
        className={'panel status-chip ambient-chip' + (on ? ' on' : '')}
        title={t.ambient.title}
        onClick={() => setOpen(!open)}
      >
        <Music size={16} />
        <span>{muted ? t.ambient.paused : on ? t.ambient.playing(count) : t.ambient.title}</span>
      </button>
    </div>
  );
}

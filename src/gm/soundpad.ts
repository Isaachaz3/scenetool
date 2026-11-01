import { create } from 'zustand';
import { faderToGain } from '../core/ambient';
import type { AmbientTrack, Id, SoundpadSettings } from '../core/types';
import { getGm, useGm } from '../state/store';
import { getTrackBlob } from '../state/tracks';
import { sharedAudio, youTubeSource, type Source } from './ambient';

export const DEFAULT_SOUNDPAD: SoundpadSettings = { pads: [], volume: 0.85 };
const STOP_FADE_S = 0.3; // a stopped sound fades out quickly instead of clicking

export function soundpadSettings(): SoundpadSettings {
  return getGm().settings.soundpad ?? DEFAULT_SOUNDPAD;
}

/** Tracks playing right now (count of instances), for the pads and the sound tokens. */
export const useSoundpad = create<{ playing: Record<Id, number> }>(() => ({ playing: {} }));

function bump(trackId: Id, d: number) {
  const playing = { ...useSoundpad.getState().playing };
  const n = (playing[trackId] ?? 0) + d;
  if (n > 0) playing[trackId] = n;
  else delete playing[trackId];
  useSoundpad.setState({ playing });
}

// --- output: every one-shot → its gain → soundpad master → speakers (apart from the ambient) ---

let out: GainNode | null = null;

function output(): { ctx: AudioContext; out: GainNode } {
  const ctx = sharedAudio();
  if (!out) {
    out = ctx.createGain();
    out.gain.value = faderToGain(soundpadSettings().volume);
    out.connect(ctx.destination);
  }
  return { ctx, out };
}

function padGain(trackId: Id): number {
  const pad = soundpadSettings().pads.find((p) => p.trackId === trackId);
  return faderToGain(pad?.volume ?? 1);
}

interface Shot {
  stop(): void;
}

const shots = new Map<Id, Set<Shot>>();
const urls = new Map<Id, string>(); // object URLs of audio files, kept for quick replays

async function fileShot(track: AmbientTrack): Promise<Shot | null> {
  let url = urls.get(track.id);
  if (!url) {
    const blob = await getTrackBlob(track);
    if (!blob) return null;
    url = URL.createObjectURL(blob);
    urls.set(track.id, url);
  }
  const { ctx, out: dest } = output();
  const el = new Audio(url);
  const node = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  gain.gain.value = padGain(track.id);
  node.connect(gain).connect(dest);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.pause();
    node.disconnect();
    gain.disconnect();
    shots.get(track.id)?.delete(shot);
    bump(track.id, -1);
  };
  const shot: Shot = {
    stop() {
      gain.gain.setTargetAtTime(0, ctx.currentTime, STOP_FADE_S / 3);
      setTimeout(finish, STOP_FADE_S * 1000);
    },
  };
  el.addEventListener('ended', finish);
  el.addEventListener('error', finish);
  await el.play().catch(finish);
  return done ? null : shot;
}

/**
 * YouTube sounds keep one player per track for the session: after its first click in the
 * player (YouTube's rule) it plays on demand. A sound plays once, from the start.
 */
const ytPlayers = new Map<Id, { source: Source; ended: { run: () => void } }>();

function youTubeShot(track: AmbientTrack): Shot {
  let entry = ytPlayers.get(track.id);
  if (!entry) {
    const ended = { run: () => {} };
    const source = youTubeSource(track, {
      loop: false,
      level: () => faderToGain(soundpadSettings().volume),
      onEnded: () => ended.run(),
    });
    entry = { source, ended };
    ytPlayers.set(track.id, entry);
  }
  const { source } = entry;
  // One player per track: a new press restarts it.
  for (const s of [...(shots.get(track.id) ?? [])]) s.stop();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    shots.get(track.id)?.delete(shot);
    bump(track.id, -1);
  };
  const shot: Shot = {
    stop() {
      source.pause();
      source.rewind?.();
      finish();
    },
  };
  entry.ended.run = () => {
    source.rewind?.();
    finish();
  };
  source.rewind?.();
  source.setGain(padGain(track.id), 0);
  source.play();
  return shot;
}

/** Plays a sound once. Pressing a sound that is playing stops it instead. */
export async function toggleSound(trackId: Id): Promise<void> {
  if (useSoundpad.getState().playing[trackId]) {
    stopSound(trackId);
    return;
  }
  const track = getGm().tracks[trackId];
  if (!track) return;
  bump(trackId, 1);
  const shot = track.source === 'youtube' ? youTubeShot(track) : await fileShot(track);
  if (!shot) {
    bump(trackId, -1);
    return;
  }
  const set = shots.get(trackId) ?? new Set<Shot>();
  set.add(shot);
  shots.set(trackId, set);
}

export function stopSound(trackId: Id): void {
  for (const s of [...(shots.get(trackId) ?? [])]) s.stop();
}

export function stopAllSounds(): void {
  for (const id of [...shots.keys()]) stopSound(id);
}

/** Follows the soundpad volume and drops players and files of deleted tracks. */
export function initSoundpad(): void {
  useGm.subscribe((s, prev) => {
    if (s.settings.soundpad !== prev.settings.soundpad && out) {
      out.gain.setTargetAtTime(faderToGain(soundpadSettings().volume), out.context.currentTime, 0.03);
    }
    if (s.tracks !== prev.tracks) {
      for (const [id, url] of urls) {
        if (!s.tracks[id]) {
          stopSound(id);
          URL.revokeObjectURL(url);
          urls.delete(id);
        }
      }
      for (const [id, e] of ytPlayers) {
        if (!s.tracks[id]) {
          e.source.destroy();
          ytPlayers.delete(id);
        }
      }
    }
  });
}

// Ambient sound: which track plays and how YouTube links are read.
import type { AmbientChannel, AmbientSettings, AmbientTrack, Id, Scene, SceneAmbient } from './types';

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Video id of a YouTube link (watch, youtu.be, shorts, embed, live, music) or of a bare id. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
    if (!id && m) id = m[1];
  }
  return id && ID.test(id) ? id : null;
}

export type AmbientSlot = 'global' | 'scene';

const FLOOR_DB = -60;

/** Fader position (0..1) to dB, OBS style: linear in dB from −60 to 0; 0 is silence. */
export function faderToDb(v: number): number {
  return v <= 0 ? -Infinity : (1 - Math.min(1, v)) * FLOOR_DB;
}

export function faderToGain(v: number): number {
  const db = faderToDb(v);
  return db === -Infinity ? 0 : 10 ** (db / 20);
}

export function formatDb(db: number): string {
  return db === -Infinity ? '−∞ dB' : `${db.toFixed(1).replace('-', '−').replace('.', ',')} dB`;
}

/** Meter position (0..1) of a level in dB, on the same −60..0 scale as the faders. */
export function dbToMeter(db: number): number {
  return db <= FLOOR_DB ? 0 : Math.min(1, 1 - db / FLOOR_DB);
}

/** Global channels, also from settings saved before the mixer. */
export function globalChannels(a: AmbientSettings): AmbientChannel[] {
  if (a.channels) return a.channels;
  return a.globalTrackId ? [{ trackId: a.globalTrackId, volume: 1, muted: false }] : [];
}

/** Scene channels, also from scenes saved before the mixer (one track that replaced the global). */
export function sceneAmbient(scene: Scene | null | undefined): SceneAmbient {
  if (scene?.ambient) return scene.ambient;
  if (scene?.ambientTrackId)
    return { channels: [{ trackId: scene.ambientTrackId, volume: 1, muted: false }], muteGlobal: true };
  return { channels: [], muteGlobal: true };
}

export interface VoicePlan {
  slot: AmbientSlot;
  trackId: Id;
  active: boolean; // false: silent and paused (a global channel muted by the scene)
  gain: number; // channel gain, before the master (0 while muted)
  muted: boolean;
}

/** Fades: the mute buttons are slow on purpose; faders follow the hand. */
export const FADE = { mute: 5, scene: 1.5, fader: 0.08 };

const FADE_FLOOR = 10 ** (FLOOR_DB / 20); // −60 dB: silence for the ear

/**
 * Gain `elapsed` seconds into a fade from `from` to `to` lasting `duration` seconds. The level
 * moves evenly in dB, as the ear hears it (a linear gain fade sounds flat, then drops at once);
 * silence counts as −60 dB and is reached exactly at the end.
 */
export function fadeAt(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  const k = Math.max(0, elapsed) / duration;
  const a = 20 * Math.log10(Math.max(from, FADE_FLOOR));
  const b = 20 * Math.log10(Math.max(to, FADE_FLOOR));
  const g = 10 ** ((a + (b - a) * k) / 20);
  return g <= FADE_FLOOR ? 0 : g;
}

/**
 * What the mixer plays: every global channel, paused while the open scene has channels and
 * mutes the global ones, plus the scene's channels. Tracks that are gone are left out.
 */
export function mixPlan(
  global: AmbientChannel[],
  scene: SceneAmbient,
  tracks: Record<Id, AmbientTrack>,
): VoicePlan[] {
  const exists = (c: AmbientChannel) => !!tracks[c.trackId];
  const sceneOn = scene.channels.filter(exists);
  const ducked = sceneOn.length > 0 && scene.muteGlobal;
  const gain = (c: AmbientChannel) => (c.muted ? 0 : faderToGain(c.volume));
  return [
    ...global.filter(exists).map((c) => ({
      slot: 'global' as const,
      trackId: c.trackId,
      active: !ducked,
      gain: gain(c),
      muted: c.muted,
    })),
    ...sceneOn.map((c) => ({
      slot: 'scene' as const,
      trackId: c.trackId,
      active: true,
      gain: gain(c),
      muted: c.muted,
    })),
  ];
}

/** Words for a YouTube player state (IFrame API numbers). */
export type YouTubeStateName = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

export function youTubeStateName(state: number): YouTubeStateName {
  return (['ended', 'playing', 'paused', 'buffering', 'unstarted', 'cued'] as const)[state] ?? 'unstarted';
}

/** Why a YouTube video cannot play here, from the IFrame API error code. */
export type YouTubeProblem = 'embed' | 'missing' | 'broken' | 'unavailable';

export function youTubeProblem(code: number): YouTubeProblem {
  if (code === 101 || code === 150 || code === 153) return 'embed'; // the owner forbids embedding
  if (code === 100) return 'missing'; // removed or private
  if (code === 2) return 'broken'; // bad video id
  return 'unavailable'; // 5: the HTML5 player failed
}

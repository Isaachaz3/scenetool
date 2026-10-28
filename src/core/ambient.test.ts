import { describe, expect, it } from 'vitest';
import {
  youTubeProblem,
  dbToMeter,
  faderToDb,
  faderToGain,
  formatDb,
  globalChannels,
  mixPlan,
  parseYouTubeId,
  sceneAmbient,
} from './ambient';
import type { AmbientTrack, Scene } from './types';

const track = (id: string): AmbientTrack => ({
  id,
  name: id,
  source: 'youtube',
  youtubeId: 'dQw4w9WgXcQ',
  volume: 1,
  createdAt: 0,
  updatedAt: 0,
});
const ch = (trackId: string, volume = 1, muted = false) => ({ trackId, volume, muted });

describe('ambient', () => {
  it('reads YouTube links of every common shape', () => {
    const id = 'dQw4w9WgXcQ';
    for (const link of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}&si=abc`,
      `https://youtu.be/${id}?si=xyz`,
      `youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}?feature=share`,
      id,
    ]) {
      expect(parseYouTubeId(link), link).toBe(id);
    }
    expect(parseYouTubeId('https://vimeo.com/123')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('не ссылка')).toBeNull();
  });

  it('maps faders to dB like OBS', () => {
    expect(faderToDb(1)).toBeCloseTo(0);
    expect(faderToDb(0.5)).toBe(-30);
    expect(faderToDb(0)).toBe(-Infinity);
    expect(faderToGain(1)).toBe(1);
    expect(faderToGain(0.9)).toBeCloseTo(0.5012, 3); // −6 dB
    expect(faderToGain(0)).toBe(0);
    expect(formatDb(-4.66)).toBe('−4,7 dB');
    expect(formatDb(-Infinity)).toBe('−∞ dB');
    expect(dbToMeter(-30)).toBe(0.5);
    expect(dbToMeter(-90)).toBe(0);
  });

  it('mixes global and scene channels', () => {
    const tracks = { rain: track('rain'), tavern: track('tavern'), battle: track('battle') };
    const global = [ch('rain', 1), ch('tavern', 0.9, true)];
    // A scene without channels: globals play.
    expect(mixPlan(global, { channels: [], muteGlobal: true }, tracks)).toEqual([
      { slot: 'global', trackId: 'rain', active: true, gain: 1 },
      { slot: 'global', trackId: 'tavern', active: true, gain: 0 },
    ]);
    // Battle replaces the globals...
    const battle = mixPlan(global, { channels: [ch('battle')], muteGlobal: true }, tracks);
    expect(battle.filter((v) => v.active).map((v) => v.trackId)).toEqual(['battle']);
    // ...or plays over them.
    const layered = mixPlan(global, { channels: [ch('battle')], muteGlobal: false }, tracks);
    expect(layered.filter((v) => v.active).map((v) => v.trackId)).toEqual(['rain', 'tavern', 'battle']);
    // Deleted tracks drop out; a scene whose only track is gone does not mute the globals.
    expect(mixPlan(global, { channels: [ch('gone')], muteGlobal: true }, tracks).every((v) => v.active)).toBe(
      true,
    );
  });

  it('reads settings and scenes saved before the mixer', () => {
    expect(globalChannels({ globalTrackId: 'a', volume: 1, muted: false } as never)).toEqual([ch('a')]);
    expect(sceneAmbient({ ambientTrackId: 'b' } as Scene)).toEqual({ channels: [ch('b')], muteGlobal: true });
    expect(sceneAmbient(null)).toEqual({ channels: [], muteGlobal: true });
  });

  it('explains YouTube player errors', () => {
    expect(youTubeProblem(150)).toBe('embed');
    expect(youTubeProblem(101)).toBe('embed');
    expect(youTubeProblem(100)).toBe('missing');
    expect(youTubeProblem(2)).toBe('broken');
    expect(youTubeProblem(5)).toBe('unavailable');
  });
});

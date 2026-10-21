import { describe, expect, it } from 'vitest';
import { ambientTarget, fadeStep, parseYouTubeId } from './ambient';
import type { AmbientTrack } from './types';

const track = (id: string): AmbientTrack => ({
  id,
  name: id,
  source: 'youtube',
  youtubeId: 'dQw4w9WgXcQ',
  volume: 1,
  createdAt: 0,
  updatedAt: 0,
});

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

  it('plays the scene track over the global one', () => {
    const tracks = { a: track('a'), b: track('b') };
    expect(ambientTarget('b', 'a', tracks)).toEqual({ slot: 'scene', trackId: 'b' });
    expect(ambientTarget(undefined, 'a', tracks)).toEqual({ slot: 'global', trackId: 'a' });
    expect(ambientTarget('a', 'a', tracks)).toEqual({ slot: 'global', trackId: 'a' });
    expect(ambientTarget('gone', 'a', tracks)).toEqual({ slot: 'global', trackId: 'a' });
    expect(ambientTarget(undefined, null, tracks)).toBeNull();
  });

  it('fades without overshooting', () => {
    expect(fadeStep(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(fadeStep(0.9, 1, 0.3)).toBe(1);
    expect(fadeStep(0.2, 0, 0.3)).toBe(0);
  });
});

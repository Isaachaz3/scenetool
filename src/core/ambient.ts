// Ambient sound: which track plays and how YouTube links are read.
import type { AmbientTrack, Id } from './types';

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

/**
 * What should be heard: the scene's track while the scene has one, otherwise the global one.
 * A scene track equal to the global one keeps the global one going instead of restarting it.
 */
export function ambientTarget(
  sceneTrackId: Id | undefined,
  globalTrackId: Id | null,
  tracks: Record<Id, AmbientTrack>,
): { slot: AmbientSlot; trackId: Id } | null {
  const scene = sceneTrackId && tracks[sceneTrackId] ? sceneTrackId : null;
  const global = globalTrackId && tracks[globalTrackId] ? globalTrackId : null;
  if (scene && scene !== global) return { slot: 'scene', trackId: scene };
  return global ? { slot: 'global', trackId: global } : null;
}

/** One step of a fade: moves `level` toward `target` by `step`. */
export function fadeStep(level: number, target: number, step: number): number {
  return level < target ? Math.min(target, level + step) : Math.max(target, level - step);
}

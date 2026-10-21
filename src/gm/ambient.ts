import { create } from 'zustand';
import { ambientTarget, fadeStep, type AmbientSlot } from '../core/ambient';
import type { AmbientTrack, Id } from '../core/types';
import { activeScene, getGm, useGm } from '../state/store';
import { getTrackBlob } from '../state/tracks';

const FADE_MS = 1500;
const TICK_MS = 50;
const YT_HOST_ID = 'yt-ambient';

/** What the panel shows: the track heard now and whether the browser still blocks sound. */
export const useAmbient = create<{ playing: { trackId: Id; slot: AmbientSlot } | null; blocked: boolean }>(
  () => ({ playing: null, blocked: false }),
);

interface Source {
  volume(v: number): void; // 0..1
  play(): void;
  pause(): void;
  destroy(): void;
}

// --- audio files -----------------------------------------------------------------------------

function fileSource(track: AmbientTrack): Source {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'auto';
  let url: string | undefined;
  let wantPlay = false;
  let dead = false;
  void getTrackBlob(track).then((blob) => {
    if (!blob || dead) return;
    url = URL.createObjectURL(blob);
    audio.src = url;
    if (wantPlay) tryPlay();
  });
  const tryPlay = () => {
    if (!audio.src) return;
    audio.play().catch((err: DOMException) => {
      if (err.name === 'NotAllowedError') blockedUntilGesture();
    });
  };
  return {
    volume: (v) => (audio.volume = Math.min(1, Math.max(0, v))),
    play() {
      wantPlay = true;
      if (audio.paused) tryPlay();
    },
    pause() {
      wantPlay = false;
      audio.pause();
    },
    destroy() {
      dead = true;
      audio.pause();
      audio.removeAttribute('src');
      if (url) URL.revokeObjectURL(url);
    },
  };
}

// --- YouTube (IFrame API, looped by hand: a single video does not loop on its own) ------------

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width: number;
      height: number;
      playerVars: Record<string, number | string>;
      events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;

function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytApi ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytApi = null;
      reject(new Error('YouTube API unavailable'));
    };
    document.head.append(s);
  });
  return ytApi;
}

function ytHost(): HTMLElement {
  let host = document.getElementById(YT_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = YT_HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    document.body.append(host);
  }
  return host;
}

function youTubeSource(track: AmbientTrack): Source {
  const ENDED = 0;
  const PLAYING = 1;
  let player: YTPlayer | null = null;
  let ready = false;
  let wantPlay = false;
  let vol = 0;
  let dead = false;
  const el = document.createElement('div');
  ytHost().append(el);
  void loadYouTube()
    .then((YT) => {
      if (dead) return;
      player = new YT.Player(el, {
        videoId: track.youtubeId!,
        width: 200,
        height: 200,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady() {
            ready = true;
            player!.setVolume(Math.round(vol * 100));
            if (wantPlay) player!.playVideo();
          },
          onStateChange(e) {
            if (e.data === ENDED) {
              player!.seekTo(0, true);
              player!.playVideo();
            }
          },
        },
      });
    })
    .catch((err) => console.warn(err));
  return {
    volume(v) {
      vol = Math.min(1, Math.max(0, v));
      if (ready) player!.setVolume(Math.round(vol * 100));
    },
    play() {
      wantPlay = true;
      if (ready && player!.getPlayerState() !== PLAYING) player!.playVideo();
    },
    pause() {
      wantPlay = false;
      if (ready) player!.pauseVideo();
    },
    destroy() {
      dead = true;
      player?.destroy();
      el.remove();
    },
  };
}

// --- mixer ---------------------------------------------------------------------------------------

interface Voice {
  slot: AmbientSlot;
  track: AmbientTrack;
  source: Source;
  level: number; // fade gain
  target: number;
  playing: boolean;
}

const voices: Voice[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let gestureHooked = false;

/** Autoplay is refused until the GM clicks or presses a key: then everything resumes. */
function blockedUntilGesture() {
  useAmbient.setState({ blocked: true });
  if (gestureHooked) return;
  gestureHooked = true;
  const resume = () => {
    gestureHooked = false;
    useAmbient.setState({ blocked: false });
    window.removeEventListener('pointerdown', resume, true);
    window.removeEventListener('keydown', resume, true);
    for (const v of voices) if (v.playing) v.source.play();
  };
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);
}

function gain(v: Voice): number {
  const a = getGm().settings.ambient;
  return a.muted ? 0 : a.volume * v.track.volume * v.level;
}

function tick() {
  const step = TICK_MS / FADE_MS;
  for (const v of [...voices]) {
    v.level = fadeStep(v.level, v.target, step);
    v.source.volume(gain(v));
    if (v.level === 0 && v.target === 0) {
      const heard = useAmbient.getState().playing;
      const waits =
        (v.slot === 'global' && getGm().settings.ambient.globalTrackId === v.track.id) ||
        (heard?.slot === v.slot && heard.trackId === v.track.id); // muted: resumes where it was
      if (waits) {
        // The global ambient waits, paused, for the scene track to end.
        if (v.playing) v.source.pause();
        v.playing = false;
      } else {
        v.source.destroy();
        voices.splice(voices.indexOf(v), 1);
      }
    }
  }
  if (voices.every((v) => v.level === v.target)) {
    clearInterval(timer);
    timer = undefined;
  }
}

function startFades() {
  timer ??= setInterval(tick, TICK_MS);
}

/** Brings the voices in line with the scene, the global setting and the master volume. */
function reconcile() {
  const s = getGm();
  const a = s.settings.ambient;
  const want = a.muted ? null : ambientTarget(activeScene(s)?.ambientTrackId, a.globalTrackId, s.tracks);
  const heard = ambientTarget(activeScene(s)?.ambientTrackId, a.globalTrackId, s.tracks);
  useAmbient.setState({ playing: heard });
  for (const v of voices) {
    const current = s.tracks[v.track.id];
    if (current) v.track = current; // per-track volume and name
    const keep = want && want.slot === v.slot && want.trackId === v.track.id;
    v.target = keep ? 1 : 0;
    if (!current) v.target = 0;
  }
  if (want && !voices.some((v) => v.slot === want.slot && v.track.id === want.trackId && v.target === 1)) {
    const track = s.tracks[want.trackId];
    const source = track.source === 'youtube' ? youTubeSource(track) : fileSource(track);
    // A scene track starts from the beginning each time the scene opens.
    voices.push({ slot: want.slot, track, source, level: 0, target: 1, playing: false });
  }
  for (const v of voices) {
    if (v.target > 0 && !v.playing) {
      v.source.volume(gain(v));
      v.source.play();
      v.playing = true;
    }
    v.source.volume(gain(v));
  }
  startFades();
}

/** Starts following the store: scene switches, the ambient settings and the track library. */
export function initAmbient(): void {
  useGm.subscribe((s, prev) => {
    const scene = activeScene(s);
    const before = activeScene(prev);
    if (
      s.settings.ambient !== prev.settings.ambient ||
      s.tracks !== prev.tracks ||
      s.activeSceneId !== prev.activeSceneId ||
      scene?.ambientTrackId !== before?.ambientTrackId
    ) {
      reconcile();
    }
  });
  reconcile();
}

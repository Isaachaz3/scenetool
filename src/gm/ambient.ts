import { create } from 'zustand';
import { faderToGain, globalChannels, mixPlan, sceneAmbient, type AmbientSlot } from '../core/ambient';
import type { AmbientTrack, Id } from '../core/types';
import { activeScene, getGm, useGm } from '../state/store';
import { getTrackBlob } from '../state/tracks';

const FADE_S = 0.5; // time constant of file fades (about 1.5 s to silence)
const FADE_DONE_MS = 1800;
const YT_HOST_ID = 'yt-ambient';

/** Whether the browser still waits for a click before it lets sound play. */
export const useAmbient = create<{ blocked: boolean }>(() => ({ blocked: false }));

// --- Web Audio graph: file channels → their gain → analyser → master gain → analyser → out ------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let masterMeter: AnalyserNode | null = null;

function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    masterMeter = ctx.createAnalyser();
    masterMeter.fftSize = 1024;
    master.connect(masterMeter).connect(ctx.destination);
    master.gain.value = masterGain();
  }
  if (ctx.state === 'suspended') {
    // Without a click on the page the context may stay suspended: wait for one.
    const c = ctx;
    void c.resume().then(() => c.state === 'running' && useAmbient.setState({ blocked: false }));
    blockedUntilGesture();
  }
  return { ctx, master: master! };
}

function masterGain(): number {
  const a = getGm().settings.ambient;
  return a.muted ? 0 : faderToGain(a.volume);
}

interface Source {
  setGain(g: number, smooth: boolean): void; // channel gain × active, before the master
  play(): void;
  pause(): void;
  destroy(): void;
  meter: AnalyserNode | null; // files only: YouTube audio cannot be measured
}

function fileSource(track: AmbientTrack): Source {
  const { ctx: c, master: out } = audio();
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  const node = c.createMediaElementSource(el);
  const gain = c.createGain();
  gain.gain.value = 0;
  const meter = c.createAnalyser();
  meter.fftSize = 1024;
  node.connect(gain).connect(meter).connect(out);
  let url: string | undefined;
  let wantPlay = false;
  let dead = false;
  const tryPlay = () => {
    if (!el.src) return;
    el.play().catch((err: DOMException) => {
      if (err.name === 'NotAllowedError') blockedUntilGesture();
    });
  };
  void getTrackBlob(track).then((blob) => {
    if (!blob || dead) return;
    url = URL.createObjectURL(blob);
    el.src = url;
    if (wantPlay) tryPlay();
  });
  return {
    meter,
    setGain(g, smooth) {
      const p = gain.gain;
      p.cancelScheduledValues(c.currentTime);
      if (smooth) p.setTargetAtTime(g, c.currentTime, FADE_S);
      else p.setValueAtTime(g, c.currentTime);
    },
    play() {
      wantPlay = true;
      if (el.paused) tryPlay();
    },
    pause() {
      wantPlay = false;
      el.pause();
    },
    destroy() {
      dead = true;
      el.pause();
      el.removeAttribute('src');
      node.disconnect();
      gain.disconnect();
      meter.disconnect();
      if (url) URL.revokeObjectURL(url);
    },
  };
}

// --- YouTube (IFrame API). Its volume moves in coarse steps, so it is set once, never faded. ----

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
  let channel = 0;
  let sent = -1;
  let dead = false;
  const el = document.createElement('div');
  ytHost().append(el);
  // The master fader applies too: YouTube does not go through the Web Audio graph.
  const apply = () => {
    if (!ready) return;
    const v = Math.round(channel * masterGain() * 100);
    if (v !== sent) player!.setVolume(v);
    sent = v;
  };
  ytSources.add(apply);
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
            apply();
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
    meter: null,
    setGain(g) {
      channel = g;
      apply();
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
      ytSources.delete(apply);
      player?.destroy();
      el.remove();
    },
  };
}

const ytSources = new Set<() => void>();

// --- voices --------------------------------------------------------------------------------------

interface Voice {
  key: string;
  slot: AmbientSlot;
  track: AmbientTrack;
  source: Source;
  active: boolean;
  stopTimer?: ReturnType<typeof setTimeout>;
}

const voices = new Map<string, Voice>();
const keyOf = (slot: AmbientSlot, trackId: Id) => `${slot}:${trackId}`;
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
    void ctx?.resume();
    for (const v of voices.values()) if (v.active) v.source.play();
  };
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);
}

/**
 * Brings the voices in line with the mixer. Files fade in and out; YouTube switches at once
 * (its stepwise volume made fades crackle). Paused globals keep their place; scene voices that
 * are no longer wanted stop for good, so a scene's sound starts over when the scene opens again.
 */
function reconcile() {
  const s = getGm();
  const plan = mixPlan(globalChannels(s.settings.ambient), sceneAmbient(activeScene(s)), s.tracks);
  const wanted = new Set<string>();
  for (const p of plan) {
    const key = keyOf(p.slot, p.trackId);
    wanted.add(key);
    let v = voices.get(key);
    const track = s.tracks[p.trackId];
    if (!v) {
      if (!p.active) continue; // a muted global that never played yet
      const source = track.source === 'youtube' ? youTubeSource(track) : fileSource(track);
      v = { key, slot: p.slot, track, source, active: false };
      voices.set(key, v);
    }
    v.track = track;
    clearTimeout(v.stopTimer);
    if (p.active) {
      v.source.setGain(p.gain, true);
      if (!v.active) v.source.play();
      v.active = true;
    } else if (v.active) {
      v.active = false;
      fadeOut(v, false);
    }
  }
  for (const v of [...voices.values()]) {
    if (!wanted.has(v.key)) {
      v.active = false;
      fadeOut(v, true);
    }
  }
  if (master && ctx) master.gain.setTargetAtTime(masterGain(), ctx.currentTime, 0.05);
  for (const apply of ytSources) apply();
}

function fadeOut(v: Voice, destroy: boolean) {
  const youtube = v.track.source === 'youtube';
  v.source.setGain(0, !youtube);
  const stop = () => {
    if (destroy) {
      v.source.destroy();
      voices.delete(v.key);
    } else v.source.pause();
  };
  if (youtube) stop();
  else v.stopTimer = setTimeout(stop, FADE_DONE_MS);
}

// --- meters --------------------------------------------------------------------------------------

const buf = new Float32Array(1024);

function peakDb(a: AnalyserNode | null | undefined): number | null {
  if (!a) return null;
  a.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** Current peak of a channel in dB; null when it cannot be measured (YouTube, not playing). */
export function channelLevel(slot: AmbientSlot, trackId: Id): number | null {
  const v = voices.get(keyOf(slot, trackId));
  return v?.active ? peakDb(v.source.meter) : null;
}

/** Peak of everything that goes through the master (audio files). */
export function masterLevel(): number | null {
  return peakDb(masterMeter);
}

/** Starts following the store: scene switches, the mixer settings and the track library. */
export function initAmbient(): void {
  useGm.subscribe((s, prev) => {
    const scene = activeScene(s);
    const before = activeScene(prev);
    if (
      s.settings.ambient !== prev.settings.ambient ||
      s.tracks !== prev.tracks ||
      s.activeSceneId !== prev.activeSceneId ||
      scene?.ambient !== before?.ambient ||
      scene?.ambientTrackId !== before?.ambientTrackId
    ) {
      reconcile();
    }
  });
  reconcile();
}

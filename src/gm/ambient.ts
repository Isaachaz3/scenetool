import { create } from 'zustand';
import {
  FADE,
  fadeAt,
  fadeValue,
  faderToGain,
  retarget,
  type Fade,
  globalChannels,
  mixPlan,
  sceneAmbient,
  youTubeProblem,
  type AmbientSlot,
  type YouTubeProblem,
} from '../core/ambient';
import type { AmbientTrack, Id } from '../core/types';
import { activeScene, getGm, useGm } from '../state/store';
import { getTrackBlob } from '../state/tracks';
import { t } from '../i18n/ru';

const YT_STEP_MS = 100;

/** Seconds of every fade in and out, from the mixer setting. */
function fadeTime(): number {
  return getGm().settings.ambient.fade ?? FADE.inOut;
}

const clock = () => performance.now() / 1000;

/** The master as YouTube hears it: its own fade, applied on top of each channel's fade. */
let masterFade: Fade | null = null;
const YT_HOST_ID = 'yt-ambient';

/** Whether the browser still waits for a click before it lets sound play. */
export const useAmbient = create<{
  blocked: boolean;
  errors: Record<Id, YouTubeProblem>;
  ytStates: Record<Id, number>; // YouTube player state per track, shown on the strips
  showPlayers: boolean; // the YouTube players are visible in a corner
  needsClick: Record<Id, true>; // YouTube refused to start these: play must be pressed in the player
}>(() => ({
  blocked: false,
  errors: {},
  ytStates: {},
  showPlayers: false,
  needsClick: {},
}));

let autoShown = false; // the players were shown because YouTube asked for a click

function showPlayers(show: boolean) {
  useAmbient.setState({ showPlayers: show });
  ytHost().classList.toggle('visible', show);
}

/** Makes the hidden YouTube players visible, to see what YouTube says and press play there. */
export function toggleYouTubePlayers(): void {
  autoShown = false;
  showPlayers(!useAmbient.getState().showPlayers);
}

/**
 * YouTube may refuse to start a video from the page even after a click on the page; a click on
 * play inside its player always works, and from then on that player obeys the page. So the
 * players show up by themselves while one of them waits for that click, and hide again after.
 */
function setNeedsClick(trackId: Id, need: boolean) {
  const before = useAmbient.getState().needsClick;
  const isNew = need && !before[trackId];
  const needsClick = { ...before };
  if (need) needsClick[trackId] = true;
  else delete needsClick[trackId];
  useAmbient.setState({ needsClick });
  const waiting = Object.keys(needsClick).length > 0;
  // Only a video that starts waiting shows the players: the GM may have hidden them on purpose,
  // and the click on "hide" itself makes the waiting videos try (and fail) again.
  if (isNew && !useAmbient.getState().showPlayers) {
    autoShown = true;
    showPlayers(true);
  } else if (!waiting && autoShown) {
    autoShown = false;
    showPlayers(false);
  }
}

function setYtState(trackId: Id, state: number | null) {
  const ytStates = { ...useAmbient.getState().ytStates };
  if (state === null) delete ytStates[trackId];
  else ytStates[trackId] = state;
  useAmbient.setState({ ytStates });
}

function setProblem(trackId: Id, problem: YouTubeProblem | null) {
  const errors = { ...useAmbient.getState().errors };
  if (problem) errors[trackId] = problem;
  else delete errors[trackId];
  useAmbient.setState({ errors });
}

// --- Web Audio graph: file channels → their gain → analyser → master gain → analyser → out ------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let masterMeter: AnalyserNode | null = null;

/** The page's one audio context (the soundpad plays through it too). */
export function sharedAudio(): AudioContext {
  return audio().ctx;
}

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

export interface Source {
  setGain(g: number, fade: number): void; // channel gain × active, before the master; fade in s
  play(): void;
  pause(): void;
  rewind?(): void;
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
    setGain(g, fade) {
      rampParam(c, gain.gain, g, fade);
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
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
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
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
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
    const hint = document.createElement('div');
    hint.className = 'yt-hint';
    hint.textContent = t.ambient.pressPlay;
    host.append(hint);
    document.body.append(host);
  }
  return host;
}

export interface YouTubeOptions {
  loop: boolean; // ambient loops; a sound plays once
  level: () => number; // the output this player sits behind (ambient master or soundpad)
  onEnded?: () => void;
}

const ambientLevel = () => (masterFade ? fadeValue(masterFade, clock()) : masterGain());

export function youTubeSource(
  track: AmbientTrack,
  opts: YouTubeOptions = { loop: true, level: ambientLevel },
): Source {
  const ENDED = 0;
  const PLAYING = 1;
  const BUFFERING = 3;
  const START_CHECK_MS = 3000;
  let player: YTPlayer | null = null;
  let ready = false;
  let wantPlay = false;
  let sent = -1;
  let dead = false;
  let failed = false;
  let check: ReturnType<typeof setTimeout> | undefined;
  // Our own iframe, so that it is allowed to play sound on its own (allow="autoplay").
  const el = document.createElement('iframe');
  const params = new URLSearchParams({
    enablejsapi: '1',
    controls: '0',
    disablekb: '1',
    playsinline: '1',
    rel: '0',
    origin: location.origin,
  });
  el.src = `https://www.youtube.com/embed/${encodeURIComponent(track.youtubeId!)}?${params}`;
  el.allow = 'autoplay; encrypted-media';
  el.width = '200';
  el.height = '200';
  el.title = track.name;
  ytHost().append(el);
  /**
   * playVideo() fails silently when the browser refuses sound before the first click: if the
   * video has not started after a few seconds, wait for a click and try again.
   */
  /**
   * Browsers always allow muted autoplay: start muted, then unmute once it plays (allowed after
   * a click on the page). If unmuting is refused the video pauses, and the check below waits
   * for a click.
   */
  let unmuteWanted = false;
  const start = () => {
    if (!ready || failed || dead) return;
    const state = player!.getPlayerState();
    if (state !== PLAYING) {
      unmuteWanted = true;
      player!.mute();
      player!.playVideo();
    } else if (player!.isMuted()) player!.unMute();
    clearTimeout(check);
    check = setTimeout(() => {
      if (dead || failed || !wantPlay) return;
      const s = player!.getPlayerState();
      if (s === PLAYING || s === BUFFERING) return;
      // Before any click on the page, wait for one; after it, YouTube wants a click in the player.
      if (navigator.userActivation?.hasBeenActive === false) blockedUntilGesture();
      else setNeedsClick(track.id, true);
    }, START_CHECK_MS);
  };
  /**
   * Volume = channel fade × master fade (YouTube is outside the Web Audio graph): two separate
   * fades, so neither cuts the other short. A ticker sends the product every 100 ms, in steps
   * small enough not to crackle.
   */
  let channelFade: Fade = { from: 0, to: 0, start: 0, duration: 0 };
  const apply = () => {
    if (!ready) return;
    const now = clock();
    const level = opts.level();
    const n = Math.round(fadeValue(channelFade, now) * level * 100);
    if (n !== sent) player!.setVolume(n);
    sent = n;
  };
  const ticker = setInterval(apply, YT_STEP_MS);
  void loadYouTube()
    .then((YT) => {
      if (dead) return;
      player = new YT.Player(el, {
        events: {
          onReady() {
            ready = true;
            apply();
            if (wantPlay) start();
          },
          onStateChange(e) {
            setYtState(track.id, e.data);
            if (e.data === PLAYING) {
              setProblem(track.id, null);
              setNeedsClick(track.id, false);
              if (unmuteWanted) {
                unmuteWanted = false;
                player!.unMute();
                sent = -1;
                apply();
              }
            }
            if (e.data === ENDED) {
              if (opts.loop) {
                player!.seekTo(0, true);
                player!.playVideo();
              } else {
                wantPlay = false;
                opts.onEnded?.();
              }
            }
          },
          onError(e) {
            failed = true;
            clearTimeout(check);
            console.warn('YouTube error', e.data, track.youtubeId);
            setProblem(track.id, youTubeProblem(e.data));
          },
        },
      });
    })
    .catch((err) => {
      console.warn(err);
      setProblem(track.id, 'unavailable'); // the YouTube script did not load
    });
  return {
    meter: null,
    setGain(g, fade) {
      channelFade = retarget(channelFade, g, fade, clock());
      apply();
    },
    play() {
      wantPlay = true;
      start();
    },
    pause() {
      wantPlay = false;
      clearTimeout(check);
      if (ready) player!.pauseVideo();
    },
    rewind() {
      if (ready) player!.seekTo(0, true);
    },
    destroy() {
      dead = true;
      clearTimeout(check);
      setYtState(track.id, null);
      setNeedsClick(track.id, false);
      clearInterval(ticker);
      player?.destroy();
      el.remove();
    },
  };
}

// --- voices --------------------------------------------------------------------------------------

interface Voice {
  key: string;
  slot: AmbientSlot;
  track: AmbientTrack;
  source: Source;
  active: boolean; // wanted on air (false: fading out, then paused)
  leaving: boolean; // no longer in the mixer: fading out, then gone
  target?: number; // gain the voice is heading for
  muted?: boolean;
  stopTimer?: ReturnType<typeof setTimeout>;
}

let lastMasterMuted: boolean | undefined;
let lastMasterTarget: number | undefined;

/** Moves an AudioParam to `value` along the even-in-dB fade curve, or at once. */
function rampParam(c: AudioContext, p: AudioParam, value: number, fade: number) {
  const now = c.currentTime;
  const current = p.value;
  p.cancelScheduledValues(now);
  if (fade <= 0 || Math.abs(current - value) < 1e-4) {
    p.setValueAtTime(value, now);
    return;
  }
  const n = Math.max(2, Math.round(fade * 50));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = fadeAt(current, value, (fade * i) / (n - 1), fade);
  p.setValueCurveAtTime(curve, now, fade);
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
 * Brings the voices in line with the mixer. A voice changes its level only when its own target
 * changes, so switching other layers never touches a fade in progress. Every way in or out
 * (mute, add, remove, scene in and out, globals muted by a scene, master pause) fades over the
 * mixer's fade time; only a moving fader follows at once. Paused globals keep their place;
 * removed voices stop after their fade-out (YouTube players are kept, paused and rewound).
 */
function reconcile() {
  const s = getGm();
  const fade = fadeTime();
  const plan = mixPlan(globalChannels(s.settings.ambient), sceneAmbient(activeScene(s)), s.tracks);
  const wanted = new Set<string>();
  for (const p of plan) {
    const key = keyOf(p.slot, p.trackId);
    wanted.add(key);
    let v = voices.get(key);
    const track = s.tracks[p.trackId];
    if (!v) {
      if (!p.active) continue; // a global muted by the scene that never played yet
      const source = track.source === 'youtube' ? takeYouTube(track) : fileSource(track);
      v = { key, slot: p.slot, track, source, active: false, leaving: false };
      voices.set(key, v);
    }
    v.track = track;
    const target = p.active ? p.gain : 0;
    const onlyFader =
      !v.leaving && v.active === p.active && v.muted === p.muted && (v.target ?? 0) > 0 && target > 0;
    v.muted = p.muted;
    v.leaving = false;
    if (target !== v.target) {
      v.source.setGain(target, onlyFader ? FADE.fader : fade);
      v.target = target;
    }
    if (p.active && !v.active) {
      clearTimeout(v.stopTimer);
      v.stopTimer = undefined;
      v.source.play();
    } else if (!p.active && v.active) {
      const voice = v;
      clearTimeout(v.stopTimer);
      v.stopTimer = setTimeout(
        () => {
          if (!voice.active) voice.source.pause(); // a global waits, paused, for the scene to end
        },
        fade * 1000 + 100,
      );
    } else if (p.active) {
      clearTimeout(v.stopTimer); // came back during a pending stop
      v.stopTimer = undefined;
    }
    v.active = p.active;
  }
  for (const v of [...voices.values()]) {
    if (wanted.has(v.key) || v.leaving) continue;
    v.leaving = true;
    v.active = false;
    if (v.target !== 0) v.source.setGain(0, fade);
    v.target = 0;
    clearTimeout(v.stopTimer);
    v.stopTimer = setTimeout(
      () => {
        if (!v.leaving) return; // added back meanwhile
        voices.delete(v.key);
        if (v.track.source === 'youtube') releaseYouTube(v.track.id, v.source);
        else v.source.destroy();
      },
      fade * 1000 + 100,
    );
  }
  // The master: its pause fades like a mute, its fader follows the hand.
  const masterMuted = s.settings.ambient.muted;
  const masterTarget = masterGain();
  if (masterTarget !== lastMasterTarget) {
    const pauseToggled = lastMasterMuted !== undefined && masterMuted !== lastMasterMuted;
    const d = pauseToggled ? fade : lastMasterTarget === undefined ? 0 : FADE.fader;
    if (master && ctx) rampParam(ctx, master.gain, masterTarget, d);
    masterFade = retarget(masterFade, masterTarget, d, clock());
    lastMasterTarget = masterTarget;
  }
  lastMasterMuted = masterMuted;
  // Players of deleted tracks go for good.
  for (const [id, list] of ytCache) {
    if (s.tracks[id]) continue;
    for (const c of list) if (!c.busy) c.source.destroy();
    const left = list.filter((c) => c.busy);
    if (left.length) ytCache.set(id, left);
    else ytCache.delete(id);
  }
}

/**
 * YouTube players live for the whole session: a player that once got its click keeps obeying
 * the page, so a scene's video is paused and rewound when the scene closes, not destroyed.
 */
const ytCache = new Map<Id, { source: Source; busy: boolean }[]>();

function takeYouTube(track: AmbientTrack): Source {
  const list = ytCache.get(track.id) ?? [];
  const free = list.find((c) => !c.busy);
  if (free) {
    free.busy = true;
    return free.source;
  }
  const source = youTubeSource(track);
  list.push({ source, busy: true });
  ytCache.set(track.id, list);
  return source;
}

function releaseYouTube(trackId: Id, source: Source) {
  source.pause();
  source.rewind?.();
  const entry = ytCache.get(trackId)?.find((c) => c.source === source);
  if (entry) entry.busy = false;
  else source.destroy();
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

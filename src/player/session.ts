import { create } from 'zustand';
import type { Viewport } from '../core/types';
import { lerpViewport } from '../core/viewport';
import { AssetAssembler, decodeFrame } from '../protocol/binary';
import type { GmLink } from '../protocol/link';
import { OpenerLink, ReceiverLink } from '../protocol/links';
import { playerMessage, type GmMessage, type ViewMessage } from '../protocol/messages';
import { applyDiff, sceneHashes, type PlayerScene } from '../protocol/projection';
import { BitmapCache } from '../render/bitmapCache';

const HINT_CHANNEL = 'vtt-lite';

export type LinkMode = 'presentation' | 'window' | 'none';

interface PlayerState {
  mode: LinkMode;
  scene: PlayerScene | null;
  view: Viewport;
  heard: boolean; // got anything from the GM
}

export const usePlayer = create<PlayerState>(() => ({
  mode: 'none',
  scene: null,
  view: { x: 0, y: 0, zoom: 1 },
  heard: false,
}));

/** Original files by hash; kept in memory only, gone after a reload. */
const files = new Map<string, Blob>();
export const playerImages = new BitmapCache(async (hash) => files.get(hash), 2000);

const assembler = new AssetAssembler();
let link: GmLink | null = null;
let anim: number | undefined;

function send(msg: Parameters<typeof playerMessage>[0]) {
  link?.send(playerMessage(msg));
}

function requestMissing(scene: PlayerScene | null) {
  if (!scene) return;
  const missing = sceneHashes(scene).filter((h) => !files.has(h) && !assembler.isPending(h));
  if (missing.length > 0) send({ type: 'need-assets', hashes: missing });
}

function setView(target: ViewMessage) {
  if (anim !== undefined) cancelAnimationFrame(anim);
  anim = undefined;
  const to = { x: target.x, y: target.y, zoom: target.zoom };
  if (target.duration <= 0) {
    usePlayer.setState({ view: to });
    return;
  }
  const from = usePlayer.getState().view;
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / target.duration);
    usePlayer.setState({ view: lerpViewport(from, to, k) });
    anim = k < 1 ? requestAnimationFrame(step) : undefined;
  };
  anim = requestAnimationFrame(step);
}

function onMessage(msg: GmMessage) {
  usePlayer.setState({ heard: true });
  switch (msg.type) {
    case 'scene:snapshot':
      usePlayer.setState({ scene: msg.scene });
      setView({ ...msg.view, duration: 0 });
      requestMissing(msg.scene);
      break;
    case 'scene:diff': {
      const scene = usePlayer.getState().scene;
      if (!scene || scene.id !== msg.sceneId) {
        send({ type: 'hello', cached: [...files.keys()] }); // out of sync: ask for a snapshot
        return;
      }
      const next = applyDiff(scene, msg.diff);
      usePlayer.setState({ scene: next });
      if (msg.diff.assets) requestMissing(next);
      break;
    }
    case 'asset:begin':
      assembler.begin(msg.hash, msg.size, msg.mime, msg.total);
      break;
    case 'asset:end': {
      const blob = assembler.end(msg.hash);
      if (blob) {
        files.set(msg.hash, blob);
        playerImages.invalidate(msg.hash);
      }
      break;
    }
    case 'view:set':
      setView(msg);
      break;
  }
}

function onBinary(frame: ArrayBuffer) {
  const f = decodeFrame(frame);
  if (f) assembler.chunk(f.header, f.data);
}

export function sendScreen() {
  send({
    type: 'screen',
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  });
}

function attach(next: GmLink) {
  link = next;
  next.onMessage(onMessage);
  next.onBinary(onBinary);
  send({ type: 'hello', cached: [...files.keys()] });
  sendScreen();
}

/** Connects to the GM through the presentation receiver or the opener window. */
export function connect(): LinkMode {
  const receiver = navigator.presentation?.receiver;
  if (receiver) {
    usePlayer.setState({ mode: 'presentation' });
    void receiver.connectionList.then((list) => {
      const adopt = (c: PresentationConnection) => {
        const l = new ReceiverLink(c);
        let attached = false;
        const once = () => {
          if (attached) return;
          attached = true;
          attach(l); // the GM reconnects after a reload: the newest connection wins
        };
        c.addEventListener('connect', once);
        if (c.state === 'connected') once();
      };
      list.connections.forEach(adopt);
      list.addEventListener('connectionavailable', (e) =>
        adopt((e as PresentationConnectionAvailableEvent).connection),
      );
    });
    return 'presentation';
  }
  if (window.opener) {
    usePlayer.setState({ mode: 'window' });
    attach(new OpenerLink(window.opener as Window));
    // After the GM page reloads it announces itself; say hello again.
    try {
      new BroadcastChannel(HINT_CHANNEL).onmessage = () => send({ type: 'hello', cached: [...files.keys()] });
    } catch {
      // optional
    }
    // Until the GM answers (it may still be loading), keep saying hello.
    const retry = setInterval(() => {
      if (usePlayer.getState().heard) clearInterval(retry);
      else send({ type: 'hello', cached: [...files.keys()] });
    }, 1000);
    return 'window';
  }
  return 'none';
}

export function hashForAsset(assetId: string): string | undefined {
  return usePlayer.getState().scene?.assets[assetId]?.hash;
}

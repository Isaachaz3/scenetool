import type { Asset, Id, Item, MeasureView, Scene, Size, Viewport } from '../core/types';
import { playerZoom, viewportForScreen } from '../core/viewport';
import { t } from '../i18n/ru';
import { getAssetBlob } from './images';
import { chunkCount, chunks } from '../protocol/binary';
import type { PlayerLink } from '../protocol/link';
import { PresentationLink, WindowLink } from '../protocol/links';
import { gmMessage, parsePlayerMessage, type PlayerMessage, type ViewMessage } from '../protocol/messages';
import { assetRef, diffProjection, projectScene, type PlayerScene } from '../protocol/projection';
import { shownBackdrop } from '../state/backdrop';
import { activeScene, changeScene, getGm, useGm, type DragState } from '../state/store';
import { getUi, toast, useUi } from '../state/ui';

const SEND_INTERVAL = 33; // ≤ 30 updates per second
const PRESENTATION_KEY = 'vtt-lite:presentationId';
export const HINT_CHANNEL = 'vtt-lite';

class Session {
  ready = false;
  screen?: Size;
  has = new Set<string>();
  queue: string[] = [];
  pumping = false;
  projection: PlayerScene | null = null;
  view: Viewport | null = null;
  ref: Size | undefined;
  measure: MeasureView | null = null;
  backdrop: string | null | undefined; // backdrop (file and focus) last sent; undefined: nothing yet

  constructor(readonly link: PlayerLink) {}
}

/** Projection with live drag positions, so players see a token move while it is dragged. */
function withDrag(p: PlayerScene, drag: DragState | null, cache: Map<Id, Item>): PlayerScene {
  if (!drag) return p;
  const items = { ...p.items };
  for (const [id, pos] of Object.entries(drag.positions)) {
    const it = items[id];
    if (!it) continue;
    const prev = cache.get(id);
    const moved =
      prev && prev.position.x === pos.x && prev.position.y === pos.y && prev.id === it.id
        ? prev
        : ({ ...it, position: pos } as Item);
    cache.set(id, moved);
    items[id] = moved;
  }
  return { ...p, items };
}

/**
 * Keeps every player screen in sync with the active scene: snapshot on connect or scene
 * switch, then diffs of the projection, images on request and the player view.
 */
export class PlayerHub {
  private sessions = new Set<Session>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastSend = 0;
  private nextViewDuration = 0;
  private memo: { scene?: Scene; assets?: Record<Id, Asset>; base?: PlayerScene } = {};
  private dragCache = new Map<Id, Item>();
  private measure: MeasureView | null = null;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerLast = 0;
  private pointerPending: { x: number; y: number; active: boolean } | null = null;

  init(): void {
    useGm.subscribe((s, prev) => {
      if (
        s.scenes !== prev.scenes ||
        s.activeSceneId !== prev.activeSceneId ||
        s.assets !== prev.assets ||
        s.drag !== prev.drag ||
        s.backdropId !== prev.backdropId
      ) {
        if (!s.drag) this.dragCache.clear();
        if (getUi().follow && s.activeSceneId === prev.activeSceneId) this.followGm(prev);
        this.schedule();
      }
      if (s.settings !== prev.settings) {
        for (const session of this.sessions) if (session.ready) this.sendSettings(session);
        this.schedule();
      }
    });
    // A player window that survived a reload of this page says hello again: adopt it.
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.source || this.knows(e.source as Window)) return;
      const msg = parsePlayerMessage(e.data);
      if (msg?.type !== 'hello') return;
      const session = this.add(new WindowLink(e.source as Window));
      this.handle(session, msg);
    });
    try {
      new BroadcastChannel(HINT_CHANNEL).postMessage('gm-ready');
    } catch {
      // only a hint for reopened popups
    }
  }

  private knows(win: Window): boolean {
    for (const s of this.sessions) if (s.link instanceof WindowLink && s.link.win === win) return true;
    return false;
  }

  findWindow(win: Window): boolean {
    return this.knows(win);
  }

  add(link: PlayerLink): Session {
    const session = new Session(link);
    this.sessions.add(session);
    link.onMessage((msg) => this.handle(session, msg));
    link.onStateChange((state) => {
      if (state === 'closed') {
        this.sessions.delete(session);
        this.publishStatus();
      }
    });
    this.publishStatus();
    return session;
  }

  get count(): number {
    let n = 0;
    for (const s of this.sessions) if (s.link.state !== 'closed') n++;
    return n;
  }

  private publishStatus() {
    useUi.setState((u) => ({ player: { ...u.player, links: this.count, screen: this.primary()?.screen } }));
  }

  private handle(session: Session, msg: PlayerMessage) {
    switch (msg.type) {
      case 'hello':
        session.ready = true;
        session.has = new Set(msg.cached);
        session.queue = [];
        session.measure = null;
        session.backdrop = undefined;
        this.sendSnapshot(session);
        this.sendSettings(session);
        this.sendBackdrop(session);
        break;
      case 'screen': {
        session.screen = { width: msg.width, height: msg.height };
        this.publishStatus();
        if (getUi().follow && this.primary() === session) this.applyFollow();
        else if (session.ready) this.sendView(session, 0);
        break;
      }
      case 'need-assets':
        for (const h of msg.hashes) if (!session.queue.includes(h)) session.queue.push(h);
        void this.pump(session);
        break;
    }
  }

  private projection(): PlayerScene | null {
    const s = getGm();
    const scene = activeScene(s);
    if (!scene) return null;
    const m = this.memo;
    if (
      m.scene?.items !== scene.items ||
      m.scene?.grid !== scene.grid ||
      m.scene?.fog !== scene.fog ||
      m.assets !== s.assets ||
      m.scene?.id !== scene.id
    ) {
      m.base = projectScene(scene, s.assets);
      m.assets = s.assets;
    }
    m.scene = scene;
    return withDrag(m.base!, s.drag, this.dragCache);
  }

  private viewFor(session: Session, scene: Scene): Viewport {
    return viewportForScreen(scene.playerViewport, scene.playerViewRef, session.screen);
  }

  private sendSnapshot(session: Session) {
    const scene = activeScene();
    const projection = this.projection();
    session.projection = projection;
    const view = scene ? this.viewFor(session, scene) : { x: 0, y: 0, zoom: 1 };
    session.view = scene?.playerViewport ?? null;
    session.ref = scene?.playerViewRef;
    session.link.send(
      gmMessage({ type: 'scene:snapshot', scene: projection, view: { ...view, duration: 0 } }),
    );
  }

  private sendView(session: Session, duration: number) {
    const scene = activeScene();
    if (!scene) return;
    const v = this.viewFor(session, scene);
    session.view = scene.playerViewport;
    session.ref = scene.playerViewRef;
    const msg: ViewMessage = { x: v.x, y: v.y, zoom: v.zoom, duration };
    session.link.send(gmMessage({ type: 'view:set', ...msg }));
  }

  private schedule() {
    if (this.timer) return;
    const wait = Math.max(0, SEND_INTERVAL - (performance.now() - this.lastSend));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.lastSend = performance.now();
      this.flush();
    }, wait);
  }

  private flush() {
    const scene = activeScene();
    const next = this.projection();
    const duration = this.nextViewDuration;
    this.nextViewDuration = 0;
    const measure = getGm().settings.playerDefaults.ruler ? this.measure : null;
    for (const session of this.sessions) {
      if (!session.ready || session.link.state === 'closed') continue;
      const prev = session.projection;
      if (!prev || !next || prev.id !== next.id) {
        this.sendSnapshot(session);
      } else {
        const diff = diffProjection(prev, next);
        session.projection = next;
        if (diff) session.link.send(gmMessage({ type: 'scene:diff', sceneId: next.id, diff }));
        if (scene && (session.view !== scene.playerViewport || session.ref !== scene.playerViewRef)) {
          this.sendView(session, duration);
        }
      }
      if (session.measure !== measure) {
        session.measure = measure;
        session.link.send(gmMessage({ type: 'measure', measure }));
      }
      this.sendBackdrop(session);
    }
  }

  /** The backdrop over the scene, when it changed; its file follows on request like any image. */
  private sendBackdrop(session: Session) {
    const asset = shownBackdrop();
    const key = asset ? `${asset.hash}@${asset.focus?.x},${asset.focus?.y}` : null;
    if (session.backdrop === key) return;
    session.backdrop = key;
    session.link.send(
      gmMessage({ type: 'backdrop', backdrop: asset ? assetRef(asset) : null, focus: asset?.focus }),
    );
  }

  private sendSettings(session: Session) {
    const pd = getGm().settings.playerDefaults;
    session.link.send(gmMessage({ type: 'settings', ruler: pd.ruler, pointer: pd.pointer }));
  }

  /** Ruler or movement line shown to players while it is being dragged (null hides it). */
  setMeasure(m: MeasureView | null): void {
    this.measure = m;
    this.schedule();
  }

  /** Laser pointer: at most 30 messages per second, the latest position always arrives. */
  pointer(x: number, y: number, active: boolean): void {
    this.pointerPending = { x, y, active };
    const wait = SEND_INTERVAL - (performance.now() - this.pointerLast);
    if (wait <= 0 || !active) {
      this.flushPointer();
    } else if (!this.pointerTimer) {
      this.pointerTimer = setTimeout(() => this.flushPointer(), wait);
    }
  }

  private flushPointer() {
    clearTimeout(this.pointerTimer);
    this.pointerTimer = undefined;
    const p = this.pointerPending;
    this.pointerPending = null;
    if (!p || !getGm().settings.playerDefaults.pointer) return;
    this.pointerLast = performance.now();
    for (const session of this.sessions) {
      if (session.ready && session.link.state !== 'closed')
        session.link.send(gmMessage({ type: 'pointer', ...p }));
    }
  }

  private async pump(session: Session) {
    if (session.pumping) return;
    session.pumping = true;
    try {
      while (session.queue.length > 0 && session.link.state !== 'closed') {
        const hash = session.queue.shift()!;
        const asset = Object.values(getGm().assets).find((a) => a.hash === hash);
        if (!asset) continue;
        const blob = await getAssetBlob(asset);
        if (!blob) continue;
        const buf = await blob.arrayBuffer();
        const total = chunkCount(buf.byteLength);
        session.link.send(
          gmMessage({ type: 'asset:begin', hash, size: buf.byteLength, mime: asset.mime, total }),
        );
        let index = 0;
        for (const part of chunks(buf)) {
          session.link.sendBinary({ hash, index: index++, total }, part);
          // Let the event loop breathe between megabytes.
          await new Promise((r) => setTimeout(r, 0));
        }
        session.link.send(gmMessage({ type: 'asset:end', hash }));
        session.has.add(hash);
      }
    } finally {
      session.pumping = false;
    }
  }

  /** The screen whose size defines the player view: the first connected one. */
  private primary(): Session | undefined {
    for (const s of this.sessions) if (s.ready && s.link.state !== 'closed' && s.screen) return s;
    return undefined;
  }

  /** Player view = GM view adjusted to the player screen, stored in the scene (no undo). */
  private playerViewFromGm(scene: Scene): { view: Viewport; ref: Size } {
    const gmScreen = getUi().screen;
    const ref = this.primary()?.screen ?? gmScreen;
    const v = scene.gmViewport;
    return { view: { x: v.x, y: v.y, zoom: playerZoom(v.zoom, gmScreen, ref) }, ref };
  }

  /** Sync View: one smooth jump of the player view to the GM view. */
  syncView(duration = getGm().settings.syncViewDuration): void {
    const scene = activeScene();
    if (!scene) return;
    const { view, ref } = this.playerViewFromGm(scene);
    this.nextViewDuration = duration;
    changeScene(
      (d) => {
        d.playerViewport = view;
        d.playerViewRef = ref;
      },
      { history: false },
    );
  }

  private applyFollow() {
    this.syncView(0);
  }

  private followGm(prev: ReturnType<typeof getGm>) {
    const scene = activeScene();
    const before = prev.activeSceneId ? prev.scenes[prev.activeSceneId] : undefined;
    if (scene && before && scene.gmViewport !== before.gmViewport) this.applyFollow();
  }

  setFollow(on: boolean): void {
    useUi.setState({ follow: on });
    if (on) this.syncView();
  }
}

export const hub = new PlayerHub();

// --- opening player screens -------------------------------------------------------------------

export function openPlayerWindow(): void {
  const win = window.open('player.html', 'vtt-player', 'popup,width=1280,height=720');
  if (!win) {
    toast(t.errors.popupBlocked, 'error');
    return;
  }
  win.focus();
  if (!hub.findWindow(win)) hub.add(new WindowLink(win));
}

class PresentationController {
  private request: PresentationRequest | null = null;
  private connection: PresentationConnection | null = null;

  init() {
    if (typeof PresentationRequest === 'undefined' || !navigator.presentation) return;
    try {
      this.request = new PresentationRequest([new URL('player.html', location.href).href]);
    } catch {
      return;
    }
    const request = this.request;
    // Chrome's own "Cast…" menu uses the default request too.
    navigator.presentation.defaultRequest = request;
    request.addEventListener('connectionavailable', (e) =>
      this.adopt((e as PresentationConnectionAvailableEvent).connection),
    );
    const setAvailable = (v: boolean) =>
      useUi.setState((u) => ({ player: { ...u.player, presentationAvailable: v } }));
    request
      .getAvailability()
      .then((av) => {
        setAvailable(av.value);
        av.addEventListener('change', () => setAvailable(av.value));
      })
      // Background monitoring is not supported everywhere; start() may still work.
      .catch(() => setAvailable(true));
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(PRESENTATION_KEY);
    } catch {
      // ignore
    }
    if (id) {
      request
        .reconnect(id)
        .then((c) => this.adopt(c))
        .catch(() => this.forget());
    }
  }

  private forget() {
    try {
      sessionStorage.removeItem(PRESENTATION_KEY);
    } catch {
      // ignore
    }
  }

  private adopt(c: PresentationConnection) {
    if (this.connection === c) return;
    this.connection = c;
    try {
      sessionStorage.setItem(PRESENTATION_KEY, c.id);
    } catch {
      // ignore
    }
    const setPresenting = (v: boolean) => useUi.setState((u) => ({ player: { ...u.player, presenting: v } }));
    setPresenting(true);
    const done = () => {
      if (this.connection === c) this.connection = null;
      setPresenting(false);
    };
    c.addEventListener('terminate', () => {
      this.forget();
      done();
    });
    c.addEventListener('close', done);
    hub.add(new PresentationLink(c));
  }

  async start() {
    if (!this.request) return;
    try {
      this.adopt(await this.request.start());
    } catch (err) {
      if ((err as DOMException)?.name !== 'NotAllowedError' && (err as DOMException)?.name !== 'AbortError') {
        toast(t.errors.presentFailed, 'error');
      }
    }
  }

  stop() {
    this.connection?.terminate();
    this.forget();
  }

  get supported(): boolean {
    return this.request !== null;
  }
}

export const presentation = new PresentationController();

export function initPlayerOutput(): void {
  hub.init();
  presentation.init();
}

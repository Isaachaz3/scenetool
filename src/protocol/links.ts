import { decodeFrame, encodeFrame } from './binary';
import { Emitter, type GmLink, type LinkState, type PlayerLink } from './link';
import {
  parseGmMessage,
  parsePlayerMessage,
  type ChunkHeader,
  type GmMessage,
  type PlayerMessage,
} from './messages';

// --- GM side ------------------------------------------------------------------------------

function mapState(s: PresentationConnectionState): LinkState {
  return s === 'connected' ? 'open' : s === 'connecting' ? 'connecting' : 'closed';
}

/** Presentation API connection: second monitor in "extend" mode, TV or Chromecast. */
export class PresentationLink implements PlayerLink {
  readonly kind = 'presentation';
  private messages = new Emitter<PlayerMessage>();
  private states = new Emitter<LinkState>();

  constructor(readonly connection: PresentationConnection) {
    connection.binaryType = 'arraybuffer';
    const onState = () => this.states.emit(this.state);
    connection.addEventListener('connect', onState);
    connection.addEventListener('close', onState);
    connection.addEventListener('terminate', onState);
    connection.addEventListener('message', (e) => {
      const msg = parsePlayerMessage((e as MessageEvent).data);
      if (msg) this.messages.emit(msg);
    });
  }

  get state(): LinkState {
    return mapState(this.connection.state);
  }

  send(msg: GmMessage): void {
    if (this.connection.state === 'connected') this.connection.send(JSON.stringify(msg));
  }

  sendBinary(header: ChunkHeader, data: ArrayBuffer | Uint8Array): void {
    if (this.connection.state === 'connected') this.connection.send(encodeFrame(header, data));
  }

  onMessage(cb: (msg: PlayerMessage) => void) {
    return this.messages.on(cb);
  }

  onStateChange(cb: (state: LinkState) => void) {
    return this.states.on(cb);
  }

  close(): void {
    this.connection.close();
  }
}

/** Popup window with postMessage: fallback for other browsers and for a single monitor. */
export class WindowLink implements PlayerLink {
  readonly kind = 'window';
  private messages = new Emitter<PlayerMessage>();
  private states = new Emitter<LinkState>();
  private _state: LinkState = 'connecting';
  private poll: ReturnType<typeof setInterval>;
  private readonly onWindowMessage = (e: MessageEvent) => {
    if (e.source !== this.win || e.origin !== location.origin) return;
    const msg = parsePlayerMessage(e.data);
    if (!msg) return;
    this.setState('open');
    this.messages.emit(msg);
  };

  constructor(readonly win: Window) {
    window.addEventListener('message', this.onWindowMessage);
    this.poll = setInterval(() => {
      if (this.win.closed) this.close();
    }, 1000);
  }

  get state(): LinkState {
    return this._state;
  }

  private setState(s: LinkState) {
    if (this._state === s) return;
    this._state = s;
    this.states.emit(s);
  }

  send(msg: GmMessage): void {
    if (this._state === 'closed' || this.win.closed) return;
    this.win.postMessage(JSON.stringify(msg), location.origin);
  }

  sendBinary(header: ChunkHeader, data: ArrayBuffer | Uint8Array): void {
    if (this._state === 'closed' || this.win.closed) return;
    const frame = encodeFrame(header, data);
    this.win.postMessage(frame, location.origin, [frame]);
  }

  onMessage(cb: (msg: PlayerMessage) => void) {
    return this.messages.on(cb);
  }

  onStateChange(cb: (state: LinkState) => void) {
    return this.states.on(cb);
  }

  close(): void {
    clearInterval(this.poll);
    window.removeEventListener('message', this.onWindowMessage);
    this.setState('closed');
    this.messages.clear();
  }
}

// --- player side ---------------------------------------------------------------------------

function dispatch(data: unknown, messages: Emitter<GmMessage>, frames: Emitter<ArrayBuffer>) {
  if (data instanceof ArrayBuffer) {
    if (decodeFrame(data)) frames.emit(data);
    return;
  }
  const msg = parseGmMessage(data);
  if (msg) messages.emit(msg);
}

/** Receiving page of a presentation. */
export class ReceiverLink implements GmLink {
  private messages = new Emitter<GmMessage>();
  private frames = new Emitter<ArrayBuffer>();

  constructor(readonly connection: PresentationConnection) {
    connection.binaryType = 'arraybuffer';
    connection.addEventListener('message', (e) =>
      dispatch((e as MessageEvent).data, this.messages, this.frames),
    );
  }

  get open(): boolean {
    return this.connection.state === 'connected';
  }

  send(msg: PlayerMessage): void {
    if (this.open) this.connection.send(JSON.stringify(msg));
  }

  onMessage(cb: (msg: GmMessage) => void) {
    return this.messages.on(cb);
  }

  onBinary(cb: (frame: ArrayBuffer) => void) {
    return this.frames.on(cb);
  }
}

/** Popup opened by the GM window. */
export class OpenerLink implements GmLink {
  private messages = new Emitter<GmMessage>();
  private frames = new Emitter<ArrayBuffer>();

  constructor(private opener: Window) {
    window.addEventListener('message', (e) => {
      if (e.source !== this.opener || e.origin !== location.origin) return;
      dispatch(e.data, this.messages, this.frames);
    });
  }

  get open(): boolean {
    return !this.opener.closed;
  }

  send(msg: PlayerMessage): void {
    if (!this.opener.closed) this.opener.postMessage(JSON.stringify(msg), location.origin);
  }

  onMessage(cb: (msg: GmMessage) => void) {
    return this.messages.on(cb);
  }

  onBinary(cb: (frame: ArrayBuffer) => void) {
    return this.frames.on(cb);
  }
}

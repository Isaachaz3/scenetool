import type { ChunkHeader, GmMessage, PlayerMessage } from './messages';

export type LinkState = 'connecting' | 'open' | 'closed';

/** GM side of the connection to one player screen. */
export interface PlayerLink {
  readonly kind: 'presentation' | 'window';
  readonly state: LinkState;
  send(msg: GmMessage): void; // JSON messages
  sendBinary(header: ChunkHeader, data: ArrayBuffer | Uint8Array): void; // image chunks
  onMessage(cb: (msg: PlayerMessage) => void): () => void; // returns unsubscribe
  onStateChange(cb: (state: LinkState) => void): () => void;
  close(): void;
}

/** Player side of the same connection. */
export interface GmLink {
  send(msg: PlayerMessage): void;
  onMessage(cb: (msg: GmMessage) => void): () => void;
  onBinary(cb: (frame: ArrayBuffer) => void): () => void;
}

/** Tiny typed event emitter used by the link implementations. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(cb: (value: T) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(value: T): void {
    for (const cb of [...this.listeners]) cb(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}

import type { ChunkHeader } from './messages';

export const CHUNK_SIZE = 1024 * 1024; // 1 MB

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Frame: 4 bytes of header length (big-endian), JSON header, then the data. */
export function encodeFrame(header: ChunkHeader, data: ArrayBuffer | Uint8Array): ArrayBuffer {
  const head = encoder.encode(JSON.stringify(header));
  const body = data instanceof Uint8Array ? data : new Uint8Array(data);
  const out = new Uint8Array(4 + head.length + body.length);
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  out.set(body, 4 + head.length);
  return out.buffer;
}

export function decodeFrame(frame: ArrayBuffer): { header: ChunkHeader; data: Uint8Array } | null {
  if (frame.byteLength < 4) return null;
  const len = new DataView(frame).getUint32(0);
  if (4 + len > frame.byteLength) return null;
  try {
    const header = JSON.parse(decoder.decode(new Uint8Array(frame, 4, len))) as ChunkHeader;
    if (typeof header.hash !== 'string' || typeof header.index !== 'number') return null;
    return { header, data: new Uint8Array(frame, 4 + len) };
  } catch {
    return null;
  }
}

export function chunkCount(size: number, chunkSize = CHUNK_SIZE): number {
  return Math.max(1, Math.ceil(size / chunkSize));
}

export function* chunks(buf: ArrayBuffer, chunkSize = CHUNK_SIZE): Generator<Uint8Array> {
  const total = chunkCount(buf.byteLength, chunkSize);
  for (let i = 0; i < total; i++) {
    yield new Uint8Array(buf, i * chunkSize, Math.min(chunkSize, buf.byteLength - i * chunkSize));
  }
}

interface Pending {
  mime: string;
  size: number;
  total: number;
  parts: (Uint8Array<ArrayBuffer> | undefined)[];
  received: number;
}

/** Player side: reassembles asset:begin → chunks → asset:end into a Blob. */
export class AssetAssembler {
  private pending = new Map<string, Pending>();

  begin(hash: string, size: number, mime: string, total: number): void {
    this.pending.set(hash, { mime, size, total, parts: new Array(total), received: 0 });
  }

  chunk(header: ChunkHeader, data: Uint8Array): void {
    const p = this.pending.get(header.hash);
    if (!p || header.index < 0 || header.index >= p.total || p.parts[header.index]) return;
    // Copy: the frame buffer may be reused or transferred.
    p.parts[header.index] = data.slice();
    p.received++;
  }

  /** Returns the file, or null when chunks are missing or the size is wrong. */
  end(hash: string): Blob | null {
    const p = this.pending.get(hash);
    this.pending.delete(hash);
    if (!p || p.received !== p.total) return null;
    const blob = new Blob(p.parts as Uint8Array<ArrayBuffer>[], { type: p.mime });
    return blob.size === p.size ? blob : null;
  }

  isPending(hash: string): boolean {
    return this.pending.has(hash);
  }
}

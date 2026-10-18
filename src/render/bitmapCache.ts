import { useEffect, useSyncExternalStore } from 'react';

type Status = 'loading' | 'ready' | 'missing' | 'error';

interface Entry {
  status: Status;
  image?: ImageBitmap;
  refs: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<() => void>;
  generation: number;
}

/**
 * Decoded images by key with reference counting. Only images that are on screen stay
 * decoded; an image nobody uses is closed after a short delay.
 */
export class BitmapCache {
  private entries = new Map<string, Entry>();

  constructor(
    private load: (key: string) => Promise<Blob | null | undefined>,
    private releaseDelay = 10_000,
  ) {}

  private entry(key: string): Entry {
    let e = this.entries.get(key);
    if (!e) {
      e = { status: 'missing', refs: 0, listeners: new Set(), generation: 0 };
      this.entries.set(key, e);
    }
    return e;
  }

  private notify(e: Entry) {
    for (const cb of [...e.listeners]) cb();
  }

  private async decode(key: string, e: Entry) {
    const gen = ++e.generation;
    e.status = 'loading';
    try {
      const blob = await this.load(key);
      if (gen !== e.generation) return;
      if (!blob) {
        e.status = 'missing';
        this.notify(e);
        return;
      }
      const image = await createImageBitmap(blob);
      if (gen !== e.generation || e.refs === 0) {
        image.close();
        if (gen === e.generation) e.status = 'missing';
        return;
      }
      e.image?.close();
      e.image = image;
      e.status = 'ready';
    } catch (err) {
      if (gen !== e.generation) return;
      console.warn('Image decode failed', key, err);
      e.status = 'error';
    }
    this.notify(e);
  }

  /** Marks the image as used; returns the matching release. */
  acquire(key: string): () => void {
    const e = this.entry(key);
    e.refs++;
    clearTimeout(e.releaseTimer);
    if (e.status === 'missing') void this.decode(key, e);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      e.refs--;
      if (e.refs === 0) e.releaseTimer = setTimeout(() => this.evict(key), this.releaseDelay);
    };
  }

  private evict(key: string) {
    const e = this.entries.get(key);
    if (!e || e.refs > 0) return;
    e.generation++;
    e.image?.close();
    e.image = undefined;
    e.status = 'missing';
    if (e.listeners.size === 0) this.entries.delete(key);
    else this.notify(e);
  }

  /** The data behind `key` became available or changed: decode again if in use. */
  invalidate(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    if (e.refs > 0) void this.decode(key, e);
    else this.evict(key);
  }

  get(key: string): ImageBitmap | undefined {
    return this.entries.get(key)?.image;
  }

  status(key: string): Status {
    return this.entries.get(key)?.status ?? 'missing';
  }

  subscribe(key: string, cb: () => void): () => void {
    const e = this.entry(key);
    e.listeners.add(cb);
    return () => e.listeners.delete(cb);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

/** Decoded image for `key` while the calling component is mounted. */
export function useBitmap(cache: BitmapCache, key: string | undefined): ImageBitmap | undefined {
  useEffect(() => (key ? cache.acquire(key) : undefined), [cache, key]);
  return useSyncExternalStore(
    (cb) => (key ? cache.subscribe(key, cb) : () => {}),
    () => (key ? cache.get(key) : undefined),
  );
}

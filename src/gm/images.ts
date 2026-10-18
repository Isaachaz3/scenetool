import { useEffect, useState } from 'react';
import { THUMB_SIZE } from '../core/constants';
import { remoteFiles } from '../cloud/remote';
import type { Asset, Id } from '../core/types';
import { db } from '../db/db';
import { BitmapCache } from '../render/bitmapCache';
import { getGm } from '../state/store';

/** Original file of an asset: from IndexedDB, or downloaded from the cloud and kept locally. */
export async function getAssetBlob(asset: Asset): Promise<Blob | undefined> {
  const local = (await db.blobs.get(asset.blobId))?.blob;
  if (local) return local;
  const remote = await remoteFiles.file?.(asset).catch(() => null);
  if (!remote) return undefined;
  await db.blobs.put({ id: asset.blobId, kind: 'file', blob: remote });
  return remote;
}

/** Full-size images of the GM window, keyed by asset id. */
export const gmImages = new BitmapCache(async (assetId) => {
  const asset = getGm().assets[assetId];
  if (!asset) return null;
  return getAssetBlob(asset);
});

// --- thumbnails as object URLs ---------------------------------------------------------------

const thumbUrls = new Map<Id, string>();
const thumbListeners = new Map<Id, Set<() => void>>();

export function notifyThumb(thumbId: Id): void {
  const old = thumbUrls.get(thumbId);
  if (old) URL.revokeObjectURL(old);
  thumbUrls.delete(thumbId);
  for (const cb of thumbListeners.get(thumbId) ?? []) cb();
}

async function loadThumb(thumbId: Id): Promise<string | undefined> {
  const cached = thumbUrls.get(thumbId);
  if (cached) return cached;
  let blob = (await db.blobs.get(thumbId))?.blob;
  if (!blob) {
    blob = (await remoteFiles.thumb?.(thumbId).catch(() => null)) ?? undefined;
    if (!blob) return undefined;
    await db.blobs.put({ id: thumbId, kind: 'thumb', blob });
  }
  const url = thumbUrls.get(thumbId) ?? URL.createObjectURL(blob);
  thumbUrls.set(thumbId, url);
  return url;
}

/** Object URL of a stored thumbnail; updates when the thumbnail is (re)generated. */
export function useThumbUrl(thumbId: Id | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (thumbId ? thumbUrls.get(thumbId) : undefined));
  useEffect(() => {
    if (!thumbId) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    const refresh = () => void loadThumb(thumbId).then((u) => alive && setUrl(u));
    refresh();
    let set = thumbListeners.get(thumbId);
    if (!set) thumbListeners.set(thumbId, (set = new Set()));
    set.add(refresh);
    return () => {
      alive = false;
      set.delete(refresh);
    };
  }, [thumbId]);
  return url;
}

/** ~256 px WebP preview. */
export async function makeThumbnail(blob: Blob, width: number, height: number): Promise<Blob> {
  const k = Math.min(1, THUMB_SIZE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  } catch {
    bmp = await createImageBitmap(blob);
  }
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      return await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.85),
    );
  } finally {
    bmp.close();
  }
}

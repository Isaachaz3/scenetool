import { focusFromPixels } from '../core/cover';
import type { Asset, Vec2 } from '../core/types';
import { db } from '../db/db';
import { getAssetBlob } from './images';

const SAMPLE = 64; // px on the longer side

/** Automatic focus of a backdrop, from its thumbnail (or the original while that is missing). */
export async function detectFocus(asset: Asset): Promise<Vec2> {
  const blob = (await db.blobs.get(asset.thumbId))?.blob ?? (await getAssetBlob(asset));
  if (!blob) return { x: 0.5, y: 0.5 };
  const k = SAMPLE / Math.max(asset.width, asset.height);
  const w = Math.max(2, Math.round(asset.width * k));
  const h = Math.max(2, Math.round(asset.height * k));
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  try {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, w, h);
    return focusFromPixels(ctx.getImageData(0, 0, w, h).data, w, h);
  } finally {
    bmp.close();
  }
}

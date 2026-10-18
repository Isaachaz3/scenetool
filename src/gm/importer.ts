import { nanoid } from 'nanoid';
import { MAP_GUESS_WIDTH } from '../core/constants';
import { detectGrid, type GridDetection, type SizeOverride } from '../core/dpi/detect';
import { baseName } from '../core/dpi/filename';
import { readImageInfo, type ImageInfo } from '../core/dpi/metadata';
import { sha256Hex } from '../core/sha256';
import type { Asset, AssetDefaults, AssetType, Id, ImageGrid } from '../core/types';
import { db } from '../db/db';
import { getGm, setGm } from '../state/store';
import { makeThumbnail, notifyThumb } from './images';

export interface AnalyzedFile {
  file: File;
  name: string; // file name without extension
  mime: string;
  hash: string;
  width: number;
  height: number;
  info: ImageInfo;
  existing?: Asset; // same file already in the library
}

const MIME_BY_FORMAT: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const ACCEPTED = /^image\/(png|jpeg|webp|avif|gif)$/;

export const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

export class ImportError extends Error {
  constructor(
    message: string,
    readonly fileName: string,
  ) {
    super(message);
  }
}

export function isImageFile(file: File): boolean {
  return ACCEPTED.test(file.type) || /\.(png|jpe?g|webp|avif|gif)$/i.test(file.name);
}

/** Reads size, metadata and hash of a dropped or picked file. */
export async function analyzeFile(file: File): Promise<AnalyzedFile> {
  const bytes = await file.arrayBuffer();
  const info = readImageInfo(new Uint8Array(bytes));
  let mime = MIME_BY_FORMAT[info.format] ?? file.type;
  if (!mime && /\.avif$/i.test(file.name)) mime = 'image/avif';
  if (!ACCEPTED.test(mime)) throw new ImportError('unsupported', file.name);
  let { width, height } = info;
  if (!width || !height) {
    // AVIF and anything we cannot parse: let the browser decode it once.
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime })).catch(() => null);
    if (!bmp) throw new ImportError('unsupported', file.name);
    width = bmp.width;
    height = bmp.height;
    bmp.close();
  }
  const hash = await sha256Hex(bytes);
  const existing = Object.values(getGm().assets).find((a) => a.hash === hash);
  return { file, name: baseName(file.name), mime, hash, width, height, info, existing };
}

/** Drop on the canvas: wide images are maps, everything else is a character. */
export function guessType(a: AnalyzedFile): AssetType {
  return a.width > MAP_GUESS_WIDTH ? 'map' : 'character';
}

export function detectFor(a: AnalyzedFile, type: AssetType, size?: SizeOverride): GridDetection {
  return detectGrid(type, a.file.name, a.info, a.width, a.height, size);
}

export interface AssetOptions {
  type: AssetType;
  collectionId: Id;
  grid: ImageGrid;
  defaults: AssetDefaults;
  name?: string;
}

export function defaultsFor(type: AssetType): AssetDefaults {
  return { visible: true, locked: type === 'map', rotation: 0 };
}

/**
 * Stores the file and adds the asset to the library right away; the thumbnail is made in the
 * background. A file that is already in the library is returned as is.
 */
export async function createAsset(a: AnalyzedFile, opts: AssetOptions): Promise<Asset> {
  const dup = a.existing ?? Object.values(getGm().assets).find((x) => x.hash === a.hash);
  if (dup) return dup;
  const now = Date.now();
  const asset: Asset = {
    id: nanoid(),
    type: opts.type,
    name: opts.name ?? a.name,
    collectionId: opts.collectionId,
    blobId: nanoid(),
    thumbId: nanoid(),
    hash: a.hash,
    mime: a.mime,
    size: a.file.size,
    width: a.width,
    height: a.height,
    grid: opts.grid,
    defaults: opts.defaults,
    createdAt: now,
    updatedAt: now,
  };
  const blob = a.file.type === a.mime ? a.file : new Blob([a.file], { type: a.mime });
  await db.transaction('rw', db.blobs, db.assets, async () => {
    await db.blobs.put({ id: asset.blobId, kind: 'file', blob });
    await db.assets.put(asset);
  });
  setGm((d) => {
    d.assets[asset.id] = asset;
  });
  void makeThumbnail(blob, a.width, a.height)
    .then((thumb) => db.blobs.put({ id: asset.thumbId, kind: 'thumb', blob: thumb }))
    .then(() => notifyThumb(asset.thumbId))
    .catch((err) => console.warn('Thumbnail failed', a.file.name, err));
  return asset;
}

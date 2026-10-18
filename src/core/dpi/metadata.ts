// Minimal readers for image headers: pixel size and DPI metadata of PNG, JPEG, WebP and GIF.

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';
export type DpiTag = 'pHYs' | 'JFIF' | 'EXIF';

export interface DpiCandidate {
  dpi: number;
  tag: DpiTag;
}

export interface ImageInfo {
  format: ImageFormat;
  width?: number;
  height?: number;
  dpi: DpiCandidate[];
}

const INCH_PER_METER = 0.0254;
const CM_PER_INCH = 2.54;

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i++) s += String.fromCharCode(b[at + i]);
  return s;
}

export function readImageInfo(bytes: Uint8Array): ImageInfo {
  try {
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return readPng(bytes);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return readWebp(bytes);
    if (ascii(bytes, 0, 4) === 'GIF8') return readGif(bytes);
  } catch {
    // Truncated or malformed headers fall through to an unknown format.
  }
  return { format: 'unknown', dpi: [] };
}

function readPng(b: Uint8Array): ImageInfo {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const info: ImageInfo = { format: 'png', dpi: [] };
  let p = 8;
  while (p + 8 <= b.length) {
    const len = v.getUint32(p);
    const type = ascii(b, p + 4, 4);
    const data = p + 8;
    if (type === 'IHDR') {
      info.width = v.getUint32(data);
      info.height = v.getUint32(data + 4);
    } else if (type === 'pHYs' && len >= 9) {
      const ppuX = v.getUint32(data);
      const unit = b[data + 8];
      if (unit === 1 && ppuX > 0) info.dpi.push({ dpi: ppuX * INCH_PER_METER, tag: 'pHYs' });
    } else if (type === 'IDAT' || type === 'IEND') {
      break; // pHYs must precede the image data
    }
    p = data + len + 4; // skip data and CRC
  }
  return info;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpeg(b: Uint8Array): ImageInfo {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const info: ImageInfo = { format: 'jpeg', dpi: [] };
  let orientation = 1;
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) break;
    const marker = b[p + 1];
    if (marker === 0xff) {
      p++; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    const len = v.getUint16(p + 2);
    const data = p + 4;
    if (marker === 0xe0 && ascii(b, data, 5) === 'JFIF\0') {
      const units = b[data + 7];
      const xDensity = v.getUint16(data + 8);
      if (xDensity > 0 && units === 1) info.dpi.push({ dpi: xDensity, tag: 'JFIF' });
      if (xDensity > 0 && units === 2) info.dpi.push({ dpi: xDensity * CM_PER_INCH, tag: 'JFIF' });
    } else if (marker === 0xe1 && ascii(b, data, 6) === 'Exif\0\0') {
      const exif = readTiff(b.subarray(data + 6, data + len - 2));
      if (exif.dpi) info.dpi.push({ dpi: exif.dpi, tag: 'EXIF' });
      orientation = exif.orientation;
    } else if (SOF_MARKERS.has(marker)) {
      info.height = v.getUint16(data + 1);
      info.width = v.getUint16(data + 3);
    }
    p = data + len - 2;
  }
  // Orientations 5–8 rotate by 90°: browsers decode the image with swapped sides.
  if (orientation >= 5 && orientation <= 8 && info.width && info.height) {
    [info.width, info.height] = [info.height, info.width];
  }
  return info;
}

/** XResolution and Orientation from a TIFF structure (EXIF payload). */
export function readTiff(b: Uint8Array): { dpi?: number; orientation: number } {
  const result: { dpi?: number; orientation: number } = { orientation: 1 };
  if (b.length < 8) return result;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const order = ascii(b, 0, 2);
  if (order !== 'II' && order !== 'MM') return result;
  const le = order === 'II';
  if (v.getUint16(2, le) !== 42) return result;
  const ifd = v.getUint32(4, le);
  if (ifd + 2 > b.length) return result;
  const count = v.getUint16(ifd, le);
  let xRes: number | undefined;
  let unit = 2; // inches by default
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > b.length) break;
    const tag = v.getUint16(e, le);
    const type = v.getUint16(e + 2, le);
    if (tag === 0x011a && type === 5) {
      const off = v.getUint32(e + 8, le);
      if (off + 8 <= b.length) {
        const num = v.getUint32(off, le);
        const den = v.getUint32(off + 4, le);
        if (den > 0 && num > 0) xRes = num / den;
      }
    } else if (tag === 0x0128 && type === 3) {
      unit = v.getUint16(e + 8, le);
    } else if (tag === 0x0112 && type === 3) {
      result.orientation = v.getUint16(e + 8, le);
    }
  }
  if (xRes !== undefined && unit === 2) result.dpi = xRes;
  if (xRes !== undefined && unit === 3) result.dpi = xRes * CM_PER_INCH;
  return result;
}

function readWebp(b: Uint8Array): ImageInfo {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const info: ImageInfo = { format: 'webp', dpi: [] };
  let p = 12;
  while (p + 8 <= b.length) {
    const type = ascii(b, p, 4);
    const len = v.getUint32(p + 4, true);
    const data = p + 8;
    if (type === 'VP8X') {
      info.width = 1 + (b[data + 4] | (b[data + 5] << 8) | (b[data + 6] << 16));
      info.height = 1 + (b[data + 7] | (b[data + 8] << 8) | (b[data + 9] << 16));
    } else if (type === 'VP8 ' && info.width === undefined) {
      info.width = v.getUint16(data + 6, true) & 0x3fff;
      info.height = v.getUint16(data + 8, true) & 0x3fff;
    } else if (type === 'VP8L' && info.width === undefined) {
      const bits = v.getUint32(data + 1, true);
      info.width = (bits & 0x3fff) + 1;
      info.height = ((bits >> 14) & 0x3fff) + 1;
    } else if (type === 'EXIF') {
      let start = data;
      if (ascii(b, data, 6) === 'Exif\0\0') start += 6;
      const exif = readTiff(b.subarray(start, data + len));
      if (exif.dpi) info.dpi.push({ dpi: exif.dpi, tag: 'EXIF' });
    }
    p = data + len + (len & 1);
  }
  return info;
}

function readGif(b: Uint8Array): ImageInfo {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { format: 'gif', width: v.getUint16(6, true), height: v.getUint16(8, true), dpi: [] };
}

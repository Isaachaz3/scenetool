// Backdrops fill the whole screen: the picture is scaled to cover it and the part that is cut
// off is chosen around a focus point, found automatically and adjustable by the GM.
import type { Size, Vec2 } from './types';

/** Part of the image (0..1 on each axis) a box of `box` size shows when covered. */
export function coverWindow(
  img: Size,
  box: Size,
  focus: Vec2,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(box.width / img.width, box.height / img.height);
  const w = Math.min(1, box.width / scale / img.width);
  const h = Math.min(1, box.height / scale / img.height);
  const clamp = (c: number, size: number) => Math.min(1 - size, Math.max(0, c - size / 2));
  return { x: clamp(focus.x, w), y: clamp(focus.y, h), w, h };
}

/** CSS object-position (percent) that puts that window on screen with object-fit: cover. */
export function coverPosition(img: Size, box: Size, focus: Vec2): { x: number; y: number } {
  const win = coverWindow(img, box, focus);
  const pct = (start: number, size: number) => (size >= 1 ? 50 : (start / (1 - size)) * 100);
  return { x: pct(win.x, win.w), y: pct(win.y, win.h) };
}

/**
 * Focus of a small RGBA image: centroid of the detail (squared luminance gradient), leaning
 * toward the center so that a busy edge does not win over the subject.
 */
export function focusFromPixels(data: ArrayLike<number>, width: number, height: number): Vec2 {
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++)
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const g = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + width] - lum[i - width]);
      const dx = (x + 0.5) / width - 0.5;
      const dy = (y + 0.5) / height - 0.5;
      const weight = g * g * (1 - (dx * dx + dy * dy));
      sx += weight * (x + 0.5);
      sy += weight * (y + 0.5);
      total += weight;
    }
  }
  if (total === 0) return { x: 0.5, y: 0.5 };
  return { x: sx / total / width, y: sy / total / height };
}

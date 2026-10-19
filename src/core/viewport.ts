import { MAX_ZOOM, MIN_ZOOM } from './constants';
import type { Rect } from './geometry';
import type { Size, Vec2, Viewport } from './types';

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function worldToScreen(p: Vec2, v: Viewport, screen: Size): Vec2 {
  return { x: (p.x - v.x) * v.zoom + screen.width / 2, y: (p.y - v.y) * v.zoom + screen.height / 2 };
}

export function screenToWorld(p: Vec2, v: Viewport, screen: Size): Vec2 {
  return { x: (p.x - screen.width / 2) / v.zoom + v.x, y: (p.y - screen.height / 2) / v.zoom + v.y };
}

/** Zooms by `factor` keeping the world point under `screenPoint` fixed. */
export function zoomAt(v: Viewport, factor: number, screenPoint: Vec2, screen: Size): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const world = screenToWorld(screenPoint, v, screen);
  return {
    zoom,
    x: world.x - (screenPoint.x - screen.width / 2) / zoom,
    y: world.y - (screenPoint.y - screen.height / 2) / zoom,
  };
}

/** Moves the view by a screen-space delta (dragging the canvas by `delta`). */
export function panBy(v: Viewport, delta: Vec2): Viewport {
  return { ...v, x: v.x - delta.x / v.zoom, y: v.y - delta.y / v.zoom };
}

/** Viewport that fits `rect` into the screen with a margin (fraction of the screen). */
export function fitRect(rect: Rect, screen: Size, margin = 0.05): Viewport {
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  const zoom = clampZoom(
    Math.min((screen.width * (1 - 2 * margin)) / w, (screen.height * (1 - 2 * margin)) / h),
  );
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, zoom };
}

/** World rectangle visible on screen. */
export function visibleRect(v: Viewport, screen: Size): Rect {
  const width = screen.width / v.zoom;
  const height = screen.height / v.zoom;
  return { x: v.x - width / 2, y: v.y - height / 2, width, height };
}

/**
 * The player screen keeps the GM center and picks a zoom that shows the whole GM area:
 * zoomPlayer = zoomGm × min(Wp / Wg, Hp / Hg).
 */
export function playerZoom(gmZoom: number, gm: Size, player: Size): number {
  if (gm.width <= 0 || gm.height <= 0) return gmZoom;
  return clampZoom(gmZoom * Math.min(player.width / gm.width, player.height / gm.height));
}

/**
 * playerViewport.zoom is stored for the reference screen it was computed for. Another screen
 * size shows the same area: zoom × min(W / Wref, H / Href).
 */
export function viewportForScreen(v: Viewport, ref: Size | undefined, screen: Size | undefined): Viewport {
  if (!ref || !screen || ref.width <= 0 || ref.height <= 0) return v;
  const k = Math.min(screen.width / ref.width, screen.height / ref.height);
  return { ...v, zoom: clampZoom(v.zoom * k) };
}

export function viewportsEqual(a: Viewport, b: Viewport): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

/** Ease-in-out interpolation between two viewports; zoom is interpolated in log space. */
export function lerpViewport(a: Viewport, b: Viewport, t: number): Viewport {
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, zoom };
}

/** World rectangle a player screen of `screen` size shows for the stored player view. */
export function playerFrameRect(v: Viewport, ref: Size | undefined, screen: Size): Rect {
  const actual = viewportForScreen(v, ref, screen);
  return visibleRect(actual, screen);
}

/**
 * Zoom of the player view whose corner is at `corner`: the frame keeps the screen proportions
 * and follows the pointer along whichever side it reaches first.
 */
export function zoomForFrameCorner(center: Vec2, corner: Vec2, screen: Size): number {
  const halfW = Math.max(
    Math.abs(corner.x - center.x),
    (Math.abs(corner.y - center.y) * screen.width) / screen.height,
  );
  return clampZoom(screen.width / (2 * Math.max(halfW, 1)));
}

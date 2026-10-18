import { tokenGrid } from '../geometry';
import type { AssetType, ImageGrid } from '../types';
import { parseGridFromName } from './filename';
import type { ImageFormat, ImageInfo } from './metadata';

export const FALLBACK_DPI = 150;
/** Common "no real value" DPI defaults; such metadata is flagged for checking. */
const DEFAULT_DPIS = [72, 96];
const TOLERANCE_PX = 1;

export interface GridDetection {
  grid: ImageGrid;
  cols: number;
  rows: number;
  /** Ask the user to check the alignment. */
  needsCheck: boolean;
  /** Filename source: the rows disagree with the columns by more than a pixel per cell. */
  aspectMismatch?: boolean;
  /** Metadata source: the container the value came from. */
  format?: ImageFormat;
}

function gridOf(dpi: number, source: ImageGrid['source']): ImageGrid {
  return { dpi, offset: { x: 0, y: 0 }, source };
}

function withCells(width: number, height: number, grid: ImageGrid, needsCheck: boolean): GridDetection {
  return { grid, cols: width / grid.dpi, rows: height / grid.dpi, needsCheck };
}

/** Pixels-per-meter rounding turns 150 DPI into 150.01; snap such values back. */
function normalizeDpi(dpi: number): number {
  const r = Math.round(dpi);
  return Math.abs(dpi - r) < 0.05 ? r : Math.round(dpi * 100) / 100;
}

/** A metadata DPI is accepted only when both sides divide by it within one pixel. */
export function dividesEvenly(width: number, height: number, dpi: number): boolean {
  if (dpi <= 0) return false;
  const cols = Math.round(width / dpi);
  const rows = Math.round(height / dpi);
  return (
    cols >= 1 &&
    rows >= 1 &&
    Math.abs(cols * dpi - width) <= TOLERANCE_PX &&
    Math.abs(rows * dpi - height) <= TOLERANCE_PX
  );
}

export function fromFilename(name: string, width: number, height: number): GridDetection | null {
  const g = parseGridFromName(name);
  if (!g) return null;
  const dpi = width / g.cols;
  const aspectMismatch = Math.abs(height / g.rows - dpi) > TOLERANCE_PX;
  return {
    grid: gridOf(dpi, 'filename'),
    cols: g.cols,
    rows: height / dpi,
    needsCheck: aspectMismatch,
    aspectMismatch,
  };
}

export function fromMetadata(info: ImageInfo, width: number, height: number): GridDetection | null {
  const accepted = info.dpi
    .map((c) => normalizeDpi(c.dpi))
    .filter((dpi) => dividesEvenly(width, height, dpi));
  if (accepted.length === 0) return null;
  // Prefer a real value over the 72/96 defaults when several tags disagree.
  const dpi = accepted.find((d) => !DEFAULT_DPIS.includes(d)) ?? accepted[0];
  return {
    ...withCells(width, height, gridOf(dpi, 'metadata'), DEFAULT_DPIS.includes(dpi)),
    cols: Math.round(width / dpi),
    rows: Math.round(height / dpi),
    format: info.format,
  };
}

export function fallbackGrid(width: number, height: number): GridDetection {
  return withCells(width, height, gridOf(FALLBACK_DPI, 'fallback'), true);
}

/** Map grid cascade: file name → DPI metadata → fallback (Universal VTT comes in stage 3). */
export function detectMapGrid(name: string, info: ImageInfo, width: number, height: number): GridDetection {
  return (
    fromFilename(name, width, height) ?? fromMetadata(info, width, height) ?? fallbackGrid(width, height)
  );
}

/** Tokens, mounts, attachments and notes: one cell by the larger side, anchored at the center. */
export function detectTokenGrid(width: number, height: number, sizeCells = 1): GridDetection {
  const grid = tokenGrid(width, height, sizeCells);
  return { grid, cols: width / grid.dpi, rows: height / grid.dpi, needsCheck: false };
}

/** Props: "N x M" from the file name, otherwise one cell; anchored at the center. */
export function detectPropGrid(name: string, width: number, height: number): GridDetection {
  const g = fromFilename(name, width, height);
  if (!g) return detectTokenGrid(width, height);
  return { ...g, grid: { ...g.grid, offset: { x: width / 2, y: height / 2 } } };
}

export type SizeMode = 'auto' | 'dpi' | 'cols' | 'rows';

export interface SizeOverride {
  mode: SizeMode;
  value: number;
}

/** Grid for a new asset of `type`, applying the importer's size setting. */
export function detectGrid(
  type: AssetType,
  name: string,
  info: ImageInfo,
  width: number,
  height: number,
  size: SizeOverride = { mode: 'auto', value: 0 },
): GridDetection {
  const isMap = type === 'map';
  if (size.mode !== 'auto' && size.value > 0) {
    const dpi =
      size.mode === 'dpi' ? size.value : size.mode === 'cols' ? width / size.value : height / size.value;
    const offset = isMap ? { x: 0, y: 0 } : { x: width / 2, y: height / 2 };
    return withCells(width, height, { dpi, offset, source: 'manual' }, false);
  }
  if (isMap) return detectMapGrid(name, info, width, height);
  if (type === 'prop') return detectPropGrid(name, width, height);
  return detectTokenGrid(width, height);
}

/** Columns ↔ rows ↔ DPI follow each other through the image proportions. */
export function dpiFromCols(width: number, cols: number): number {
  return width / cols;
}

export function dpiFromRows(height: number, rows: number): number {
  return height / rows;
}

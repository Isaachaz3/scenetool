import type { GridScale } from './types';

/**
 * Parses a grid scale such as "5ft", "1,5м" or "5.00mi". The number of digits after the
 * separator sets the precision of every measurement; comma and dot are equivalent.
 */
export function parseScale(input: string): GridScale | null {
  const m = /^\s*(\d+(?:[.,](\d+))?)\s*(\S.*?)?\s*$/u.exec(input);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: m[3] ?? '', decimals: m[2]?.length ?? 0 };
}

/** Formats with the scale's precision; a comma is used when the unit is Cyrillic. */
export function formatNumber(value: number, decimals: number, comma: boolean): string {
  const s = value.toFixed(decimals);
  return comma ? s.replace('.', ',') : s;
}

function usesComma(unit: string): boolean {
  return /[Ѐ-ӿ]/u.test(unit);
}

export function formatScale(scale: GridScale): string {
  return formatNumber(scale.value, scale.decimals, usesComma(scale.unit)) + scale.unit;
}

/** Distance in cells → label like "25ft" or "7,5м". */
export function formatDistance(cells: number, scale: GridScale): string {
  const v = cells * scale.value;
  return formatNumber(v, scale.decimals, usesComma(scale.unit)) + scale.unit;
}

/**
 * Grid size in a file name such as "Tavern 30x20.png" or "таверна 30х20.jpg": latin "x",
 * cyrillic "х" or "×". Digit boundaries keep pixel sizes like 4350x3300 from matching.
 */
const GRID_IN_NAME = /(?<!\d)(\d{1,3})\s*[xх×]\s*(\d{1,3})(?!\d)/gi;

const MAX_CELLS = 300;

export function parseGridFromName(name: string): { cols: number; rows: number } | null {
  for (const m of name.matchAll(GRID_IN_NAME)) {
    const cols = Number(m[1]);
    const rows = Number(m[2]);
    if (cols >= 1 && rows >= 1 && cols <= MAX_CELLS && rows <= MAX_CELLS) return { cols, rows };
  }
  return null;
}

/** File name without its extension. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim() || fileName;
}

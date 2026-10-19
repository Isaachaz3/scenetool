import type { GridDetection } from '../../core/dpi/detect';
import { t } from '../../i18n/ru';

const FORMAT_NAMES: Record<string, string> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', gif: 'GIF' };

/** "Метаданные PNG: 150 DPI → 29 × 22 клетки" plus a warning when the user should check. */
export function describeDetection(d: GridDetection): { text: string; warning?: string } {
  const { grid, cols, rows } = d;
  switch (grid.source) {
    case 'filename':
      return {
        text: t.gridSource.filename(cols, rows),
        warning: d.aspectMismatch ? t.gridSource.aspectMismatch : undefined,
      };
    case 'metadata':
      return {
        text: t.gridSource.metadata(FORMAT_NAMES[d.format ?? ''] ?? '', grid.dpi, cols, rows),
        warning: d.needsCheck ? t.gridSource.check : undefined,
      };
    case 'manual':
      return { text: t.gridSource.manual(grid.dpi, cols, rows) };
    case 'uvtt':
      return { text: t.gridSource.uvtt };
    case 'heuristic':
      return { text: t.gridSource.heuristic(grid.dpi, cols, rows), warning: t.gridSource.pickCandidate };
    default:
      return {
        text: t.gridSource.fallback(grid.dpi, cols, rows),
        warning: d.needsCheck ? t.gridSource.checkAlignment : undefined,
      };
  }
}

import { CELL } from '../../core/constants';
import type { Vec2 } from '../../core/types';
import { screenToWorld } from '../../core/viewport';
import { t } from '../../i18n/ru';
import { placeAsset } from '../../state/items';
import { activeScene, getGm } from '../../state/store';
import { getUi, toast } from '../../state/ui';
import { analyzeFile, createAsset, defaultsFor, detectFor, guessType, isImageFile } from '../importer';

export const ASSET_MIME = 'application/x-vtt-asset';

export function isCanvasDrag(dt: DataTransfer): boolean {
  return dt.types.includes('Files') || dt.types.includes(ASSET_MIME);
}

/**
 * A library thumbnail dropped on the canvas is placed at the drop point. Files go to the
 * library first (type guessed by width, grid detected automatically) and are placed too.
 */
export async function handleCanvasDrop(dt: DataTransfer, screenPoint: Vec2): Promise<void> {
  const scene = activeScene();
  if (!scene) return;
  const world = screenToWorld(screenPoint, scene.gmViewport, getUi().screen);
  const assetId = dt.getData(ASSET_MIME);
  if (assetId) {
    const asset = getGm().assets[assetId];
    if (asset) placeAsset(asset, world);
    return;
  }
  const files = [...dt.files].filter(isImageFile);
  let i = 0;
  for (const file of files) {
    try {
      const a = await analyzeFile(file);
      const type = a.existing?.type ?? guessType(a);
      const asset = await createAsset(a, {
        type,
        collectionId: getGm().collectionId,
        grid: detectFor(a, type).grid,
        defaults: defaultsFor(type),
      });
      placeAsset(asset, { x: world.x + i * CELL, y: world.y + i * CELL });
      i++;
    } catch (err) {
      console.warn(err);
      toast(`${file.name}: ${t.importer.unsupported}`, 'error');
    }
  }
}

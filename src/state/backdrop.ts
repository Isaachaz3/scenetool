import type { Asset, Id, Vec2 } from '../core/types';
import { updateAsset } from './assets';
import { getGm, useGm, type GmState } from './store';
import { useUi } from './ui';

/** Finds the automatic focus of a backdrop shown for the first time (set by the GM window). */
export const focusFinder: { find: ((asset: Asset) => Promise<Vec2>) | null } = { find: null };

/** Shows a backdrop over the scene on both screens; null hides it. */
export function showBackdrop(id: Id | null): void {
  useGm.setState({ backdropId: id });
  useUi.setState({ backdropMinimized: false });
  const asset = id ? getGm().assets[id] : undefined;
  if (asset && !asset.focus && focusFinder.find) {
    void focusFinder.find(asset).then((focus) => {
      if (!getGm().assets[asset.id]?.focus) void updateAsset(asset.id, { focus });
    });
  }
}

/** Where the full-screen crop of a backdrop is centered; null goes back to the automatic one. */
export async function setBackdropFocus(id: Id, focus: Vec2 | null): Promise<void> {
  const asset = getGm().assets[id];
  if (!asset) return;
  const next = focus ?? (focusFinder.find ? await focusFinder.find(asset) : { x: 0.5, y: 0.5 });
  await updateAsset(id, { focus: next });
}

/** Dock click: like opening a scene, and a second click on the shown backdrop hides it. */
export function toggleBackdrop(id: Id): void {
  showBackdrop(getGm().backdropId === id ? null : id);
}

/** The backdrop on screen; none when its asset is gone or is no longer a backdrop. */
export function shownBackdrop(s: GmState = getGm()): Asset | null {
  const a = s.backdropId ? s.assets[s.backdropId] : undefined;
  return a?.type === 'backdrop' ? a : null;
}

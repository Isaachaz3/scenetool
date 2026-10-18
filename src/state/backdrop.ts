import type { Asset, Id } from '../core/types';
import { getGm, useGm, type GmState } from './store';
import { useUi } from './ui';

/** Shows a backdrop over the scene on both screens; null hides it. */
export function showBackdrop(id: Id | null): void {
  useGm.setState({ backdropId: id });
  useUi.setState({ backdropMinimized: false });
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

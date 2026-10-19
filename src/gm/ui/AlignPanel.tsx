import { useEffect } from 'react';
import { snapToIntersection } from '../../core/geometry';
import type { Id, ImageGrid } from '../../core/types';
import { t } from '../../i18n/ru';
import { activeScene, changeScene, getGm, useGm } from '../../state/store';
import { Panel } from './common';
import { useBitmap } from '../../render/bitmapCache';
import { gmImages } from '../images';
import { GridFitFields, nudgeGrid } from './GridFit';
import { VisualAlignButton } from './VisualAlign';

/** "Выровнять по сетке": the map's anchor goes to a grid intersection and its grid is edited live. */
export function startAlign(itemId: Id): void {
  const scene = activeScene();
  const item = scene?.items[itemId];
  if (!item || item.kind !== 'image') return;
  useGm.setState({ align: { itemId, original: item.grid, position: item.position }, selection: [itemId] });
  changeScene(
    (d) => {
      d.items[itemId].position = snapToIntersection(item.position);
    },
    { history: false },
  );
}

function setLive(grid: ImageGrid) {
  const a = getGm().align;
  if (!a) return;
  changeScene(
    (d) => {
      const it = d.items[a.itemId];
      if (it?.kind === 'image') it.grid = grid;
    },
    { history: false },
  );
}

function finish(keep: boolean) {
  const a = getGm().align;
  const item = a ? activeScene()?.items[a.itemId] : undefined;
  useGm.setState({ align: null });
  if (!a || item?.kind !== 'image') return;
  const final = { grid: item.grid, position: item.position };
  // Back to the original without history, then one undoable step to the result.
  changeScene(
    (d) => {
      const it = d.items[a.itemId];
      if (it?.kind !== 'image') return;
      it.grid = a.original;
      it.position = a.position;
    },
    { history: false },
  );
  if (keep) {
    changeScene((d) => {
      const it = d.items[a.itemId];
      if (it?.kind !== 'image') return;
      it.grid = final.grid;
      it.position = final.position;
    });
  }
}

export function AlignPanel() {
  const align = useGm((s) => s.align);
  const item = useGm((s) => (s.align ? activeScene(s)?.items[s.align.itemId] : undefined));
  const asset = useGm((s) => (item?.kind === 'image' ? s.assets[item.assetId] : undefined));
  const image = useBitmap(gmImages, asset?.id);

  useEffect(() => {
    if (!align) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT';
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
        return;
      }
      if (typing) return;
      const it = activeScene()?.items[align.itemId];
      if (it?.kind !== 'image') return;
      // On the scene the grid is fixed, so the map itself follows the arrows.
      const next = nudgeGrid(e, it.grid, -1);
      if (next) {
        e.preventDefault();
        setLive(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [align]);

  // The item may disappear (undo, scene switch): leave the mode.
  useEffect(() => {
    if (align && !item) useGm.setState({ align: null });
  }, [align, item]);

  if (!align || item?.kind !== 'image' || !asset) return null;
  return (
    <Panel className="align-panel">
      <h3>{t.align.title}</h3>
      <GridFitFields width={asset.width} height={asset.height} grid={item.grid} onChange={setLive} />
      <p className="hint">{t.align.keysHint}</p>
      <div className="row end">
        <VisualAlignButton
          image={image}
          width={asset.width}
          height={asset.height}
          grid={item.grid}
          onChange={setLive}
        />
        <button type="button" className="btn" onClick={() => setLive({ ...asset.grid })}>
          {t.align.reset}
        </button>
        <button type="button" className="btn" onClick={() => finish(false)}>
          {t.align.cancel}
        </button>
        <button type="button" className="btn primary" onClick={() => finish(true)}>
          {t.align.done}
        </button>
      </div>
    </Panel>
  );
}

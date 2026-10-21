import { Castle, Music, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_TYPES } from '../../../core/constants';
import { tokenGrid } from '../../../core/geometry';
import type { Asset, AssetDefaults, AssetType, Id, ImageGrid } from '../../../core/types';
import { t } from '../../../i18n/ru';
import { activeSceneUses, assetUsage, deleteAsset, updateAsset } from '../../../state/assets';
import { applyAssetGridToScene } from '../../../state/scenes';
import { useGm } from '../../../state/store';
import { confirmDialog, openDialog, type DockTab } from '../../../state/ui';
import { useBitmap } from '../../../render/bitmapCache';
import { gmImages } from '../../images';
import { ACCEPT_ATTR, isImageFile } from '../../importer';
import { AssetTile, CollectionSelect, SceneTile, TYPE_ICONS } from '../Dock';
import { VisualAlignButton } from '../VisualAlign';
import { AmbientLibrary } from '../AmbientLibrary';
import { Field, Modal, NumberInput, Segmented, Toggle } from '../common';
import { FitPreview, GridFitFields, nudgeGrid } from '../GridFit';

function sameGrid(a: ImageGrid, b: ImageGrid) {
  return a.dpi === b.dpi && a.offset.x === b.offset.x && a.offset.y === b.offset.y;
}

function AssetEditor({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState<AssetType>(asset.type);
  const [defaults, setDefaults] = useState<AssetDefaults>(asset.defaults);
  const [grid, setGrid] = useState<ImageGrid>(asset.grid);
  const image = useBitmap(gmImages, type === 'map' ? asset.id : undefined);
  const usage = assetUsage(asset.id);
  const isMap = type === 'map';
  const isBackdrop = type === 'backdrop';

  useEffect(() => {
    if (!isMap) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      const next = nudgeGrid(e, grid, 1);
      if (next) {
        e.preventDefault();
        setGrid(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid, isMap]);

  const sizeCells = Math.max(asset.width, asset.height) / grid.dpi;

  const save = async () => {
    const gridChanged = !sameGrid(grid, asset.grid);
    await updateAsset(asset.id, { name: name.trim() || asset.name, type, defaults, grid });
    if (gridChanged && activeSceneUses(asset.id) && (await confirmDialog(t.align.updateScene))) {
      applyAssetGridToScene(asset.id, grid);
    }
    onClose();
  };

  const remove = async () => {
    const text = usage > 0 ? t.manager.deleteUsed(asset.name, usage) : t.manager.deleteConfirm(asset.name);
    if (await confirmDialog(text)) {
      await deleteAsset(asset.id);
      onClose();
    }
  };

  return (
    <aside className="am-editor">
      <Field label={t.manager.name}>
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.manager.type}>
        <select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
          {ASSET_TYPES.map((x) => (
            <option key={x} value={x}>
              {t.assetTypeSingle[x]}
            </option>
          ))}
        </select>
      </Field>
      <p className="muted">
        {t.manager.pixels(asset.width, asset.height)} · {t.manager.usedIn(usage)}
      </p>
      {isBackdrop ? null : (
        <>
          <h3>{t.manager.defaults}</h3>
          <Field label={t.importer.visible}>
            <Toggle
              checked={defaults.visible}
              onChange={(visible) => setDefaults({ ...defaults, visible })}
            />
          </Field>
          <Field label={t.importer.locked}>
            <Toggle checked={defaults.locked} onChange={(locked) => setDefaults({ ...defaults, locked })} />
          </Field>
          <Field label={t.manager.rotation}>
            <Segmented
              value={String(defaults.rotation)}
              options={['0', '90', '180', '270'].map((v) => ({ value: v, label: `${v}°` }))}
              onChange={(v) => setDefaults({ ...defaults, rotation: Number(v) })}
            />
          </Field>
        </>
      )}
      {isBackdrop ? null : isMap ? (
        <>
          <h3>{t.align.title}</h3>
          <FitPreview image={image} width={asset.width} height={asset.height} grid={grid} />
          <p className="hint">{t.align.keysHint}</p>
          <GridFitFields width={asset.width} height={asset.height} grid={grid} onChange={setGrid} />
          <VisualAlignButton
            image={image}
            width={asset.width}
            height={asset.height}
            grid={grid}
            onChange={setGrid}
          />
        </>
      ) : (
        <Field label={t.manager.sizeCells}>
          <NumberInput
            value={sizeCells}
            min={0.1}
            decimals={2}
            step={0.5}
            onChange={(n) =>
              n > 0 && setGrid({ ...tokenGrid(asset.width, asset.height, n), source: 'manual' })
            }
          />
        </Field>
      )}
      <div className="row end">
        <button type="button" className="btn danger" onClick={() => void remove()}>
          <Trash2 size={16} /> {t.manager.delete}
        </button>
        <div className="grow" />
        <button type="button" className="btn" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn primary" onClick={() => void save()}>
          {t.manager.save}
        </button>
      </div>
    </aside>
  );
}

type ManagerTab = DockTab | 'ambient';

export function AssetManager({ tab: initialTab, assetId }: { tab?: ManagerTab; assetId?: Id }) {
  const [tab, setTab] = useState<ManagerTab>(initialTab && initialTab !== 'search' ? initialTab : 'map');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Id | null>(assetId ?? null);
  const assets = useGm((s) => s.assets);
  const scenes = useGm((s) => s.scenes);
  const collectionId = useGm((s) => s.collectionId);
  const activeId = useGm((s) => s.activeSceneId);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => openDialog(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(assets)
      .filter((a) => a.collectionId === collectionId && a.type === tab)
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [assets, collectionId, tab, query]);

  const sceneList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(scenes)
      .filter((s) => s.collectionId === collectionId && (!q || s.name.toLowerCase().includes(q)))
      .sort((a, b) => a.order - b.order);
  }, [scenes, collectionId, query]);

  const asset = selected ? assets[selected] : undefined;
  const assetType = tab !== 'scenes' && tab !== 'search' && tab !== 'ambient' ? tab : undefined;

  return (
    <Modal title={t.manager.title} onClose={close} wide className="asset-manager">
      <div
        className="am"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          const files = [...e.dataTransfer.files].filter(isImageFile);
          if (!files.length) return;
          e.preventDefault();
          openDialog({ kind: 'import', files, type: assetType ?? 'map' });
        }}
      >
        <nav className="am-tabs">
          <button type="button" className={tab === 'scenes' ? 'on' : ''} onClick={() => setTab('scenes')}>
            <Castle size={18} /> {t.dock.scenes}
          </button>
          {ASSET_TYPES.map((x) => (
            <button key={x} type="button" className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
              {TYPE_ICONS[x]} {t.assetTypes[x]}
            </button>
          ))}
          <button type="button" className={tab === 'ambient' ? 'on' : ''} onClick={() => setTab('ambient')}>
            <Music size={18} /> {t.ambient.tab}
          </button>
        </nav>
        {tab === 'ambient' ? <AmbientLibrary /> : null}
        <div className="am-main" hidden={tab === 'ambient'}>
          <div className="am-head">
            <CollectionSelect />
            <input
              className="search-input"
              placeholder={t.dock.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="grow" />
            {assetType ? (
              <>
                <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                  <Plus size={16} /> {t.dock.add}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  hidden
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = '';
                    if (files.length) openDialog({ kind: 'import', files, type: assetType });
                  }}
                />
              </>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={() => openDialog({ kind: 'sceneFromMap' })}
              >
                {t.dock.sceneFromMap}
              </button>
            )}
          </div>
          <div className="am-grid">
            {tab === 'scenes'
              ? sceneList.map((s) => <SceneTile key={s.id} scene={s} active={s.id === activeId} />)
              : list.map((a) => (
                  <AssetTile
                    key={a.id}
                    asset={a}
                    active={a.id === selected}
                    onClick={() => setSelected(a.id)}
                  />
                ))}
            {tab !== 'scenes' && list.length === 0 ? <div className="tray-empty">{t.dock.empty}</div> : null}
          </div>
        </div>
        {asset && tab !== 'scenes' && tab !== 'ambient' ? (
          <AssetEditor key={asset.id} asset={asset} onClose={() => setSelected(null)} />
        ) : null}
      </div>
    </Modal>
  );
}

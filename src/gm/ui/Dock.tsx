import {
  Box,
  Castle,
  Circle,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Map as MapIcon,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  User,
  Rabbit,
  Layers,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ASSET_TYPES } from '../../core/constants';
import type { Asset, AssetType, Scene } from '../../core/types';
import { t } from '../../i18n/ru';
import { createCollection, selectCollection } from '../../state/assets';
import { placeAsset } from '../../state/items';
import { deleteScene, duplicateScene, openScene, renameScene } from '../../state/scenes';
import { activeScene, getGm, useGm } from '../../state/store';
import { confirmDialog, openDialog, promptDialog, setDockTab, useUi, type DockTab } from '../../state/ui';
import { ASSET_MIME } from '../canvas/drop';
import { useThumbUrl } from '../images';
import { ACCEPT_ATTR, isImageFile } from '../importer';
import { IconButton, Panel, useClickOutside } from './common';

export const TYPE_ICONS: Record<AssetType, ReactNode> = {
  map: <MapIcon size={20} />,
  prop: <Box size={20} />,
  mount: <Rabbit size={20} />,
  character: <User size={20} />,
  attachment: <Paperclip size={20} />,
  note: <StickyNote size={20} />,
};

export function AssetTile({
  asset,
  onClick,
  active,
}: {
  asset: Asset;
  onClick?: () => void;
  active?: boolean;
}) {
  const url = useThumbUrl(asset.thumbId);
  return (
    <button
      type="button"
      className={'tile' + (active ? ' active' : '')}
      draggable
      title={`${asset.name}\n${t.dock.dragHint}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_MIME, asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onClick}
    >
      <span className="tile-thumb">
        {url ? <img src={url} alt="" draggable={false} /> : <ImageIcon size={24} />}
      </span>
      <span className="tile-name">{asset.name}</span>
    </button>
  );
}

export function SceneTile({ scene, active }: { scene: Scene; active: boolean }) {
  const url = useThumbUrl(scene.thumbId);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setMenu(false), menu);
  return (
    <div className={'tile scene-tile' + (active ? ' active' : '')} ref={ref}>
      <button type="button" className="tile-main" onClick={() => openScene(scene.id)} title={scene.name}>
        <span className="tile-thumb">
          {url ? <img src={url} alt="" draggable={false} /> : <Layers size={24} />}
        </span>
        <span className="tile-name">{scene.name}</span>
      </button>
      <button type="button" className="tile-more" aria-label="…" onClick={() => setMenu(!menu)}>
        <MoreHorizontal size={16} />
      </button>
      {menu ? (
        <div className="menu panel tile-menu">
          <button
            type="button"
            onClick={async () => {
              setMenu(false);
              const name = await promptDialog(t.scene.namePrompt, scene.name);
              if (name?.trim()) renameScene(scene.id, name.trim());
            }}
          >
            <Pencil size={16} /> {t.scene.rename}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              duplicateScene(scene.id);
            }}
          >
            <Copy size={16} /> {t.scene.duplicate}
          </button>
          <button
            type="button"
            className="danger"
            onClick={async () => {
              setMenu(false);
              if (await confirmDialog(t.scene.deleteConfirm(scene.name))) await deleteScene(scene.id);
            }}
          >
            <Trash2 size={16} /> {t.scene.delete}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function viewCenter() {
  const v = activeScene()?.gmViewport;
  return v ? { x: v.x, y: v.y } : { x: 0, y: 0 };
}

export function CollectionSelect() {
  const collections = useGm((s) => s.collections);
  const collectionId = useGm((s) => s.collectionId);
  return (
    <select
      className="collection-select"
      aria-label={t.dock.collection}
      title={t.dock.collection}
      value={collectionId}
      onChange={async (e) => {
        if (e.target.value === '__new') {
          const name = await promptDialog(t.manager.collectionName);
          if (name?.trim()) await createCollection(name.trim());
          return;
        }
        selectCollection(e.target.value);
      }}
    >
      {collections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new">{t.dock.newCollection}</option>
    </select>
  );
}

function Tray({ tab }: { tab: DockTab }) {
  const assets = useGm((s) => s.assets);
  const scenes = useGm((s) => s.scenes);
  const collectionId = useGm((s) => s.collectionId);
  const activeId = useGm((s) => s.activeSceneId);
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const inCollection = Object.values(assets)
      .filter((a) => a.collectionId === collectionId)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (tab === 'search') {
      const q = query.trim().toLowerCase();
      return q ? inCollection.filter((a) => a.name.toLowerCase().includes(q)) : [];
    }
    if (tab === 'scenes') return [];
    return inCollection.filter((a) => a.type === tab);
  }, [assets, collectionId, tab, query]);

  const sceneList = useMemo(
    () =>
      Object.values(scenes)
        .filter((s) => s.collectionId === collectionId)
        .sort((a, b) => a.order - b.order),
    [scenes, collectionId],
  );

  const assetType = tab !== 'scenes' && tab !== 'search' ? tab : undefined;
  const onFiles = (files: File[]) => {
    const images = files.filter(isImageFile);
    if (images.length) openDialog({ kind: 'import', files: images, type: assetType ?? 'map' });
  };

  return (
    <Panel
      className="dock-tray"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        if (tab === 'scenes') {
          const f = [...e.dataTransfer.files].find(isImageFile);
          if (f) openDialog({ kind: 'sceneFromMap', file: f });
        } else onFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="tray-head">
        <CollectionSelect />
        {tab === 'search' ? (
          <input
            className="search-input"
            autoFocus
            placeholder={t.dock.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}
        <div className="grow" />
        {tab === 'scenes' ? (
          <>
            <button type="button" className="btn" onClick={() => openDialog({ kind: 'newScene' })}>
              <Plus size={16} /> {t.dock.newScene}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => openDialog({ kind: 'sceneFromMap' })}
            >
              <MapIcon size={16} /> {t.dock.sceneFromMap}
            </button>
          </>
        ) : null}
        {tab === 'character' ? (
          <button type="button" className="btn" onClick={() => openDialog({ kind: 'disc' })}>
            <Circle size={16} /> {t.dock.disc}
          </button>
        ) : null}
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
                onFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </>
        ) : null}
      </div>
      <div className="tray-items">
        {tab === 'scenes'
          ? sceneList.map((s) => <SceneTile key={s.id} scene={s} active={s.id === activeId} />)
          : list.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onClick={() => placeAsset(getGm().assets[a.id], viewCenter())}
              />
            ))}
        {tab !== 'scenes' && list.length === 0 ? (
          <div className="tray-empty">
            {tab === 'search' ? (query ? t.dock.noResults : '') : t.dock.empty}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

const TABS: { id: DockTab; icon: ReactNode; label: string }[] = [
  { id: 'search', icon: <Search size={20} />, label: t.dock.search },
  { id: 'scenes', icon: <Castle size={20} />, label: t.dock.scenes },
  ...ASSET_TYPES.map((type) => ({ id: type as DockTab, icon: TYPE_ICONS[type], label: t.assetTypes[type] })),
];

export function Dock() {
  const tab = useUi((s) => s.dockTab);
  const type = tab && tab !== 'scenes' && tab !== 'search' ? tab : 'map';
  return (
    <div className="dock">
      {tab ? <Tray tab={tab} /> : null}
      <Panel
        className="dock-tabs"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          const files = [...e.dataTransfer.files].filter(isImageFile);
          if (!files.length) return;
          e.preventDefault();
          openDialog({ kind: 'import', files, type });
        }}
      >
        {TABS.map((x) => (
          <IconButton
            key={x.id}
            tipSide="top"
            icon={x.icon}
            label={x.label}
            active={tab === x.id}
            onClick={() => setDockTab(tab === x.id ? null : x.id)}
          />
        ))}
        <div className="sep vertical" />
        <IconButton
          tipSide="top"
          icon={<FolderOpen size={20} />}
          label={t.dock.assetManager}
          onClick={() => openDialog({ kind: 'assetManager', tab: tab ?? 'map' })}
        />
      </Panel>
    </div>
  );
}

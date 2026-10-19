import {
  Link,
  Unlink,
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  Lock,
  LockOpen,
  Scissors,
  Tag,
  Trash2,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { pickParent } from '../../core/attach';
import type { Item, Layer } from '../../core/types';
import { t } from '../../i18n/ru';
import {
  copyItems,
  deleteItems,
  duplicateItems,
  moveZ,
  setLayer,
  setSizeCells,
  toggleLock,
  toggleVisible,
  attachItems,
  detachItems,
} from '../../state/items';
import { activeScene, useGm } from '../../state/store';
import { useUi } from '../../state/ui';
import { startAlign } from '../ui/AlignPanel';
import { useClickOutside } from '../ui/common';
import { useCanvasUi } from './canvasState';
import { editLabel } from './SelectionPlaque';
import { formatSize, PICKABLE_LAYERS, selectionInfo, TOKEN_SIZES } from './selectionInfo';
import { toggleFogCut } from './tools';

function Entry({
  icon,
  label,
  hotkey,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  hotkey?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={danger ? 'danger' : ''}
      onClick={() => {
        useCanvasUi.setState({ contextMenu: null });
        onClick();
      }}
    >
      {icon}
      <span className="grow">{label}</span>
      {hotkey ? <kbd>{hotkey}</kbd> : null}
    </button>
  );
}

function itemName(it: Item): string {
  const label = it.kind === 'image' || it.kind === 'disc' ? it.label : undefined;
  return label || it.name || (it.kind === 'disc' && it.text) || t.layers[it.layer];
}

/** Full menu on right click: everything the plaque has plus copy and alignment. */
export function ContextMenu() {
  const at = useCanvasUi((s) => s.contextMenu);
  const selection = useGm((s) => s.selection);
  const items = useGm((s) => activeScene(s)?.items);
  const screen = useUi((s) => s.screen);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const close = () => useCanvasUi.setState({ contextMenu: null });
  useClickOutside(ref, close, !!at);

  useLayoutEffect(() => {
    if (!at) return;
    const w = ref.current?.offsetWidth ?? 260;
    const h = ref.current?.offsetHeight ?? 400;
    setPos({
      x: Math.min(at.x, screen.width - w - 8),
      y: Math.max(8, Math.min(at.y, screen.height - h - 8)),
    });
  }, [at, screen]);

  const selected = items ? selection.map((id) => items[id]).filter(Boolean) : [];
  if (!at || selected.length === 0) return null;
  const info = selectionInfo(selected);
  const { ids } = info;
  const parent = pickParent(selected);

  return (
    <div
      ref={ref}
      className="menu panel context-menu"
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {info.fogOnly ? (
        <Entry
          icon={<Scissors size={16} />}
          label={info.allCut ? t.fog.restore : t.fog.cut}
          onClick={() => toggleFogCut(ids)}
        />
      ) : (
        <>
          <Entry
            icon={info.allHidden ? <Eye size={16} /> : <EyeOff size={16} />}
            label={info.allHidden ? t.item.show : t.item.hide}
            hotkey="Shift+H"
            onClick={() => toggleVisible(ids)}
          />
          <Entry
            icon={info.allLocked ? <LockOpen size={16} /> : <Lock size={16} />}
            label={info.allLocked ? t.item.unlock : t.item.lock}
            hotkey="Shift+L"
            onClick={() => toggleLock(ids)}
          />
          <div className="menu-row">
            <span>{t.item.layer}</span>
            <select
              value={info.layer}
              onChange={(e) => {
                setLayer(ids, e.target.value as Layer);
                close();
              }}
            >
              {info.layer === '' ? <option value="">—</option> : null}
              {PICKABLE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {t.layers[l]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <Entry
        icon={<Copy size={16} />}
        label={t.item.duplicate}
        hotkey="Ctrl+D"
        onClick={() => duplicateItems(ids)}
      />
      <Entry
        icon={<ClipboardCopy size={16} />}
        label={t.item.copy}
        hotkey="Ctrl+C"
        onClick={() => copyItems(ids)}
      />
      {info.tokenIds.length > 0 ? (
        <>
          <Entry
            icon={<Tag size={16} />}
            label={`${t.item.label}…`}
            onClick={() => void editLabel(info.tokenIds, info.label)}
          />
          <div className="menu-row">
            <span>{t.item.size}</span>
            <div className="menu-sizes">
              {TOKEN_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={info.size === s ? 'on' : ''}
                  onClick={() => {
                    setSizeCells(info.tokenIds, s);
                    close();
                  }}
                >
                  {formatSize(s)}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {!info.fogOnly ? (
        <>
          <Entry icon={<ArrowUp size={16} />} label={t.item.forward} onClick={() => moveZ(ids, 1)} />
          <Entry icon={<ArrowDown size={16} />} label={t.item.backward} onClick={() => moveZ(ids, -1)} />
        </>
      ) : null}
      {parent ? (
        <Entry
          icon={<Link size={16} />}
          label={t.item.attachTo(itemName(parent))}
          onClick={() =>
            attachItems(
              ids.filter((id) => id !== parent.id),
              parent.id,
            )
          }
        />
      ) : null}
      {selected.some((it) => it.attachedTo) ? (
        <Entry icon={<Unlink size={16} />} label={t.item.detach} onClick={() => detachItems(ids)} />
      ) : null}
      {info.alignable ? (
        <Entry
          icon={<Grid3x3 size={16} />}
          label={t.item.align}
          onClick={() => startAlign(info.alignable!.id)}
        />
      ) : null}
      <div className="sep" />
      <Entry
        icon={<Trash2 size={16} />}
        label={t.item.delete}
        hotkey="Delete"
        danger
        onClick={() => deleteItems(ids)}
      />
    </div>
  );
}

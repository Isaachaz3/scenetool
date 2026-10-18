import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Grid3x3, Lock, LockOpen, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { ITEM_LAYERS } from '../../core/constants';
import { rectUnion, tokenSizeCells } from '../../core/geometry';
import type { Layer } from '../../core/types';
import { t } from '../../i18n/ru';
import {
  deleteItems,
  duplicateItems,
  imageSizeOf,
  moveZ,
  setLayer,
  setSizeCells,
  toggleLock,
  toggleVisible,
} from '../../state/items';
import { activeScene, useGm } from '../../state/store';
import { useUi } from '../../state/ui';
import { startAlign } from '../ui/AlignPanel';
import { IconButton } from '../ui/common';
import { itemNodes, useCanvasUi } from './canvasState';

const SIZES = [0.5, 1, 2, 3, 4];
const PICKABLE_LAYERS = ITEM_LAYERS.filter((l) => l !== 'fog' && l !== 'ruler');

/** Context bar under the selection: visibility, lock, size, order, layer, align, delete. */
export function SelectionPlaque() {
  const selection = useGm((s) => s.selection);
  const items = useGm((s) => activeScene(s)?.items);
  const view = useGm((s) => activeScene(s)?.gmViewport);
  const drag = useGm((s) => s.drag);
  const busy = useGm((s) => !!s.align || !!s.textEdit);
  const gesture = useCanvasUi((s) => s.gesture);
  const screen = useUi((s) => s.screen);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const selected = items ? selection.map((id) => items[id]).filter(Boolean) : [];

  useLayoutEffect(() => {
    if (selected.length === 0 || busy) {
      setPos(null);
      return;
    }
    const rects = selected.map((it) => itemNodes.get(it.id)?.getClientRect()).filter((r) => !!r);
    const box = rectUnion(rects);
    if (!box) {
      setPos(null);
      return;
    }
    const h = ref.current?.offsetHeight ?? 44;
    const w = ref.current?.offsetWidth ?? 320;
    let y = box.y + box.height + 12;
    if (y + h > screen.height - 90) y = Math.max(8, box.y - h - 12);
    const x = Math.min(Math.max(8, box.x + box.width / 2 - w / 2), screen.width - w - 8);
    setPos({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, items, view, screen, busy, drag]);

  if (selected.length === 0 || busy || gesture) return null;

  const ids = selected.map((it) => it.id);
  const allHidden = selected.every((it) => !it.visible);
  const allLocked = selected.every((it) => it.locked);
  const tokens = selected.filter((it) => it.kind === 'disc' || (it.kind === 'image' && it.layer !== 'map'));
  const single = selected.length === 1 ? selected[0] : null;
  const sizeNow =
    tokens.length === 1 && (tokens[0].kind === 'disc' || tokens[0].kind === 'image')
      ? Math.round(tokenSizeCells(tokens[0], imageSizeOf(tokens[0])) * 100) / 100
      : null;
  const layer = new Set(selected.map((it) => it.layer)).size === 1 ? selected[0].layer : '';

  return (
    <div
      ref={ref}
      className="plaque panel"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <IconButton
        tipSide="top"
        icon={allHidden ? <EyeOff size={20} /> : <Eye size={20} />}
        label={allHidden ? t.item.show : t.item.hide}
        hotkey="Shift+H"
        active={allHidden}
        onClick={() => toggleVisible(ids)}
      />
      <IconButton
        tipSide="top"
        icon={allLocked ? <Lock size={20} /> : <LockOpen size={20} />}
        label={allLocked ? t.item.unlock : t.item.lock}
        hotkey="Shift+L"
        active={allLocked}
        onClick={() => toggleLock(ids)}
      />
      <IconButton
        tipSide="top"
        icon={<Copy size={20} />}
        label={t.item.duplicate}
        hotkey="Ctrl+D"
        onClick={() => duplicateItems(ids)}
      />
      {tokens.length > 0 ? (
        <select
          className="plaque-select"
          aria-label={t.item.size}
          title={t.item.size}
          value={sizeNow !== null && SIZES.includes(sizeNow) ? String(sizeNow) : ''}
          onChange={(e) =>
            setSizeCells(
              tokens.map((it) => it.id),
              Number(e.target.value),
            )
          }
        >
          <option value="" disabled>
            {sizeNow !== null ? `${String(sizeNow).replace('.', ',')} ×` : t.item.sizeShort}
          </option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {String(s).replace('.', ',')} × {String(s).replace('.', ',')}
            </option>
          ))}
        </select>
      ) : null}
      <IconButton
        tipSide="top"
        icon={<ArrowUp size={20} />}
        label={t.item.forward}
        onClick={() => moveZ(ids, 1)}
      />
      <IconButton
        tipSide="top"
        icon={<ArrowDown size={20} />}
        label={t.item.backward}
        onClick={() => moveZ(ids, -1)}
      />
      <select
        className="plaque-select"
        aria-label={t.item.layer}
        title={t.item.layer}
        value={layer}
        onChange={(e) => setLayer(ids, e.target.value as Layer)}
      >
        {layer === '' ? <option value="">{t.item.layer}</option> : null}
        {PICKABLE_LAYERS.map((l) => (
          <option key={l} value={l}>
            {t.layers[l]}
          </option>
        ))}
      </select>
      {single?.kind === 'image' ? (
        <IconButton
          tipSide="top"
          icon={<Grid3x3 size={20} />}
          label={t.item.align}
          onClick={() => startAlign(single.id)}
        />
      ) : null}
      <IconButton
        tipSide="top"
        icon={<Trash2 size={20} />}
        label={t.item.delete}
        hotkey="Delete"
        onClick={() => deleteItems(ids)}
      />
    </div>
  );
}

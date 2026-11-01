import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  Lock,
  LockOpen,
  Play,
  Scissors,
  Square,
  Tag,
  Trash2,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { rectUnion } from '../../core/geometry';
import type { Layer } from '../../core/types';
import { t } from '../../i18n/ru';
import {
  deleteItems,
  duplicateItems,
  moveZ,
  setLabel,
  setLayer,
  setSizeCells,
  toggleLock,
  toggleVisible,
} from '../../state/items';
import { activeScene, useGm } from '../../state/store';
import { promptDialog, useUi } from '../../state/ui';
import { startAlign } from '../ui/AlignPanel';
import { IconButton } from '../ui/common';
import { itemNodes, useCanvasUi } from './canvasState';
import { formatSize, PICKABLE_LAYERS, selectionInfo, TOKEN_SIZES } from './selectionInfo';
import { toggleFogCut } from './tools';
import { toggleSound, useSoundpad } from '../soundpad';

export async function editLabel(ids: string[], current: string): Promise<void> {
  const text = await promptDialog(t.item.labelPrompt, current);
  if (text !== null) setLabel(ids, text);
}

/** The sound token's offer: play its sound (or stop it while it plays). */
function SoundPlay({ trackId }: { trackId: string }) {
  const track = useGm((s) => s.tracks[trackId]);
  const playing = useSoundpad((s) => !!s.playing[trackId]);
  if (!track) return <span className="muted sound-plaque-name">{t.sounds.missing}</span>;
  return (
    <button
      type="button"
      className={'btn sound-play' + (playing ? '' : ' primary')}
      onClick={() => void toggleSound(trackId)}
      autoFocus
    >
      {playing ? <Square size={16} /> : <Play size={16} />}
      <span className="sound-plaque-name">
        {playing ? t.sounds.stop(track.name) : t.sounds.play(track.name)}
      </span>
    </button>
  );
}

/** Context bar under the selection: visibility, lock, size, label, order, layer, align, delete. */
export function SelectionPlaque() {
  const selection = useGm((s) => s.selection);
  const items = useGm((s) => activeScene(s)?.items);
  const view = useGm((s) => activeScene(s)?.gmViewport);
  const drag = useGm((s) => s.drag);
  const busy = useGm((s) => !!s.align || !!s.textEdit);
  const gesture = useCanvasUi((s) => s.gesture);
  const menuOpen = useCanvasUi((s) => !!s.contextMenu);
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

  if (selected.length === 0 || busy || gesture || menuOpen) return null;
  const info = selectionInfo(selected);
  const { ids } = info;
  const sound = selected.length === 1 && selected[0].kind === 'sound' ? selected[0] : null;

  if (sound) {
    return (
      <div
        ref={ref}
        className="plaque panel sound-plaque"
        style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <SoundPlay trackId={sound.trackId} />
        <IconButton
          tipSide="top"
          icon={<Copy size={20} />}
          label={t.item.duplicate}
          hotkey="Ctrl+D"
          onClick={() => duplicateItems(ids)}
        />
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

  return (
    <div
      ref={ref}
      className="plaque panel"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {info.fogOnly ? (
        <IconButton
          tipSide="top"
          icon={<Scissors size={20} />}
          label={info.allCut ? t.fog.restore : t.fog.cut}
          active={info.allCut}
          onClick={() => toggleFogCut(ids)}
        />
      ) : (
        <>
          <IconButton
            tipSide="top"
            icon={info.allHidden ? <EyeOff size={20} /> : <Eye size={20} />}
            label={info.allHidden ? t.item.show : t.item.hide}
            hotkey="Shift+H"
            active={info.allHidden}
            onClick={() => toggleVisible(ids)}
          />
          <IconButton
            tipSide="top"
            icon={info.allLocked ? <Lock size={20} /> : <LockOpen size={20} />}
            label={info.allLocked ? t.item.unlock : t.item.lock}
            hotkey="Shift+L"
            active={info.allLocked}
            onClick={() => toggleLock(ids)}
          />
        </>
      )}
      <IconButton
        tipSide="top"
        icon={<Copy size={20} />}
        label={t.item.duplicate}
        hotkey="Ctrl+D"
        onClick={() => duplicateItems(ids)}
      />
      {info.tokenIds.length > 0 ? (
        <>
          <select
            className="plaque-select"
            aria-label={t.item.size}
            title={t.item.size}
            value={info.size !== null && TOKEN_SIZES.includes(info.size) ? String(info.size) : ''}
            onChange={(e) => setSizeCells(info.tokenIds, Number(e.target.value))}
          >
            <option value="" disabled>
              {info.size !== null ? `${formatSize(info.size)} ×` : t.item.sizeShort}
            </option>
            {TOKEN_SIZES.map((s) => (
              <option key={s} value={s}>
                {formatSize(s)} × {formatSize(s)}
              </option>
            ))}
          </select>
          <IconButton
            tipSide="top"
            icon={<Tag size={20} />}
            label={t.item.label}
            onClick={() => void editLabel(info.tokenIds, info.label)}
          />
        </>
      ) : null}
      {!info.fogOnly ? (
        <>
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
            value={info.layer}
            onChange={(e) => setLayer(ids, e.target.value as Layer)}
          >
            {info.layer === '' ? <option value="">{t.item.layer}</option> : null}
            {PICKABLE_LAYERS.map((l) => (
              <option key={l} value={l}>
                {t.layers[l]}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {info.alignable ? (
        <IconButton
          tipSide="top"
          icon={<Grid3x3 size={20} />}
          label={t.item.align}
          onClick={() => startAlign(info.alignable!.id)}
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

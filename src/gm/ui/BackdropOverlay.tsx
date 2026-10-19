import { Maximize2, Minimize2, Presentation, WandSparkles, X } from 'lucide-react';
import { useState } from 'react';
import { coverPosition, coverWindow } from '../../core/cover';
import type { Vec2 } from '../../core/types';
import { t } from '../../i18n/ru';
import { setBackdropFocus, shownBackdrop, showBackdrop } from '../../state/backdrop';
import { useGm } from '../../state/store';
import { useUi } from '../../state/ui';
import { useAssetUrl } from '../images';

const TV = { width: 1920, height: 1080 }; // until a player screen reports its size
const CENTER = { x: 0.5, y: 0.5 };
const MARGIN_TOP = 104; // the bar and the hint
const MARGIN_BOTTOM = 100; // the dock stays usable below
const MARGIN_BOTTOM_TRAY = 300; // with its tray open
const MINI_WIDTH = 280;

/**
 * The backdrop over the scene. Expanded, the GM sees the whole picture with the part players
 * see framed, and moves that frame with a click or a drag. Collapsed, a corner preview shows
 * exactly what players see while the GM keeps working on the scene.
 */
export function BackdropOverlay() {
  const asset = useGm((s) => shownBackdrop(s));
  const minimized = useUi((s) => s.backdropMinimized);
  const screen = useUi((s) => s.screen);
  const trayOpen = useUi((s) => !!s.dockTab);
  const player = useUi((s) => s.player.screen) ?? TV;
  const url = useAssetUrl(asset);
  const [dragFocus, setDragFocus] = useState<Vec2 | null>(null);
  if (!asset) return null;
  const focus = dragFocus ?? asset.focus ?? CENTER;

  const bar = (
    <div className="panel gm-backdrop-bar">
      <Presentation size={16} />
      <span className="gm-backdrop-name" title={asset.name}>
        {minimized ? t.backdrop.minimizedHint : t.backdrop.shown(asset.name)}
      </span>
      {minimized ? null : (
        <button
          type="button"
          className="btn"
          title={t.backdrop.autoHint}
          onClick={() => void setBackdropFocus(asset.id, null)}
        >
          <WandSparkles size={16} /> {t.backdrop.auto}
        </button>
      )}
      <button type="button" className="btn" onClick={() => useUi.setState({ backdropMinimized: !minimized })}>
        {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        {minimized ? t.backdrop.expand : t.backdrop.minimize}
      </button>
      <button type="button" className="btn primary" onClick={() => showBackdrop(null)}>
        <X size={16} /> {t.backdrop.hide}
      </button>
    </div>
  );

  if (minimized) {
    const p = coverPosition(asset, player, focus);
    return (
      <div className="gm-backdrop minimized">
        <div className="gm-backdrop-image" style={{ height: (MINI_WIDTH * player.height) / player.width }}>
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              style={{ objectFit: 'cover', objectPosition: `${p.x}% ${p.y}%` }}
            />
          ) : null}
        </div>
        {bar}
      </div>
    );
  }

  // The whole picture, fitted between the bar and the dock.
  const bottom = trayOpen ? MARGIN_BOTTOM_TRAY : MARGIN_BOTTOM;
  const room = { width: screen.width - 64, height: Math.max(120, screen.height - MARGIN_TOP - bottom) };
  const k = Math.min(room.width / asset.width, room.height / asset.height);
  const box = { width: asset.width * k, height: asset.height * k };
  const win = coverWindow(asset, player, focus);
  const at = (e: React.PointerEvent): Vec2 => {
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  return (
    <div className="gm-backdrop">
      <div
        className="gm-backdrop-frame"
        style={{
          width: box.width,
          height: box.height,
          left: (screen.width - box.width) / 2,
          top: MARGIN_TOP + (room.height - box.height) / 2,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragFocus(at(e));
        }}
        onPointerMove={(e) => {
          if (dragFocus) setDragFocus(at(e));
        }}
        onPointerUp={(e) => {
          if (!dragFocus) return;
          const f = at(e);
          setDragFocus(null);
          void setBackdropFocus(asset.id, f);
        }}
      >
        {url ? <img src={url} alt="" draggable={false} /> : null}
        <div
          className="gm-backdrop-crop"
          style={{
            left: `${win.x * 100}%`,
            top: `${win.y * 100}%`,
            width: `${win.w * 100}%`,
            height: `${win.h * 100}%`,
          }}
        />
      </div>
      <p className="gm-backdrop-hint">{t.backdrop.cropHint}</p>
      {bar}
    </div>
  );
}

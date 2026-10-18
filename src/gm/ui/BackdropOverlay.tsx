import { Maximize2, Minimize2, Presentation, X } from 'lucide-react';
import { t } from '../../i18n/ru';
import { shownBackdrop, showBackdrop } from '../../state/backdrop';
import { useGm } from '../../state/store';
import { useUi } from '../../state/ui';
import { useAssetUrl } from '../images';

/**
 * The backdrop as players see it, over the scene. The GM can collapse it to a corner to keep
 * working on the scene while players still look at the picture.
 */
export function BackdropOverlay() {
  const asset = useGm((s) => shownBackdrop(s));
  const minimized = useUi((s) => s.backdropMinimized);
  const url = useAssetUrl(asset);
  if (!asset) return null;
  return (
    <div className={'gm-backdrop' + (minimized ? ' minimized' : '')}>
      <div className="gm-backdrop-image">{url ? <img src={url} alt="" draggable={false} /> : null}</div>
      <div className="panel gm-backdrop-bar">
        <Presentation size={16} />
        <span className="gm-backdrop-name" title={asset.name}>
          {minimized ? t.backdrop.minimizedHint : t.backdrop.shown(asset.name)}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => useUi.setState({ backdropMinimized: !minimized })}
        >
          {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          {minimized ? t.backdrop.expand : t.backdrop.minimize}
        </button>
        <button type="button" className="btn primary" onClick={() => showBackdrop(null)}>
          <X size={16} /> {t.backdrop.hide}
        </button>
      </div>
    </div>
  );
}

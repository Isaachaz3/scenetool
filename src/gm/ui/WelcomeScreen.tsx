import { AppWindow, Cast, CastIcon, Layers, Map as MapIcon, Play, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Scene } from '../../core/types';
import { t } from '../../i18n/ru';
import { openScene } from '../../state/scenes';
import { activeScene, useGm } from '../../state/store';
import { openDialog, readPrefs, useUi, writePrefs } from '../../state/ui';
import { useThumbUrl } from '../images';
import { openPlayerWindow, presentation } from '../playerHub';

export const closeWelcome = () => useUi.setState({ welcome: false });

function SceneCard({ scene, collection }: { scene: Scene; collection?: string }) {
  const url = useThumbUrl(scene.thumbId);
  return (
    <button
      type="button"
      className="welcome-scene"
      onClick={() => {
        openScene(scene.id);
        closeWelcome();
      }}
    >
      <span className="welcome-thumb">
        {url ? <img src={url} alt="" draggable={false} /> : <Layers size={28} />}
      </span>
      <span className="welcome-scene-name">{scene.name}</span>
      <span className="welcome-scene-meta">
        {collection ? `${collection} · ` : ''}
        {t.welcome.edited(new Date(scene.updatedAt).toLocaleDateString('ru-RU'))}
      </span>
    </button>
  );
}

/** Start screen, like the one of an image editor: pick a scene and put the player screen up. */
export function WelcomeScreen() {
  const open = useUi((s) => s.welcome);
  const scenes = useGm((s) => s.scenes);
  const collections = useGm((s) => s.collections);
  const current = useGm((s) => activeScene(s));
  const player = useUi((s) => s.player);
  const [query, setQuery] = useState('');
  const [onStart, setOnStart] = useState(() => readPrefs().welcomeOnStart ?? true);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(scenes)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [scenes, query]);
  const names = useMemo(() => new Map(collections.map((c) => [c.id, c.name])), [collections]);
  if (!open) return null;

  const action = (fn: () => void) => () => {
    closeWelcome();
    fn();
  };
  const connected = player.links > 0;

  return (
    <div className="welcome">
      <div className="welcome-body panel">
        <button
          type="button"
          className="welcome-close icon-btn"
          aria-label={t.welcome.close}
          onClick={closeWelcome}
        >
          <X size={20} />
        </button>
        <aside className="welcome-side">
          <h1 className="welcome-title">{t.welcome.title}</h1>
          <p className="muted">{t.welcome.subtitle}</p>

          <h2>{t.welcome.start}</h2>
          {current ? (
            <button type="button" className="btn primary welcome-action" onClick={closeWelcome}>
              <Play size={18} /> {t.welcome.continue(current.name)}
            </button>
          ) : null}
          <button
            type="button"
            className="btn welcome-action"
            onClick={action(() => openDialog({ kind: 'sceneFromMap' }))}
          >
            <MapIcon size={18} /> {t.welcome.sceneFromMap}
          </button>
          <button
            type="button"
            className="btn welcome-action"
            onClick={action(() => openDialog({ kind: 'newScene' }))}
          >
            <Plus size={18} /> {t.welcome.newScene}
          </button>

          <h2>{t.welcome.players}</h2>
          <p className={'welcome-status' + (connected ? ' on' : '')}>
            {connected ? t.playerStatus.connected : t.playerStatus.none}
          </p>
          {presentation.supported ? (
            player.presenting ? (
              <button type="button" className="btn welcome-action" onClick={() => presentation.stop()}>
                <CastIcon size={18} /> {t.welcome.stopPresent}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary welcome-action"
                onClick={() => void presentation.start()}
              >
                <Cast size={18} /> {t.welcome.present}
              </button>
            )
          ) : null}
          <button type="button" className="btn welcome-action" onClick={openPlayerWindow}>
            <AppWindow size={18} /> {t.welcome.playerWindow}
          </button>
          <p className="muted welcome-hint">{t.welcome.presentHint}</p>

          <label className="welcome-check">
            <input
              type="checkbox"
              checked={onStart}
              onChange={(e) => {
                setOnStart(e.target.checked);
                writePrefs({ welcomeOnStart: e.target.checked });
              }}
            />
            {t.welcome.showOnStart}
          </label>
        </aside>

        <section className="welcome-main">
          <div className="welcome-main-head">
            <h2>{t.welcome.scenes}</h2>
            <input
              className="text-input search-input"
              placeholder={t.welcome.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {list.length === 0 ? (
            <p className="muted">{t.welcome.noScenes}</p>
          ) : (
            <div className="welcome-grid">
              {list.map((s) => (
                <SceneCard
                  key={s.id}
                  scene={s}
                  collection={collections.length > 1 ? names.get(s.collectionId) : undefined}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

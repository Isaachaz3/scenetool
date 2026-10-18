import { Maximize } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { sortItems } from '../core/items';
import type { Item } from '../core/types';
import { t } from '../i18n/ru';
import type { AssetRef, PlayerScene } from '../protocol/projection';
import { useBitmap } from '../render/bitmapCache';
import { GridShape } from '../render/GridShape';
import { ItemShape } from '../render/ItemShape';
import { playerImages, sendScreen, usePlayer } from './session';

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
      sendScreen();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

const PlayerItem = memo(function PlayerItem({ item, asset: ref }: { item: Item; asset?: AssetRef }) {
  const image = useBitmap(playerImages, ref?.hash);
  return (
    <ItemShape
      item={item}
      source={ref ? { image, width: ref.width, height: ref.height } : undefined}
      listening={false}
    />
  );
});

function SceneLayers({ scene }: { scene: PlayerScene }) {
  const sorted = useMemo(() => sortItems(Object.values(scene.items)), [scene.items]);
  const maps = sorted.filter((it) => it.layer === 'map');
  const rest = sorted.filter((it) => it.layer !== 'map');
  const g = scene.grid;
  const look = useMemo(
    () => ({ color: g.color, opacity: g.opacity, lineWidth: g.lineWidth, lineStyle: g.lineStyle }),
    [g.color, g.opacity, g.lineWidth, g.lineStyle],
  );
  return (
    <>
      <Layer listening={false}>
        {maps.map((it) => (
          <PlayerItem
            key={it.id}
            item={it}
            asset={it.kind === 'image' ? scene.assets[it.assetId] : undefined}
          />
        ))}
      </Layer>
      {g.showToPlayers ? (
        <Layer listening={false}>
          <GridShape look={look} />
        </Layer>
      ) : null}
      <Layer listening={false}>
        {rest.map((it) => (
          <PlayerItem
            key={it.id}
            item={it}
            asset={it.kind === 'image' ? scene.assets[it.assetId] : undefined}
          />
        ))}
      </Layer>
    </>
  );
}

function FullscreenButton() {
  const [isFull, setFull] = useState(!!document.fullscreenElement);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    let timer: ReturnType<typeof setTimeout>;
    const onMove = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3000);
    };
    onMove();
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('pointermove', onMove);
      clearTimeout(timer);
    };
  }, []);
  if (isFull || !document.fullscreenEnabled) return null;
  return (
    <button
      className={'player-fullscreen' + (idle ? ' idle' : '')}
      onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
    >
      <Maximize size={20} /> {t.player.fullscreen}
    </button>
  );
}

export function PlayerApp() {
  const size = useWindowSize();
  const scene = usePlayer((s) => s.scene);
  const view = usePlayer((s) => s.view);
  const mode = usePlayer((s) => s.mode);
  const heard = usePlayer((s) => s.heard);
  return (
    <div className="player-root">
      <Stage
        width={size.width}
        height={size.height}
        x={size.width / 2 - view.x * view.zoom}
        y={size.height / 2 - view.y * view.zoom}
        scaleX={view.zoom}
        scaleY={view.zoom}
        listening={false}
      >
        {scene ? <SceneLayers scene={scene} /> : null}
      </Stage>
      {!heard ? (
        <div className="player-message">{mode === 'none' ? t.player.noOpener : t.player.waiting}</div>
      ) : null}
      {mode === 'window' ? <FullscreenButton /> : null}
    </div>
  );
}

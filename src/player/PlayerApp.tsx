import { Maximize } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { sortItems } from '../core/items';
import { measureLabel } from '../core/measure';
import type { FogShape, Item } from '../core/types';
import { t } from '../i18n/ru';
import type { AssetRef, PlayerScene } from '../protocol/projection';
import { useBitmap } from '../render/bitmapCache';
import { FogLayerShape } from '../render/FogLayer';
import { GridShape } from '../render/GridShape';
import { ItemShape } from '../render/ItemShape';
import { MeasureShape } from '../render/MeasureShape';
import { PointerTrailShape } from '../render/PointerTrail';
import { fileUrl, playerImages, pointerTrail, sendScreen, usePlayer } from './session';

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

const PlayerItem = memo(function PlayerItem({
  item,
  asset: ref,
  ruler,
}: {
  item: Item;
  asset?: AssetRef;
  ruler?: { label: string; zoom: number };
}) {
  const image = useBitmap(playerImages, ref?.hash);
  return (
    <ItemShape
      item={item}
      ruler={ruler}
      source={ref ? { image, width: ref.width, height: ref.height } : undefined}
      listening={false}
    />
  );
});

function SceneLayers({ scene, zoom }: { scene: PlayerScene; zoom: number }) {
  const sorted = useMemo(() => sortItems(Object.values(scene.items)), [scene.items]);
  const maps = sorted.filter((it) => it.layer === 'map');
  const rest = sorted.filter((it) => it.layer !== 'map' && it.layer !== 'fog');
  const measure = usePlayer((s) => (s.show.ruler ? s.measure : null));
  const showPointer = usePlayer((s) => s.show.pointer);
  const fog = useMemo(
    () => ({
      shapes: sorted.filter((it): it is FogShape => it.kind === 'fog'),
      fill: scene.fog.fill,
      color: scene.fog.color,
      opacity: 1,
    }),
    [sorted, scene.fog],
  );
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
            ruler={
              it.kind === 'ruler'
                ? { label: measureLabel(it.points, g.measurement, g.scale), zoom }
                : undefined
            }
          />
        ))}
        {measure ? <MeasureShape measure={measure} zoom={zoom} /> : null}
      </Layer>
      <Layer listening={false}>
        <FogLayerShape look={fog} />
      </Layer>
      <Layer listening={false}>{showPointer ? <PointerTrailShape trail={pointerTrail} /> : null}</Layer>
    </>
  );
}

/** The GM's backdrop over the scene: fades in once its file is here, fades out when hidden. */
function Backdrop() {
  const ref = usePlayer((s) => s.backdrop);
  usePlayer((s) => s.filesTick);
  const url = ref ? fileUrl(ref.hash) : undefined;
  const [last, setLast] = useState(url);
  if (url && url !== last) setLast(url); // keeps the picture while it fades out
  if (!last) return null;
  return (
    <div
      className={'player-backdrop' + (url ? ' on' : '')}
      onTransitionEnd={() => {
        if (!url) setLast(undefined);
      }}
    >
      <img src={last} alt="" />
    </div>
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
        {scene ? <SceneLayers scene={scene} zoom={view.zoom} /> : null}
      </Stage>
      <Backdrop />
      {!heard ? (
        <div className="player-message">{mode === 'none' ? t.player.noOpener : t.player.waiting}</div>
      ) : null}
      {mode === 'window' ? <FullscreenButton /> : null}
    </div>
  );
}

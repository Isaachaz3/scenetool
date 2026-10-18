import type Konva from 'konva';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layer, Rect, Stage, Transformer } from 'react-konva';
import { ALIGN_GRID_COLOR, HIDDEN_OPACITY } from '../../core/constants';
import { snapItemPosition } from '../../core/geometry';
import { sortItems } from '../../core/items';
import type { Id, Item } from '../../core/types';
import { useBitmap } from '../../render/bitmapCache';
import { GridShape, type GridLook } from '../../render/GridShape';
import { ItemShape } from '../../render/ItemShape';
import { imageSizeOf } from '../../state/items';
import { activeScene, changeScene, useActiveScene, useGm } from '../../state/store';
import { useUi } from '../../state/ui';
import { gmImages } from '../images';
import { itemNodes, registerNode, stageRef, useCanvasUi } from './canvasState';
import { handleCanvasDrop, isCanvasDrag } from './drop';
import { useCanvasInput } from './input';

const ACCENT = '#a78bfa';

const GmItem = memo(function GmItem({ item }: { item: Item }) {
  const override = useGm((s) => s.drag?.positions[item.id]);
  const asset = useGm((s) => (item.kind === 'image' ? s.assets[item.assetId] : undefined));
  const image = useBitmap(gmImages, item.kind === 'image' && asset ? item.assetId : undefined);
  const editing = useGm((s) => s.textEdit?.id === item.id);
  const ref = useCallback((node: Konva.Node | null) => registerNode(item.id, node), [item.id]);
  return (
    <ItemShape
      item={item}
      position={override}
      opacity={item.visible ? 1 : HIDDEN_OPACITY}
      source={asset ? { image, width: asset.width, height: asset.height } : undefined}
      nodeRef={ref}
      placeholder
      hiddenFor={editing}
    />
  );
});

/** Alt-drag leaves translucent originals in place until the drop. */
function Ghosts({ items }: { items: Record<Id, Item> }) {
  const drag = useGm((s) => s.drag);
  const assets = useGm((s) => s.assets);
  if (!drag?.copy) return null;
  return (
    <>
      {Object.keys(drag.positions).map((id) => {
        const item = items[id];
        if (!item) return null;
        const a = item.kind === 'image' ? assets[item.assetId] : undefined;
        return (
          <GhostItem key={id} item={item} width={a?.width ?? 0} height={a?.height ?? 0} hasAsset={!!a} />
        );
      })}
    </>
  );
}

function GhostItem({
  item,
  width,
  height,
  hasAsset,
}: {
  item: Item;
  width: number;
  height: number;
  hasAsset: boolean;
}) {
  const image = useBitmap(gmImages, item.kind === 'image' && hasAsset ? item.assetId : undefined);
  return (
    <ItemShape
      item={item}
      opacity={0.5}
      listening={false}
      source={hasAsset ? { image, width, height } : undefined}
    />
  );
}

function SelectionTransformer() {
  const tool = useGm((s) => s.tool);
  const selection = useGm((s) => s.selection);
  const items = useGm((s) => activeScene(s)?.items);
  const align = useGm((s) => s.align);
  const ref = useRef<Konva.Transformer>(null);

  // Nodes are registered during commit, so attach them in an effect, not during render.
  useEffect(() => {
    const tr = ref.current;
    if (!tr) return;
    const nodes =
      tool !== 'select' || !items || align
        ? []
        : selection
            .filter((id) => items[id] && !items[id].locked)
            .map((id) => itemNodes.get(id))
            .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [tool, selection, items, align]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      ref.current?.rotationSnaps(e.shiftKey ? Array.from({ length: 24 }, (_, i) => i * 15) : []);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const onTransformEnd = () => {
    const tr = ref.current;
    const scene = activeScene();
    if (!tr || !scene) return;
    const attached = tr.nodes();
    changeScene((d) => {
      for (const node of attached) {
        const it = d.items[node.id()] as Item | undefined;
        if (!it) continue;
        const scaled = Math.abs(node.scaleX() - 1) > 1e-6 || Math.abs(node.scaleY() - 1) > 1e-6;
        it.position = { x: node.x(), y: node.y() };
        it.rotation = node.rotation();
        if (it.kind === 'image') {
          const base = 150 / it.grid.dpi;
          it.scale = { x: node.scaleX() / base, y: node.scaleY() / base };
        } else if (it.kind === 'disc') {
          it.sizeCells = Math.max(0.25, Math.round(it.sizeCells * node.scaleX() * 100) / 100);
          node.scaleX(1);
          node.scaleY(1);
        } else if (it.kind === 'text') {
          it.scale = { x: node.scaleX(), y: node.scaleY() };
        }
        if (
          scaled &&
          (it.kind === 'disc' || it.kind === 'image') &&
          scene.grid.snapping &&
          it.layer !== 'map'
        ) {
          it.position = snapItemPosition(it, it.position, imageSizeOf(it));
        }
      }
    });
  };

  return (
    <Transformer
      ref={ref}
      rotateEnabled
      keepRatio
      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
      anchorSize={10}
      anchorCornerRadius={5}
      anchorStroke={ACCENT}
      anchorFill="#1e1f29"
      borderStroke={ACCENT}
      borderDash={[6, 4]}
      rotateAnchorOffset={28}
      rotationSnapTolerance={7.5}
      ignoreStroke
      flipEnabled={false}
      boundBoxFunc={(oldBox, newBox) =>
        Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12 ? oldBox : newBox
      }
      onTransformEnd={onTransformEnd}
    />
  );
}

function Band() {
  const band = useCanvasUi((s) => s.band);
  const zoom = useGm((s) => activeScene(s)?.gmViewport.zoom ?? 1);
  if (!band) return null;
  return (
    <Rect
      {...band}
      fill="rgba(167, 139, 250, 0.12)"
      stroke={ACCENT}
      strokeWidth={1 / zoom}
      dash={[6 / zoom, 4 / zoom]}
      listening={false}
    />
  );
}

function SceneContent({ items }: { items: Record<Id, Item> }) {
  const sorted = useMemo(() => sortItems(Object.values(items)), [items]);
  const maps = sorted.filter((it) => it.layer === 'map');
  const rest = sorted.filter((it) => it.layer !== 'map');
  const grid = useGm((s) => activeScene(s)?.grid);
  const aligning = useGm((s) => !!s.align);
  const look: GridLook | null = useMemo(() => {
    if (!grid) return null;
    if (aligning) return { color: ALIGN_GRID_COLOR, opacity: 1, lineWidth: 1, lineStyle: 'solid' };
    return { color: grid.color, opacity: grid.opacity, lineWidth: grid.lineWidth, lineStyle: grid.lineStyle };
  }, [grid, aligning]);
  return (
    <>
      <Layer>
        {maps.map((it) => (
          <GmItem key={it.id} item={it} />
        ))}
      </Layer>
      <Layer listening={false}>{look ? <GridShape look={look} /> : null}</Layer>
      <Layer>
        {rest.map((it) => (
          <GmItem key={it.id} item={it} />
        ))}
        <Ghosts items={items} />
      </Layer>
      <Layer>
        <SelectionTransformer />
        <Band />
      </Layer>
    </>
  );
}

export function GmCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const screen = useUi((s) => s.screen);
  const spaceDown = useUi((s) => s.spaceDown);
  const scene = useActiveScene();
  const tool = useGm((s) => s.tool);
  const gesture = useCanvasUi((s) => s.gesture);
  useCanvasInput(container);

  const v = scene?.gmViewport ?? { x: 0, y: 0, zoom: 1 };
  const cursor = gesture === 'pan' ? 'grabbing' : spaceDown ? 'grab' : tool === 'text' ? 'text' : 'default';

  return (
    <div
      ref={container}
      className="canvas"
      style={{ cursor }}
      onDragOver={(e) => {
        if (isCanvasDrag(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        if (!isCanvasDrag(e.dataTransfer)) return;
        e.preventDefault();
        const r = container.current!.getBoundingClientRect();
        void handleCanvasDrop(e.dataTransfer, { x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      <Stage
        ref={(s) => {
          stageRef.current = s;
        }}
        width={screen.width}
        height={screen.height}
        x={screen.width / 2 - v.x * v.zoom}
        y={screen.height / 2 - v.y * v.zoom}
        scaleX={v.zoom}
        scaleY={v.zoom}
      >
        {scene ? <SceneContent items={scene.items} /> : null}
      </Stage>
    </div>
  );
}

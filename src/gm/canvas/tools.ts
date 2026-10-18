import type Konva from 'konva';
import { nanoid } from 'nanoid';
import { CELL } from '../../core/constants';
import { snapToIntersection } from '../../core/geometry';
import { measureLabel, rulerPoint } from '../../core/measure';
import { simplify } from '../../core/simplify';
import type { DrawingItem, FogShape, Id, Item, Scene, Vec2 } from '../../core/types';
import { nextZ } from '../../state/items';
import { activeScene, changeScene, getGm, useGm } from '../../state/store';
import { hub } from '../playerHub';
import { gmPointerTrail, itemNodes, useCanvasUi } from './canvasState';

/** A press-drag-release interaction owned by one tool. */
export interface ToolGesture {
  move(world: Vec2, e: PointerEvent): void;
  up(world: Vec2, e: PointerEvent): void;
  cancel(): void;
}

const noSnap = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

function zoom(): number {
  return activeScene()?.gmViewport.zoom ?? 1;
}

function shapeSnap(p: Vec2, scene: Scene, e: { ctrlKey: boolean; metaKey: boolean }): Vec2 {
  return scene.grid.snapping && !noSnap(e) ? snapToIntersection(p) : p;
}

// --- measure ---------------------------------------------------------------------------------

export function setMeasure(points: Vec2[] | null): void {
  const scene = activeScene();
  const m =
    points && scene
      ? { points, label: measureLabel(points, scene.grid.measurement, scene.grid.scale) }
      : null;
  useCanvasUi.setState({ measure: m });
  hub.setMeasure(m);
}

/** Ruler: press at A, drag to B; ends snap to cell centers. It disappears on release. */
function rulerGesture(start: Vec2, e: PointerEvent): ToolGesture {
  const scene = activeScene()!;
  const method = scene.grid.measurement;
  const a = rulerPoint(start, method, scene.grid.snapping && !noSnap(e));
  setMeasure([a, a]);
  return {
    move(world, ev) {
      setMeasure([a, rulerPoint(world, method, scene.grid.snapping && !noSnap(ev))]);
    },
    up() {
      setMeasure(null);
    },
    cancel() {
      setMeasure(null);
    },
  };
}

// --- pointer ---------------------------------------------------------------------------------

function pointerGesture(start: Vec2): ToolGesture {
  const show = (p: Vec2) => {
    gmPointerTrail.push(p.x, p.y);
    hub.pointer(p.x, p.y, true);
  };
  const hide = (p: Vec2) => {
    gmPointerTrail.release();
    hub.pointer(p.x, p.y, false);
  };
  show(start);
  return { move: show, up: hide, cancel: () => hide(start) };
}

// --- shapes for drawing and fog -----------------------------------------------------------------

function baseItem(layer: 'drawing' | 'fog', scene: Scene, position: Vec2) {
  return {
    id: nanoid(),
    layer,
    z: nextZ(scene, layer),
    position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    visible: true,
    locked: false,
  } as const;
}

type ShapeKind = 'path' | 'line' | 'rect' | 'ellipse' | 'polygon';

/** World points → item with a local origin (rect and ellipse store [0, 0, w, h]). */
function buildShape(
  target: 'draw' | 'fog',
  kind: ShapeKind,
  pts: Vec2[],
  scene: Scene,
): DrawingItem | FogShape {
  let position: Vec2;
  let points: number[];
  if (kind === 'rect') {
    const [a, b] = pts;
    position = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
    points = [0, 0, Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
  } else if (kind === 'ellipse') {
    const [c, edge] = pts;
    const r = Math.hypot(edge.x - c.x, edge.y - c.y);
    position = { x: c.x - r, y: c.y - r };
    points = [0, 0, 2 * r, 2 * r];
  } else {
    position = pts[0];
    points = pts.flatMap((p) => [p.x - position.x, p.y - position.y]);
  }
  if (target === 'fog') {
    return {
      ...baseItem('fog', scene, position),
      kind: 'fog',
      shape: kind === 'rect' || kind === 'ellipse' ? kind : kind === 'polygon' ? 'polygon' : 'path',
      points,
      cut: scene.fog.cutByDefault,
    };
  }
  const st = getGm().drawStyle;
  return {
    ...baseItem('drawing', scene, position),
    kind: 'drawing',
    shape: kind,
    points,
    stroke: st.stroke,
    strokeWidth: st.strokeWidth,
    ...(st.fill && kind !== 'path' && kind !== 'line' ? { fill: st.fillColor } : {}),
    opacity: st.opacity,
  };
}

function isEmptyShape(item: DrawingItem | FogShape): boolean {
  const p = item.points;
  if (item.shape === 'rect' || item.shape === 'ellipse') return p[2] < 1 || p[3] < 1;
  return p.length < 4;
}

function commitShape(item: DrawingItem | FogShape) {
  useCanvasUi.setState({ draft: null });
  if (isEmptyShape(item)) return;
  changeScene((d) => {
    d.items[item.id] = item;
  });
}

/**
 * Rectangle, circle (from the center), line or freehand shape. A click without dragging
 * selects the fog shape under the cursor instead.
 */
function shapeGesture(
  target: 'draw' | 'fog',
  kind: ShapeKind,
  start: Vec2,
  e: PointerEvent,
  clickId: Id | null,
): ToolGesture {
  const scene = activeScene()!;
  const freehand = kind === 'path';
  const a = freehand ? start : shapeSnap(start, scene, e);
  const pts: Vec2[] = [a];
  let moved = false;
  const update = (world: Vec2, ev: PointerEvent) => {
    moved = true;
    if (freehand) {
      const last = pts[pts.length - 1];
      if (Math.hypot(world.x - last.x, world.y - last.y) * zoom() < 2) return;
      pts.push(world);
    } else if (kind === 'ellipse') {
      let edge = world;
      if (scene.grid.snapping && !noSnap(ev)) {
        const r = Math.max(
          CELL / 2,
          Math.round(Math.hypot(world.x - a.x, world.y - a.y) / (CELL / 2)) * (CELL / 2),
        );
        edge = { x: a.x + r, y: a.y };
      }
      pts[1] = edge;
    } else {
      pts[1] = shapeSnap(world, scene, ev);
    }
    if (pts.length >= 2) useCanvasUi.setState({ draft: buildShape(target, kind, pts, scene) });
  };
  return {
    move: update,
    up() {
      if (!moved) {
        useCanvasUi.setState({ draft: null });
        useGm.setState({ selection: clickId ? [clickId] : [] });
        return;
      }
      if (pts.length < 2) return;
      let final = pts;
      if (freehand) {
        const flat = simplify(
          pts.flatMap((p) => [p.x, p.y]),
          1 / zoom(),
        );
        final = [];
        for (let i = 0; i < flat.length; i += 2) final.push({ x: flat[i], y: flat[i + 1] });
      }
      commitShape(buildShape(target, kind, final, scene));
    },
    cancel() {
      useCanvasUi.setState({ draft: null });
    },
  };
}

// --- polygon (click by click) ------------------------------------------------------------------

export function polygonActive(): boolean {
  return !!useCanvasUi.getState().polygon;
}

function addPolygonPoint(target: 'draw' | 'fog', world: Vec2, e: PointerEvent) {
  const scene = activeScene()!;
  const p = shapeSnap(world, scene, e);
  const cur = useCanvasUi.getState().polygon;
  if (cur && cur.target === target) {
    const first = cur.points[0];
    // A click on the first corner closes the shape.
    if (cur.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) * zoom() < 10) {
      finishPolygon();
      return;
    }
    useCanvasUi.setState({ polygon: { ...cur, points: [...cur.points, p], hover: p } });
  } else {
    useCanvasUi.setState({ polygon: { target, points: [p], hover: p } });
  }
}

export function hoverPolygon(world: Vec2, e: { ctrlKey: boolean; metaKey: boolean }): void {
  const cur = useCanvasUi.getState().polygon;
  const scene = activeScene();
  if (cur && scene) useCanvasUi.setState({ polygon: { ...cur, hover: shapeSnap(world, scene, e) } });
}

/** Enter or a double click: close the polygon. */
export function finishPolygon(): void {
  const cur = useCanvasUi.getState().polygon;
  const scene = activeScene();
  useCanvasUi.setState({ polygon: null });
  if (!cur || !scene) return;
  const pts = cur.points.filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  if (pts.length < 3) return;
  commitShape(buildShape(cur.target, 'polygon', pts, scene));
}

/** Backspace: drop the last corner. */
export function popPolygonPoint(): void {
  const cur = useCanvasUi.getState().polygon;
  if (!cur) return;
  const points = cur.points.slice(0, -1);
  useCanvasUi.setState({ polygon: points.length ? { ...cur, points } : null });
}

export function cancelPolygon(): void {
  useCanvasUi.setState({ polygon: null });
}

// --- eraser --------------------------------------------------------------------------------------

let eraseStroke = 0;

/** Removes whole drawings touched by the eraser; one stroke is one undo step. */
function eraserGesture(screen: Vec2, toScreen: (w: Vec2) => Vec2): ToolGesture {
  const key = `erase-${++eraseStroke}`;
  const eraseAt = (p: Vec2) => {
    const scene = activeScene();
    if (!scene) return;
    const hits: Id[] = [];
    for (const it of Object.values(scene.items)) {
      if (it.kind !== 'drawing' || it.locked) continue;
      const node = itemNodes.get(it.id) as Konva.Shape | undefined;
      if (node?.intersects(p)) hits.push(it.id);
    }
    if (hits.length === 0) return;
    changeScene(
      (d) => {
        for (const id of hits) delete d.items[id];
      },
      { key },
    );
  };
  eraseAt(screen);
  return {
    move: (world) => eraseAt(toScreen(world)),
    up() {},
    cancel() {},
  };
}

// --- dispatch -----------------------------------------------------------------------------------

/**
 * Starts the gesture of the active tool for a left-button press, or handles a polygon click.
 * Movement mode drags are handled with the regular item drag.
 */
export function startToolGesture(
  world: Vec2,
  screen: Vec2,
  e: PointerEvent,
  hit: Item | undefined,
  toScreen: (w: Vec2) => Vec2,
): ToolGesture | null {
  const s = getGm();
  if (!activeScene()) return null;
  switch (s.tool) {
    case 'measure':
      return rulerGesture(world, e);
    case 'pointer':
      return pointerGesture(world);
    case 'draw':
      if (s.drawMode === 'eraser') return eraserGesture(screen, toScreen);
      if (s.drawMode === 'polygon') {
        addPolygonPoint('draw', world, e);
        return null;
      }
      return shapeGesture('draw', s.drawMode === 'brush' ? 'path' : s.drawMode, world, e, null);
    case 'fog': {
      if (s.fogMode === 'polygon') {
        addPolygonPoint('fog', world, e);
        return null;
      }
      const clickId = hit?.kind === 'fog' ? hit.id : null;
      return shapeGesture('fog', s.fogMode === 'brush' ? 'path' : s.fogMode, world, e, clickId);
    }
    default:
      return null;
  }
}

/** Fog shape actions from the menus. */
export function toggleFogCut(ids: Id[]): void {
  const scene = activeScene();
  if (!scene) return;
  const fogIds = ids.filter((id) => scene.items[id]?.kind === 'fog');
  const anyUncut = fogIds.some((id) => !(scene.items[id] as FogShape).cut);
  changeScene((d) => {
    for (const id of fogIds) (d.items[id] as FogShape).cut = anyUncut;
  });
}

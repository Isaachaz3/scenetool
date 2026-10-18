import type Konva from 'konva';
import { useEffect, type RefObject } from 'react';
import { rectsIntersect, sub, type Rect } from '../../core/geometry';
import type { Id, Vec2, Viewport } from '../../core/types';
import { panBy, screenToWorld, zoomAt } from '../../core/viewport';
import { cloneItems, snapFor } from '../../state/items';
import { setGmViewport } from '../../state/scenes';
import { activeScene, changeScene, getGm, useGm } from '../../state/store';
import { finishTextEdit, startTextEdit } from '../../state/text';
import { getUi } from '../../state/ui';
import { itemNodes, lastPointer, stageRef, useCanvasUi } from './canvasState';

type Gesture =
  | { kind: 'pan'; start: Vec2; view: Viewport; moved: boolean; clearOnClick: boolean }
  | {
      kind: 'drag';
      start: Vec2; // screen
      startWorld: Vec2;
      leadId: Id;
      orig: Record<Id, Vec2>;
      copy: boolean;
      moved: boolean;
      collapseTo?: Id; // click without moving inside a multi-selection selects just this item
    }
  | { kind: 'band'; start: Vec2; startWorld: Vec2; additive: boolean; moved: boolean };

const DRAG_THRESHOLD = 3; // screen px

/** Mouse wheels move in notches of 120 legacy units; trackpads scroll in small steps. */
function isTrackpadPan(e: WheelEvent): boolean {
  if (e.ctrlKey) return false; // pinch-to-zoom arrives as ctrl + wheel
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0 && !e.shiftKey) return true;
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  if (typeof legacy === 'number' && legacy !== 0) return Math.abs(legacy) % 120 !== 0;
  return !Number.isInteger(e.deltaY);
}

function hitTest(p: Vec2): { id: Id | null; transformer: boolean } {
  const stage = stageRef.current;
  const shape = stage?.getIntersection(p);
  let n: Konva.Node | null = shape ?? null;
  while (n) {
    if (n.getClassName() === 'Transformer') return { id: null, transformer: true };
    if (n.hasName('item')) return { id: n.id(), transformer: false };
    n = n.getParent();
  }
  return { id: null, transformer: false };
}

function view(): Viewport {
  return activeScene()?.gmViewport ?? { x: 0, y: 0, zoom: 1 };
}

function toWorld(p: Vec2): Vec2 {
  return screenToWorld(p, view(), getUi().screen);
}

/** Items whose on-screen box meets the band (locked items are left out). */
function itemsInBand(band: Rect): Id[] {
  const scene = activeScene();
  const stage = stageRef.current;
  if (!scene || !stage) return [];
  const v = view();
  const screen = getUi().screen;
  const tl = {
    x: (band.x - v.x) * v.zoom + screen.width / 2,
    y: (band.y - v.y) * v.zoom + screen.height / 2,
  };
  const screenBand = { x: tl.x, y: tl.y, width: band.width * v.zoom, height: band.height * v.zoom };
  const ids: Id[] = [];
  for (const it of Object.values(scene.items)) {
    if (it.locked) continue;
    const node = itemNodes.get(it.id);
    if (node && rectsIntersect(node.getClientRect(), screenBand)) ids.push(it.id);
  }
  return ids;
}

function endGesture() {
  useCanvasUi.setState({ band: null, gesture: null });
}

/** Shared between the canvas and the hotkeys. */
const gestureState: { gesture: Gesture | null } = { gesture: null };

/** Esc: drops the current drag, pan or band; a dragged item returns to its place. */
export function cancelGesture(): boolean {
  if (!gestureState.gesture) return false;
  gestureState.gesture = null;
  useGm.setState({ drag: null });
  endGesture();
  return true;
}

export function useCanvasInput(container: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const g = gestureState;

    const local = (e: { clientX: number; clientY: number }): Vec2 => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      const scene = activeScene();
      if (!scene || g.gesture) return;
      const p = local(e);
      const world = toWorld(p);
      const { tool, selection, textEdit } = getGm();
      const panRequested = e.button === 1 || (e.button === 0 && getUi().spaceDown);
      if (panRequested) {
        e.preventDefault();
        g.gesture = { kind: 'pan', start: p, view: view(), moved: false, clearOnClick: false };
        useCanvasUi.setState({ gesture: 'pan' });
        return;
      }
      const hit = hitTest(p);
      if (hit.transformer) return; // Konva handles resize and rotation
      if (textEdit) {
        // A click elsewhere finishes the text being edited.
        finishTextEdit();
        if (e.button === 0) return;
      }
      const item = hit.id ? scene.items[hit.id] : undefined;

      if (e.button === 2) {
        if (item && !selection.includes(item.id)) useGm.setState({ selection: [item.id] });
        return;
      }
      if (e.button !== 0) return;

      if (tool === 'text') {
        e.preventDefault(); // keep focus in the editor that is about to open
        if (item?.kind === 'text') startTextEdit(item.id, item.position);
        else startTextEdit(null, world);
        return;
      }
      if (tool !== 'move' && tool !== 'select') return;

      if (item && !item.locked) {
        let sel = selection;
        let collapseTo: Id | undefined;
        if (e.shiftKey) {
          if (sel.includes(item.id)) {
            useGm.setState({ selection: sel.filter((id) => id !== item.id) });
            return;
          }
          sel = [...sel, item.id];
        } else if (!sel.includes(item.id)) {
          sel = [item.id];
        } else if (sel.length > 1) {
          collapseTo = item.id;
        }
        useGm.setState({ selection: sel });
        const orig: Record<Id, Vec2> = {};
        for (const id of sel) {
          const it = scene.items[id];
          if (it && !it.locked) orig[id] = it.position;
        }
        g.gesture = {
          kind: 'drag',
          start: p,
          startWorld: world,
          leadId: item.id,
          orig,
          copy: e.altKey,
          moved: false,
          collapseTo,
        };
        useCanvasUi.setState({ gesture: 'drag' });
        return;
      }

      // Empty space or a locked item (maps): pan with Move, rubber band with Select.
      if (tool === 'move') {
        g.gesture = { kind: 'pan', start: p, view: view(), moved: false, clearOnClick: true };
      } else {
        g.gesture = { kind: 'band', start: p, startWorld: world, additive: e.shiftKey, moved: false };
      }
      useCanvasUi.setState({ gesture: g.gesture.kind });
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = local(e);
      lastPointer.world = toWorld(p);
      const gesture = g.gesture;
      if (!gesture) return;
      const dist = Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y);
      if (!gesture.moved && dist < DRAG_THRESHOLD) return;
      gesture.moved = true;
      if (gesture.kind === 'pan') {
        setGmViewport(panBy(gesture.view, sub(p, gesture.start)));
      } else if (gesture.kind === 'drag') {
        const scene = activeScene();
        const lead = scene?.items[gesture.leadId];
        const leadOrig = gesture.orig[gesture.leadId];
        if (!scene || !lead || !leadOrig) return;
        const world = toWorld(p);
        const raw = {
          x: leadOrig.x + world.x - gesture.startWorld.x,
          y: leadOrig.y + world.y - gesture.startWorld.y,
        };
        const snapped = snapFor(lead, raw, scene, e.ctrlKey || e.metaKey);
        const delta = sub(snapped, leadOrig);
        const positions: Record<Id, Vec2> = {};
        for (const [id, o] of Object.entries(gesture.orig))
          positions[id] = { x: o.x + delta.x, y: o.y + delta.y };
        useGm.setState({ drag: { positions, copy: gesture.copy } });
      } else {
        const world = toWorld(p);
        const a = gesture.startWorld;
        useCanvasUi.setState({
          band: {
            x: Math.min(a.x, world.x),
            y: Math.min(a.y, world.y),
            width: Math.abs(world.x - a.x),
            height: Math.abs(world.y - a.y),
          },
        });
      }
    };

    const onPointerUp = () => {
      const gesture = g.gesture;
      if (!gesture) return;
      g.gesture = null;
      if (gesture.kind === 'pan') {
        if (!gesture.moved && gesture.clearOnClick) useGm.setState({ selection: [] });
      } else if (gesture.kind === 'drag') {
        const drag = getGm().drag;
        useGm.setState({ drag: null });
        if (!gesture.moved || !drag) {
          if (gesture.collapseTo) useGm.setState({ selection: [gesture.collapseTo] });
        } else {
          commitDrag(drag.positions, gesture.orig, gesture.copy);
        }
      } else {
        const band = useCanvasUi.getState().band;
        if (!gesture.moved || !band) {
          if (!gesture.additive) useGm.setState({ selection: [] });
        } else {
          const ids = itemsInBand(band);
          const sel = gesture.additive ? [...new Set([...getGm().selection, ...ids])] : ids;
          useGm.setState({ selection: sel });
        }
      }
      endGesture();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!activeScene()) return;
      const v = view();
      if (isTrackpadPan(e)) {
        setGmViewport(panBy(v, { x: -e.deltaX, y: -e.deltaY }));
        return;
      }
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;
      if (e.deltaMode === 2) dy *= 800;
      const k = e.ctrlKey ? 0.01 : 0.0015;
      setGmViewport(zoomAt(v, Math.exp(-dy * k), local(e), getUi().screen));
    };

    const onDblClick = (e: MouseEvent) => {
      const scene = activeScene();
      if (!scene) return;
      const hit = hitTest(local(e));
      const item = hit.id ? scene.items[hit.id] : undefined;
      if (!item) return;
      if (item.kind === 'text' && !item.locked) startTextEdit(item.id, item.position);
      else useGm.setState({ selection: [item.id] }); // the way to select locked items
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onLeave = () => {
      lastPointer.world = null;
    };
    // Middle-button autoscroll would steal the drag.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [container]);
}

/**
 * Drop: the dragged items take their new positions in one undo step. With Alt the originals
 * stay where they were and the copies (numbered discs count up) land at the drop point.
 */
function commitDrag(positions: Record<Id, Vec2>, orig: Record<Id, Vec2>, copy: boolean) {
  const scene = activeScene();
  if (!scene) return;
  const ids = Object.keys(positions).filter((id) => scene.items[id]);
  if (copy) {
    const first = ids[0];
    if (!first) return;
    const offset = sub(positions[first], orig[first]);
    const copies = cloneItems(
      ids.map((id) => scene.items[id]),
      offset,
      scene,
    );
    changeScene((d) => {
      for (const c of copies) d.items[c.id] = c;
    });
    useGm.setState({ selection: copies.map((c) => c.id) });
    return;
  }
  changeScene((d) => {
    for (const id of ids) d.items[id].position = positions[id];
  });
}

import { enablePatches, produce, produceWithPatches, type Draft } from 'immer';
import { create } from 'zustand';
import { DEFAULT_DRAW_STYLE, DEFAULT_SETTINGS, DEFAULT_TEXT_STYLE } from '../core/constants';
import { History } from '../core/history';
import type {
  AppSettings,
  Asset,
  Collection,
  DrawStyle,
  Id,
  ImageGrid,
  Scene,
  TextStyle,
  Vec2,
} from '../core/types';

enablePatches();

export type ToolId = 'move' | 'select' | 'fog' | 'draw' | 'measure' | 'pointer' | 'text';
export type MeasureMode = 'ruler' | 'movement';
export type DrawMode = 'brush' | 'line' | 'rect' | 'ellipse' | 'polygon' | 'eraser';
export type FogMode = 'rect' | 'polygon' | 'ellipse' | 'brush';

export interface DragState {
  /** Live positions of the dragged items; the scene changes only on drop. */
  positions: Record<Id, Vec2>;
  /** Alt-drag: the originals stay in place as copies. */
  copy: boolean;
  /** Movement mode: a translucent ghost stays at the start. */
  ghost?: boolean;
}

export interface AlignState {
  itemId: Id;
  original: ImageGrid;
  position: Vec2; // original position, restored on cancel
}

export interface TextEditState {
  id: Id | null; // null: a new text at `position`
  position: Vec2;
  draft: string;
}

export type SaveState = 'saved' | 'saving' | 'dirty';

export interface GmState {
  ready: boolean;
  fatal?: string;
  settings: AppSettings;
  collections: Collection[];
  collectionId: Id;
  assets: Record<Id, Asset>;
  scenes: Record<Id, Scene>;
  activeSceneId: Id | null;
  backdropId: Id | null; // backdrop asset shown over the scene on both screens
  selection: Id[];
  tool: ToolId;
  drag: DragState | null;
  align: AlignState | null;
  textEdit: TextEditState | null;
  textStyle: TextStyle;
  measureMode: MeasureMode;
  drawMode: DrawMode;
  drawStyle: DrawStyle;
  fogMode: FogMode;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
}

export const useGm = create<GmState>(() => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  collections: [],
  collectionId: '',
  assets: {},
  scenes: {},
  activeSceneId: null,
  backdropId: null,
  selection: [],
  tool: 'move',
  drag: null,
  align: null,
  textEdit: null,
  textStyle: DEFAULT_TEXT_STYLE,
  measureMode: 'ruler',
  drawMode: 'brush',
  drawStyle: DEFAULT_DRAW_STYLE,
  fogMode: 'rect',
  saveState: 'saved',
  canUndo: false,
  canRedo: false,
}));

export const getGm = useGm.getState;

/** Applies an Immer recipe to the whole GM state. */
export function setGm(recipe: (draft: Draft<GmState>) => void): void {
  useGm.setState(produce(getGm(), recipe));
}

export function activeScene(s: GmState = getGm()): Scene | null {
  return s.activeSceneId ? (s.scenes[s.activeSceneId] ?? null) : null;
}

export function useActiveScene(): Scene | null {
  return useGm((s) => (s.activeSceneId ? (s.scenes[s.activeSceneId] ?? null) : null));
}

// --- per-scene undo history -----------------------------------------------------------------

const histories = new Map<Id, History>();

export function historyFor(sceneId: Id): History {
  let h = histories.get(sceneId);
  if (!h) {
    h = new History();
    histories.set(sceneId, h);
  }
  return h;
}

export function dropHistory(sceneId: Id): void {
  histories.delete(sceneId);
}

function historyFlags(sceneId: Id | null) {
  const h = sceneId ? histories.get(sceneId) : undefined;
  return { canUndo: h?.canUndo ?? false, canRedo: h?.canRedo ?? false };
}

export function refreshHistoryFlags(): void {
  const flags = historyFlags(getGm().activeSceneId);
  const s = getGm();
  if (s.canUndo !== flags.canUndo || s.canRedo !== flags.canRedo) useGm.setState(flags);
}

export interface ChangeOptions {
  /** false: not undoable (camera, thumbnails). Default true. */
  history?: boolean;
  /** Consecutive changes with the same key merge into one undo step (sliders). */
  key?: string;
}

/** Changes the active scene; undoable unless `history: false`. */
export function changeScene(recipe: (draft: Draft<Scene>) => void, opts: ChangeOptions = {}): void {
  const s = getGm();
  const id = s.activeSceneId;
  if (!id) return;
  const scene = s.scenes[id];
  if (!scene) return;
  if (opts.history === false) {
    const next = produce(scene, recipe);
    if (next !== scene) useGm.setState({ scenes: { ...s.scenes, [id]: next } });
    return;
  }
  const [changed, patches, inverse] = produceWithPatches(scene, recipe);
  if (patches.length === 0) return;
  const next = produce(changed, (d) => {
    d.updatedAt = Date.now();
  });
  historyFor(id).push(patches, inverse, opts.key);
  useGm.setState({ scenes: { ...s.scenes, [id]: next }, ...historyFlags(id) });
}

function stepHistory(dir: 'undo' | 'redo'): void {
  const s = getGm();
  const id = s.activeSceneId;
  if (!id || s.drag || s.align) return;
  const h = histories.get(id);
  const scene = s.scenes[id];
  if (!h || !scene) return;
  const next = dir === 'undo' ? h.undo(scene) : h.redo(scene);
  if (!next) return;
  const stamped = produce(next, (d) => {
    d.updatedAt = Date.now();
  });
  useGm.setState({
    scenes: { ...s.scenes, [id]: stamped },
    selection: s.selection.filter((sid) => sid in stamped.items),
    ...historyFlags(id),
  });
}

export const undo = () => stepHistory('undo');
export const redo = () => stepHistory('redo');

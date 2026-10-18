import { AUTOSAVE_DELAY } from '../core/constants';
import type { Id, Scene } from '../core/types';
import { db } from '../db/db';
import { getGm, useGm } from './store';

/** Scene object last written to IndexedDB, by id. Identity tells whether a scene is dirty. */
const saved = new Map<Id, Scene>();
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();

export function markSaved(scene: Scene): void {
  saved.set(scene.id, scene);
}

export function forgetSaved(id: Id): void {
  saved.delete(id);
}

function dirtyScenes(): Scene[] {
  return Object.values(getGm().scenes).filter((s) => saved.get(s.id) !== s);
}

/** Writes every changed scene now. */
export function flushScenes(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  const dirty = dirtyScenes();
  if (dirty.length === 0) return writing;
  for (const s of dirty) saved.set(s.id, s);
  useGm.setState({ saveState: 'saving' });
  writing = writing
    .then(() => db.scenes.bulkPut(dirty))
    .then(() => {
      if (!timer && dirtyScenes().length === 0) useGm.setState({ saveState: 'saved' });
    })
    .catch((err) => {
      console.error('Autosave failed', err);
      for (const s of dirty) if (saved.get(s.id) === s) saved.delete(s.id);
      useGm.setState({ saveState: 'dirty' });
    });
  return writing;
}

/** Saves every scene change with a 500 ms debounce; flushes when the page is hidden. */
export function startAutosave(): () => void {
  const unsub = useGm.subscribe((s, prev) => {
    if (s.scenes === prev.scenes) return;
    if (dirtyScenes().length === 0) return;
    if (s.saveState !== 'dirty' && s.saveState !== 'saving') useGm.setState({ saveState: 'dirty' });
    clearTimeout(timer);
    timer = setTimeout(() => void flushScenes(), AUTOSAVE_DELAY);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushScenes();
  };
  const onPageHide = () => void flushScenes();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  };
}

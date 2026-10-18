import {
  copyItems,
  deleteItems,
  duplicateItems,
  pasteItems,
  toggleLock,
  toggleVisible,
} from '../state/items';
import { resetView } from '../state/scenes';
import { getGm, redo, undo, useGm, type ToolId } from '../state/store';
import { finishTextEdit } from '../state/text';
import { getUi, useUi, writePrefs } from '../state/ui';
import { cancelGesture } from './canvas/input';
import { lastPointer } from './canvas/canvasState';
import { hub } from './playerHub';

/** Tools available in stage 1; the rest of the toolbar comes with stage 2. */
export const ENABLED_TOOLS: ToolId[] = ['move', 'select', 'text'];

export function setTool(tool: ToolId): void {
  if (!ENABLED_TOOLS.includes(tool)) return;
  finishTextEdit();
  useGm.setState({ tool });
  writePrefs({ tool });
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const TOOL_KEYS: Record<string, ToolId> = { h: 'move', s: 'select', t: 'text' };

export function installHotkeys(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const code = e.code;
    const typing = isTyping(e.target);
    const blocked = !!getUi().dialog || !!getUi().confirm || !!getUi().prompt;

    if (e.key === ' ' && !typing && !blocked) {
      e.preventDefault();
      if (!getUi().spaceDown) useUi.setState({ spaceDown: true });
      return;
    }
    if (typing || blocked || getGm().align) return; // the align panel handles its own keys

    const sel = getGm().selection;
    if (mod) {
      // Layout-independent: Ctrl+Я works like Ctrl+Z on a Russian keyboard.
      if (code === 'KeyZ' && e.shiftKey) redo();
      else if (code === 'KeyZ') undo();
      else if (code === 'KeyY') redo();
      else if (code === 'KeyC') copyItems(sel);
      else if (code === 'KeyV') pasteItems(lastPointer.world ?? undefined);
      else if (code === 'KeyD') duplicateItems(sel);
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey) return;

    if (e.key === 'Escape') {
      if (!cancelGesture()) useGm.setState({ selection: [] });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteItems(sel);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      resetView(getUi().screen);
      return;
    }
    const letter = code.startsWith('Key') ? code.slice(3).toLowerCase() : key;
    if (e.shiftKey) {
      if (letter === 'h') toggleVisible(sel);
      else if (letter === 'l') toggleLock(sel);
      else if (letter === 'y') hub.setFollow(!getUi().follow);
      return;
    }
    if (letter === 'y') {
      hub.syncView();
      return;
    }
    const tool = TOOL_KEYS[letter];
    if (tool) setTool(tool);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' && getUi().spaceDown) useUi.setState({ spaceDown: false });
  };
  const onBlur = () => useUi.setState({ spaceDown: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

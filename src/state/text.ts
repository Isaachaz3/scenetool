import type { Id, TextStyle, Vec2 } from '../core/types';
import { addText, deleteItems, updateItems } from './items';
import { activeScene, getGm, useGm } from './store';

export function startTextEdit(id: Id | null, position: Vec2): void {
  finishTextEdit();
  const scene = activeScene();
  const existing = id ? scene?.items[id] : undefined;
  const draft = existing?.kind === 'text' ? existing.text : '';
  if (existing?.kind === 'text') useGm.setState({ textStyle: existing.style });
  useGm.setState({ textEdit: { id, position, draft }, selection: id ? [id] : [] });
}

export function setTextDraft(draft: string): void {
  const te = getGm().textEdit;
  if (te) useGm.setState({ textEdit: { ...te, draft } });
}

/** Esc, a click elsewhere or blur: keep the text (an empty text is removed). */
export function finishTextEdit(): void {
  const te = getGm().textEdit;
  if (!te) return;
  useGm.setState({ textEdit: null });
  const scene = activeScene();
  if (te.id) {
    const item = scene?.items[te.id];
    if (!item || item.kind !== 'text') return;
    if (!te.draft.trim()) deleteItems([te.id]);
    else if (te.draft !== item.text) {
      updateItems([te.id], (it) => {
        if (it.kind === 'text') it.text = te.draft;
      });
    }
  } else if (te.draft.trim()) {
    const id = addText(te.draft, getGm().textStyle, te.position);
    if (id) useGm.setState({ selection: [id] });
  }
}

/** Changes the style for new texts and for the selected or edited text items. */
export function setTextStyle(patch: Partial<TextStyle>): void {
  const s = getGm();
  useGm.setState({ textStyle: { ...s.textStyle, ...patch } });
  const scene = activeScene(s);
  if (!scene) return;
  const ids = [...s.selection, ...(s.textEdit?.id ? [s.textEdit.id] : [])].filter(
    (id) => scene.items[id]?.kind === 'text',
  );
  if (ids.length === 0) return;
  updateItems(
    [...new Set(ids)],
    (it) => {
      if (it.kind === 'text') Object.assign(it.style, patch);
    },
    'text-style',
  );
}

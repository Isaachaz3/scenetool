import { useEffect, useLayoutEffect, useRef } from 'react';
import { FONT_FAMILIES, TEXT_BACKGROUND } from '../../core/constants';
import { worldToScreen } from '../../core/viewport';
import { activeScene, useGm } from '../../state/store';
import { finishTextEdit, setTextDraft } from '../../state/text';
import { useUi } from '../../state/ui';

/** In-place editor for a text item: Enter adds a line, Esc or a click elsewhere finishes. */
export function TextEditor() {
  const edit = useGm((s) => s.textEdit);
  const style = useGm((s) => s.textStyle);
  const item = useGm((s) => (s.textEdit?.id ? activeScene(s)?.items[s.textEdit.id] : undefined));
  const view = useGm((s) => activeScene(s)?.gmViewport);
  const screen = useUi((s) => s.screen);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (edit) ref.current?.focus();
  }, [edit?.id, edit?.position.x, edit?.position.y, edit]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
    el.style.width = '0px';
    el.style.width = Math.max(40, el.scrollWidth + 4) + 'px';
  });

  if (!edit || !view) return null;
  const st = item?.kind === 'text' ? item.style : style;
  const scale = item?.kind === 'text' ? item.scale.x : 1;
  const rotation = item?.rotation ?? 0;
  const p = worldToScreen(edit.position, view, screen);
  const size = st.fontSize * view.zoom * scale;
  const pad = st.background ? st.fontSize * 0.3 * view.zoom * scale : 0;
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={edit.draft}
      spellCheck={false}
      style={{
        left: p.x,
        top: p.y,
        fontSize: size,
        lineHeight: 1.2,
        padding: pad,
        fontFamily: FONT_FAMILIES[st.fontFamily],
        fontWeight: st.bold ? 700 : 400,
        color: st.color,
        textAlign: st.align,
        background: st.background
          ? st.background === 'dark'
            ? TEXT_BACKGROUND
            : st.background
          : 'transparent',
        transform: `rotate(${rotation}deg)`,
      }}
      onChange={(e) => setTextDraft(e.target.value)}
      onBlur={() => finishTextEdit()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finishTextEdit();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

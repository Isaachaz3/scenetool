import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Cloud,
  Hand,
  Pencil,
  Redo2,
  Ruler,
  SquareDashedMousePointer,
  Type,
  Undo2,
  Wand,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../../i18n/ru';
import { redo, undo, useGm, type ToolId } from '../../state/store';
import { setTextStyle } from '../../state/text';
import { useUi, writePrefs } from '../../state/ui';
import { ENABLED_TOOLS, setTool } from '../hotkeys';
import { ColorSwatches, IconButton, NumberInput, Panel, Segmented } from './common';

const TOOLS: { id: ToolId; icon: ReactNode; label: string; key: string }[] = [
  { id: 'move', icon: <Hand size={20} />, label: t.tools.move, key: 'H' },
  { id: 'select', icon: <SquareDashedMousePointer size={20} />, label: t.tools.select, key: 'S' },
  { id: 'fog', icon: <Cloud size={20} />, label: t.tools.fog, key: 'F' },
  { id: 'draw', icon: <Pencil size={20} />, label: t.tools.draw, key: 'D' },
  { id: 'measure', icon: <Ruler size={20} />, label: t.tools.measure, key: 'R' },
  { id: 'pointer', icon: <Wand size={20} />, label: t.tools.pointer, key: 'P' },
  { id: 'text', icon: <Type size={20} />, label: t.tools.text, key: 'T' },
];

export function Toolbar() {
  const tool = useGm((s) => s.tool);
  const canUndo = useGm((s) => s.canUndo);
  const canRedo = useGm((s) => s.canRedo);
  const collapsed = useUi((s) => s.toolbarCollapsed);
  const toggle = () => {
    useUi.setState({ toolbarCollapsed: !collapsed });
    writePrefs({ toolbarCollapsed: !collapsed });
  };
  const current = TOOLS.find((x) => x.id === tool);
  return (
    <Panel className="toolbar">
      <IconButton
        icon={collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        label={collapsed ? t.tools.expand : t.tools.collapse}
        onClick={toggle}
        className="small"
      />
      {collapsed ? (
        current ? (
          <IconButton icon={current.icon} label={current.label} hotkey={current.key} active />
        ) : null
      ) : (
        <>
          {TOOLS.map((x) => {
            const enabled = ENABLED_TOOLS.includes(x.id);
            return (
              <IconButton
                key={x.id}
                icon={x.icon}
                label={enabled ? x.label : `${x.label} — ${t.tools.nextStage}`}
                hotkey={enabled ? x.key : undefined}
                active={tool === x.id}
                disabled={!enabled}
                onClick={() => setTool(x.id)}
              />
            );
          })}
          <div className="sep" />
          <IconButton
            icon={<Undo2 size={20} />}
            label={t.tools.undo}
            hotkey="Ctrl+Z"
            disabled={!canUndo}
            onClick={undo}
          />
          <IconButton
            icon={<Redo2 size={20} />}
            label={t.tools.redo}
            hotkey="Ctrl+Shift+Z"
            disabled={!canRedo}
            onClick={redo}
          />
        </>
      )}
    </Panel>
  );
}

/** Top-left panel with the options of the active tool. */
export function ToolOptions() {
  const tool = useGm((s) => s.tool);
  const selectedText = useGm((s) => {
    const scene = s.activeSceneId ? s.scenes[s.activeSceneId] : undefined;
    return s.selection.some((id) => scene?.items[id]?.kind === 'text') || !!s.textEdit;
  });
  if (tool !== 'text' && !selectedText) return null;
  return <TextOptions />;
}

const TEXT_COLORS = ['#ffffff', '#111111', '#facc15', '#ef4444', '#a78bfa', '#22c55e'];

function TextOptions() {
  const style = useGm((s) => s.textStyle);
  return (
    <Panel
      className="tool-options"
      // Clicking a style button must not end the text being edited.
      onPointerDown={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && e.preventDefault()}
    >
      <div className="opt-row">
        <span className="opt-label">{t.text.font}</span>
        <Segmented
          value={style.fontFamily}
          options={(['sans', 'serif', 'fantasy'] as const).map((f) => ({ value: f, label: t.text.fonts[f] }))}
          onChange={(fontFamily) => setTextStyle({ fontFamily })}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.text.size}</span>
        <NumberInput
          value={style.fontSize}
          decimals={0}
          min={6}
          max={2000}
          step={4}
          onChange={(fontSize) => setTextStyle({ fontSize })}
        />
        <IconButton
          icon={<Bold size={18} />}
          label={t.text.bold}
          active={style.bold}
          tipSide="bottom"
          className="small"
          onClick={() => setTextStyle({ bold: !style.bold })}
        />
        <Segmented
          value={style.align}
          options={[
            { value: 'left', label: <AlignLeft size={16} />, title: t.text.aligns.left },
            { value: 'center', label: <AlignCenter size={16} />, title: t.text.aligns.center },
            { value: 'right', label: <AlignRight size={16} />, title: t.text.aligns.right },
          ]}
          onChange={(align) => setTextStyle({ align })}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.text.color}</span>
        <ColorSwatches
          value={style.color}
          colors={TEXT_COLORS}
          onChange={(color) => setTextStyle({ color })}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.text.background}</span>
        <Segmented
          value={style.background ? 'dark' : 'none'}
          options={[
            { value: 'none', label: t.text.backgrounds.none },
            { value: 'dark', label: t.text.backgrounds.dark },
          ]}
          onChange={(v) => setTextStyle({ background: v === 'dark' ? 'dark' : undefined })}
        />
      </div>
    </Panel>
  );
}

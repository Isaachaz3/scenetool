import {
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
import { useUi, writePrefs } from '../../state/ui';
import { setTool } from '../hotkeys';
import { IconButton, Panel } from './common';

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
          {TOOLS.map((x) => (
            <IconButton
              key={x.id}
              icon={x.icon}
              label={x.label}
              hotkey={x.key}
              active={tool === x.id}
              onClick={() => setTool(x.id)}
            />
          ))}
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

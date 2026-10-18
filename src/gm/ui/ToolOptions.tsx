import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Circle,
  Eraser,
  Minus,
  Paintbrush,
  Pentagon,
  Square,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DRAW_COLORS } from '../../core/constants';
import type { MeasurementMethod } from '../../core/types';
import { t } from '../../i18n/ru';
import { updateFog, updateGrid } from '../../state/scenes';
import { activeScene, useGm, type DrawMode, type FogMode } from '../../state/store';
import { setTextStyle } from '../../state/text';
import { useUi } from '../../state/ui';
import { useCanvasUi } from '../canvas/canvasState';
import { ColorSwatches, IconButton, NumberInput, Panel, Segmented, Toggle } from './common';

const TEXT_COLORS = ['#ffffff', '#111111', '#facc15', '#ef4444', '#a78bfa', '#22c55e'];
const FOG_COLORS = ['#222222', '#000000', '#3b3f5c', '#5b4636'];
const METHODS: MeasurementMethod[] = ['chessboard', 'alternating', 'euclidean', 'manhattan'];

const DRAW_ICONS: Record<DrawMode, ReactNode> = {
  brush: <Paintbrush size={18} />,
  line: <Minus size={18} />,
  rect: <Square size={18} />,
  ellipse: <Circle size={18} />,
  polygon: <Pentagon size={18} />,
  eraser: <Eraser size={18} />,
};

const FOG_ICONS: Record<FogMode, ReactNode> = {
  rect: <Square size={18} />,
  polygon: <Pentagon size={18} />,
  ellipse: <Circle size={18} />,
  brush: <Paintbrush size={18} />,
};

function ModeButtons<T extends string>({
  modes,
  icons,
  labels,
  value,
  onChange,
}: {
  modes: T[];
  icons: Record<T, ReactNode>;
  labels: Record<T, string>;
  value: T;
  onChange: (m: T) => void;
}) {
  return (
    <div className="mode-buttons">
      {modes.map((m) => (
        <IconButton
          key={m}
          icon={icons[m]}
          label={labels[m]}
          active={value === m}
          tipSide="bottom"
          className="small"
          onClick={() => onChange(m)}
        />
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="opt-row">
      <span className="opt-label">{label}</span>
      {children}
    </div>
  );
}

function MeasureOptions() {
  const mode = useGm((s) => s.measureMode);
  const method = useGm((s) => activeScene(s)?.grid.measurement ?? 'chessboard');
  return (
    <Panel className="tool-options">
      <Segmented
        value={mode}
        options={[
          { value: 'ruler', label: `${t.measure.ruler} (R)` },
          { value: 'movement', label: `${t.measure.movement} (M)` },
        ]}
        onChange={(measureMode) => useGm.setState({ measureMode })}
      />
      <Row label={t.measure.method}>
        <select
          value={method}
          onChange={(e) => updateGrid({ measurement: e.target.value as MeasurementMethod })}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t.grid.measurements[m]}
            </option>
          ))}
        </select>
      </Row>
      <p className="hint">{mode === 'ruler' ? t.measure.rulerHint : t.measure.movementHint}</p>
    </Panel>
  );
}

function DrawOptions() {
  const mode = useGm((s) => s.drawMode);
  const style = useGm((s) => s.drawStyle);
  const set = (patch: Partial<typeof style>) => useGm.setState({ drawStyle: { ...style, ...patch } });
  const polygon = useCanvasUi((s) => !!s.polygon);
  return (
    <Panel className="tool-options">
      <ModeButtons
        modes={['brush', 'line', 'rect', 'ellipse', 'polygon', 'eraser'] as DrawMode[]}
        icons={DRAW_ICONS}
        labels={t.draw.modes}
        value={mode}
        onChange={(drawMode) => useGm.setState({ drawMode })}
      />
      {mode === 'eraser' ? (
        <p className="hint">{t.draw.eraserHint}</p>
      ) : (
        <>
          <Row label={t.draw.stroke}>
            <ColorSwatches value={style.stroke} colors={DRAW_COLORS} onChange={(stroke) => set({ stroke })} />
          </Row>
          <Row label={t.draw.width}>
            <NumberInput
              value={style.strokeWidth}
              decimals={1}
              min={1}
              max={200}
              step={2}
              onChange={(strokeWidth) => set({ strokeWidth })}
            />
          </Row>
          <Row label={t.draw.fill}>
            <Toggle checked={style.fill} onChange={(fill) => set({ fill })} label={t.draw.fill} />
            {style.fill ? (
              <ColorSwatches
                value={style.fillColor}
                colors={DRAW_COLORS}
                onChange={(fillColor) => set({ fillColor })}
              />
            ) : null}
          </Row>
          <Row label={t.draw.opacity}>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={style.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
            />
            <span className="opt-value">{Math.round(style.opacity * 100)}%</span>
          </Row>
          {mode === 'polygon' || polygon ? <p className="hint">{t.fog.polygonHint}</p> : null}
        </>
      )}
    </Panel>
  );
}

function FogOptions() {
  const mode = useGm((s) => s.fogMode);
  const fog = useGm((s) => activeScene(s)?.fog);
  const preview = useUi((s) => s.preview);
  if (!fog) return null;
  return (
    <Panel className="tool-options">
      <ModeButtons
        modes={['rect', 'polygon', 'ellipse', 'brush'] as FogMode[]}
        icons={FOG_ICONS}
        labels={t.fog.modes}
        value={mode}
        onChange={(fogMode) => useGm.setState({ fogMode })}
      />
      <Row label={t.fog.fill}>
        <Toggle checked={fog.fill} onChange={(fill) => updateFog({ fill })} label={t.fog.fill} />
        <span className="hint inline">{t.fog.fillHint}</span>
      </Row>
      <Row label={t.fog.cutByDefault}>
        <Toggle
          checked={fog.cutByDefault}
          onChange={(cutByDefault) => updateFog({ cutByDefault })}
          label={t.fog.cutByDefault}
        />
      </Row>
      <Row label={t.fog.preview}>
        <Toggle checked={preview} onChange={(v) => useUi.setState({ preview: v })} label={t.fog.preview} />
        <span className="hint inline">Shift+P</span>
      </Row>
      <Row label={t.fog.color}>
        <ColorSwatches
          value={fog.color}
          colors={FOG_COLORS}
          onChange={(color) => updateFog({ color }, 'fog-color')}
        />
      </Row>
      <Row label={t.fog.gmOpacity}>
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.05}
          value={fog.gmOpacity}
          onChange={(e) => updateFog({ gmOpacity: Number(e.target.value) }, 'fog-opacity')}
        />
        <span className="opt-value">{Math.round(fog.gmOpacity * 100)}%</span>
      </Row>
      <p className="hint">{mode === 'polygon' ? t.fog.polygonHint : t.fog.clickHint}</p>
    </Panel>
  );
}

function TextOptions() {
  const style = useGm((s) => s.textStyle);
  return (
    <Panel
      className="tool-options"
      // Clicking a style button must not end the text being edited.
      onPointerDown={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && e.preventDefault()}
    >
      <Row label={t.text.font}>
        <Segmented
          value={style.fontFamily}
          options={(['sans', 'serif', 'fantasy'] as const).map((f) => ({ value: f, label: t.text.fonts[f] }))}
          onChange={(fontFamily) => setTextStyle({ fontFamily })}
        />
      </Row>
      <Row label={t.text.size}>
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
      </Row>
      <Row label={t.text.color}>
        <ColorSwatches
          value={style.color}
          colors={TEXT_COLORS}
          onChange={(color) => setTextStyle({ color })}
        />
      </Row>
      <Row label={t.text.background}>
        <Segmented
          value={style.background ? 'dark' : 'none'}
          options={[
            { value: 'none', label: t.text.backgrounds.none },
            { value: 'dark', label: t.text.backgrounds.dark },
          ]}
          onChange={(v) => setTextStyle({ background: v === 'dark' ? 'dark' : undefined })}
        />
      </Row>
    </Panel>
  );
}

/** Top-left panel with the sub-modes and style of the active tool. */
export function ToolOptions() {
  const tool = useGm((s) => s.tool);
  const selectedText = useGm((s) => {
    const scene = s.activeSceneId ? s.scenes[s.activeSceneId] : undefined;
    return s.selection.some((id) => scene?.items[id]?.kind === 'text') || !!s.textEdit;
  });
  const aligning = useGm((s) => !!s.align);
  if (aligning) return null;
  switch (tool) {
    case 'measure':
      return <MeasureOptions />;
    case 'draw':
      return <DrawOptions />;
    case 'fog':
      return <FogOptions />;
    case 'pointer':
      return (
        <Panel className="tool-options">
          <p className="hint">{t.pointer.hint}</p>
        </Panel>
      );
    default:
      return tool === 'text' || selectedText ? <TextOptions /> : null;
  }
}

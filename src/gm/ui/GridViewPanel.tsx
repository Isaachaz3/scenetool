import { Maximize2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CELL, GRID_COLORS } from '../../core/constants';
import { formatScale, parseScale } from '../../core/scale';
import type { LineStyle, MeasurementMethod } from '../../core/types';
import { clampZoom } from '../../core/viewport';
import { t } from '../../i18n/ru';
import { resetView, setGmViewport, updateGrid } from '../../state/scenes';
import { activeScene, useActiveScene, useGm } from '../../state/store';
import { getUi, useUi } from '../../state/ui';
import { hub } from '../playerHub';
import { ColorSwatches, NumberInput, Panel, Segmented, Toggle, useClickOutside } from './common';

const MEASUREMENTS: MeasurementMethod[] = ['chessboard', 'alternating', 'euclidean', 'manhattan'];
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];

function ScaleInput() {
  const scale = useGm((s) => activeScene(s)?.grid.scale);
  const [text, setText] = useState(scale ? formatScale(scale) : '');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (scale) setText(formatScale(scale));
  }, [scale]);
  return (
    <input
      className={'text-input' + (bad ? ' bad' : '')}
      value={text}
      title={t.grid.scaleHint}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseScale(e.target.value);
        setBad(!parsed);
        if (parsed) updateGrid({ scale: parsed }, 'grid-scale');
      }}
      onBlur={() => {
        setBad(false);
        if (scale) setText(formatScale(scale));
      }}
    />
  );
}

function GridSettingsSection() {
  const grid = useGm((s) => activeScene(s)?.grid);
  if (!grid) return null;
  return (
    <section>
      <h3>{t.grid.title}</h3>
      <div className="opt-row">
        <span className="opt-label">{t.grid.color}</span>
        <ColorSwatches
          value={grid.color}
          colors={GRID_COLORS}
          names={t.grid.colorNames}
          onChange={(color) => updateGrid({ color }, 'grid-color')}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.opacity}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={grid.opacity}
          onChange={(e) => updateGrid({ opacity: Number(e.target.value) }, 'grid-opacity')}
        />
        <span className="opt-value">{Math.round(grid.opacity * 100)}%</span>
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.scale}</span>
        <ScaleInput />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.lineWidth}</span>
        <NumberInput
          value={grid.lineWidth}
          decimals={2}
          min={0.25}
          max={20}
          step={0.25}
          onChange={(lineWidth) => updateGrid({ lineWidth }, 'grid-width')}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.lineStyle}</span>
        <Segmented
          value={grid.lineStyle}
          options={LINE_STYLES.map((v) => ({ value: v, label: t.grid.lineStyles[v] }))}
          onChange={(lineStyle) => updateGrid({ lineStyle })}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.type}</span>
        <select value={grid.type} onChange={() => {}} disabled>
          <option value="square">{t.grid.types.square}</option>
        </select>
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.measurement}</span>
        <select
          value={grid.measurement}
          onChange={(e) => updateGrid({ measurement: e.target.value as MeasurementMethod })}
        >
          {MEASUREMENTS.map((m) => (
            <option key={m} value={m}>
              {t.grid.measurements[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.snapping}</span>
        <Toggle
          checked={grid.snapping}
          onChange={(snapping) => updateGrid({ snapping })}
          label={t.grid.snapping}
        />
      </div>
      <div className="opt-row">
        <span className="opt-label">{t.grid.showToPlayers}</span>
        <Toggle
          checked={grid.showToPlayers}
          onChange={(showToPlayers) => updateGrid({ showToPlayers })}
          label={t.grid.showToPlayers}
        />
      </div>
    </section>
  );
}

function ViewSection() {
  const v = useGm((s) => activeScene(s)?.gmViewport);
  const follow = useUi((s) => s.follow);
  if (!v) return null;
  return (
    <section>
      <h3>{t.view.title}</h3>
      <div className="view-fields">
        <label>
          <span>{t.view.x}</span>
          <NumberInput
            value={v.x / CELL}
            decimals={2}
            onChange={(x) => setGmViewport({ ...v, x: x * CELL })}
          />
        </label>
        <label>
          <span>{t.view.y}</span>
          <NumberInput
            value={v.y / CELL}
            decimals={2}
            onChange={(y) => setGmViewport({ ...v, y: y * CELL })}
          />
        </label>
        <label>
          <span>{t.view.zoom}</span>
          <NumberInput
            value={v.zoom * 100}
            decimals={0}
            min={10}
            max={1000}
            step={10}
            onChange={(z) => setGmViewport({ ...v, zoom: clampZoom(z / 100) })}
          />
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          title={t.view.resetHint}
          onClick={() => resetView(getUi().screen)}
        >
          <Maximize2 size={16} /> {t.view.reset}
        </button>
      </div>
      <SyncButton follow={follow} />
    </section>
  );
}

/** "Следовать" toggle on the left of the Sync View button. */
function SyncButton({ follow }: { follow: boolean }) {
  return (
    <div className="sync-button">
      <label className="sync-follow" title={t.view.followHint}>
        <Toggle checked={follow} onChange={(on) => hub.setFollow(on)} label={t.view.follow} />
        <span>{t.view.follow}</span>
      </label>
      <button type="button" className="btn primary" title={t.view.syncHint} onClick={() => hub.syncView()}>
        <Send size={16} /> {t.view.sync}
      </button>
    </div>
  );
}

export function GridViewPanel() {
  const scene = useActiveScene();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  if (!scene) return null;
  return (
    <div className="grid-view" ref={ref}>
      {open ? (
        <Panel className="grid-view-panel">
          <GridSettingsSection />
          <ViewSection />
        </Panel>
      ) : null}
      <Panel className="scale-button-wrap">
        <button
          type="button"
          className={'scale-button' + (open ? ' active' : '')}
          data-tip={t.grid.buttonHint}
          data-tip-side="top"
          onClick={() => setOpen(!open)}
        >
          {formatScale(scene.grid.scale)}
        </button>
      </Panel>
    </div>
  );
}

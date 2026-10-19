import { useEffect, useRef, useState } from 'react';
import { ALIGN_GRID_COLOR } from '../../core/constants';
import { divisibleDpis } from '../../core/dpi/detect';
import type { ImageGrid } from '../../core/types';
import { t } from '../../i18n/ru';
import { NumberInput } from './common';

const MIN_DPI = 4;

/** Columns, rows, DPI and offset; columns and rows recompute DPI and each other. */
export function GridFitFields({
  width,
  height,
  grid,
  onChange,
}: {
  width: number;
  height: number;
  grid: ImageGrid;
  onChange: (g: ImageGrid) => void;
}) {
  const set = (patch: Partial<ImageGrid>) => onChange({ ...grid, ...patch, source: 'manual' });
  const setDpi = (dpi: number) => dpi >= MIN_DPI && set({ dpi });
  const candidates = divisibleDpis(width, height);
  return (
    <>
      {candidates.length > 0 ? (
        <div className="dpi-candidates">
          <span className="muted">{t.align.candidates}</span>
          {candidates.map((dpi) => (
            <button
              key={dpi}
              type="button"
              className={'btn small-btn' + (Math.abs(grid.dpi - dpi) < 0.005 ? ' active' : '')}
              onClick={() => set({ dpi })}
            >
              {t.align.candidate(dpi, Math.round(width / dpi), Math.round(height / dpi))}
            </button>
          ))}
        </div>
      ) : null}
      <div className="fit-fields">
        <label>
          <span>{t.align.cols}</span>
          <NumberInput
            value={width / grid.dpi}
            decimals={2}
            min={1}
            onChange={(c) => c > 0 && setDpi(width / c)}
          />
        </label>
        <label>
          <span>{t.align.rows}</span>
          <NumberInput
            value={height / grid.dpi}
            decimals={2}
            min={1}
            onChange={(r) => r > 0 && setDpi(height / r)}
          />
        </label>
        <label>
          <span>{t.align.dpi}</span>
          <NumberInput value={grid.dpi} decimals={2} min={MIN_DPI} step={0.1} onChange={setDpi} />
        </label>
        <label>
          <span>{t.align.offsetX}</span>
          <NumberInput
            value={grid.offset.x}
            decimals={2}
            onChange={(x) => set({ offset: { ...grid.offset, x } })}
          />
        </label>
        <label>
          <span>{t.align.offsetY}</span>
          <NumberInput
            value={grid.offset.y}
            decimals={2}
            onChange={(y) => set({ offset: { ...grid.offset, y } })}
          />
        </label>
      </div>
    </>
  );
}

/**
 * Keyboard nudging shared by the importer, the asset editor and the scene: arrows move by
 * 1 px (10 with Shift), + and − change DPI by 0.1. `sign` is +1 when the grid overlay moves
 * with the arrow, −1 when the image does.
 */
export function nudgeGrid(e: KeyboardEvent, grid: ImageGrid, sign: 1 | -1): ImageGrid | null {
  const step = e.shiftKey ? 10 : 1;
  const o = grid.offset;
  let next: ImageGrid | null = null;
  if (e.key === 'ArrowLeft') next = { ...grid, offset: { ...o, x: o.x - step * sign } };
  else if (e.key === 'ArrowRight') next = { ...grid, offset: { ...o, x: o.x + step * sign } };
  else if (e.key === 'ArrowUp') next = { ...grid, offset: { ...o, y: o.y - step * sign } };
  else if (e.key === 'ArrowDown') next = { ...grid, offset: { ...o, y: o.y + step * sign } };
  else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')
    next = { ...grid, dpi: round2(grid.dpi + 0.1) };
  else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')
    next = { ...grid, dpi: Math.max(MIN_DPI, round2(grid.dpi - 0.1)) };
  return next ? { ...next, source: 'manual' } : null;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * Image with its grid drawn on top in a contrasting solid line. Wheel zooms, dragging pans,
 * so the far corner can be checked closely.
 */
export function FitPreview({
  image,
  width,
  height,
  grid,
}: {
  image: ImageBitmap | undefined;
  width: number;
  height: number;
  grid: ImageGrid;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ k: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  // Fit the image on first draw.
  useEffect(() => {
    const c = canvas.current;
    if (!c || view) return;
    const k = Math.min(c.clientWidth / width, c.clientHeight / height);
    setView({ k, x: (c.clientWidth - width * k) / 2, y: (c.clientHeight - height * k) / 2 });
  }, [view, width, height]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14151c';
    ctx.fillRect(0, 0, w, h);
    if (image) ctx.drawImage(image, view.x, view.y, width * view.k, height * view.k);
    const cell = grid.dpi * view.k;
    if (cell < 3) return;
    ctx.strokeStyle = ALIGN_GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = view.x + grid.offset.x * view.k;
    const y0 = view.y + grid.offset.y * view.k;
    const left = view.x;
    const right = view.x + width * view.k;
    const top = view.y;
    const bottom = view.y + height * view.k;
    for (let x = x0 - Math.ceil((x0 - left) / cell) * cell; x <= right + 0.5; x += cell) {
      if (x < 0 || x > w) continue;
      ctx.moveTo(x, Math.max(0, top));
      ctx.lineTo(x, Math.min(h, bottom));
    }
    for (let y = y0 - Math.ceil((y0 - top) / cell) * cell; y <= bottom + 0.5; y += cell) {
      if (y < 0 || y > h) continue;
      ctx.moveTo(Math.max(0, left), y);
      ctx.lineTo(Math.min(w, right), y);
    }
    ctx.stroke();
  }, [image, width, height, grid, view]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        if (!v) return v;
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const k = Math.min(20, Math.max(0.01, v.k * f));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <canvas
      ref={canvas}
      className="fit-preview"
      onPointerDown={(e) => {
        if (!view) return;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !view) return;
        setView({ ...view, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y });
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => setView(null)}
    />
  );
}

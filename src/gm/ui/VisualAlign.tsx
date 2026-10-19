import { Crosshair } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALIGN_GRID_COLOR } from '../../core/constants';
import type { ImageGrid, Vec2 } from '../../core/types';
import {
  applyLock,
  dpiFromFar,
  dpiFromSize,
  farCells,
  farHandle,
  lockAxis,
  sizeHandle,
  SIZE_CELLS,
} from '../../core/visualAlign';
import { t } from '../../i18n/ru';
import { nudgeGrid } from './GridFit';

type Step = 1 | 2 | 3;
type HandleId = 'anchor' | 'size' | 'far';
interface View {
  k: number;
  x: number;
  y: number;
}
interface Drag {
  handle: HandleId | 'pan';
  last: Vec2; // pointer, screen px
  start: Vec2; // handle position at the start, image px
  pos: Vec2; // handle position now, image px (before the axis lock)
  cells?: { nx: number; ny: number }; // refine: fixed for the whole drag
  view?: View; // pan: view at the start
  pointer: Vec2; // screen px, for the loupe
}

const HIT_PX = 14;
const LOUPE_R = 75;
const LOUPE_ZOOM = 4;
const SLOW = 0.1;

const toScreen = (v: View, p: Vec2): Vec2 => ({ x: v.x + p.x * v.k, y: v.y + p.y * v.k });
const toImage = (v: View, p: Vec2): Vec2 => ({ x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k });

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  v: View,
  grid: ImageGrid,
  clip: { left: number; top: number; right: number; bottom: number },
) {
  const cell = grid.dpi * v.k;
  if (cell < 3) return;
  const x0 = v.x + grid.offset.x * v.k;
  const y0 = v.y + grid.offset.y * v.k;
  ctx.beginPath();
  for (let x = x0 - Math.floor((x0 - clip.left) / cell) * cell; x <= clip.right + 0.5; x += cell) {
    ctx.moveTo(x, clip.top);
    ctx.lineTo(x, clip.bottom);
  }
  for (let y = y0 - Math.floor((y0 - clip.top) / cell) * cell; y <= clip.bottom + 0.5; y += cell) {
    ctx.moveTo(clip.left, y);
    ctx.lineTo(clip.right, y);
  }
  ctx.stroke();
}

function drawHandle(ctx: CanvasRenderingContext2D, p: Vec2, active: boolean) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = active ? 'rgba(167, 139, 250, 0.5)' : 'rgba(167, 139, 250, 0.25)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a78bfa';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 12, p.y);
  ctx.lineTo(p.x + 12, p.y);
  ctx.moveTo(p.x, p.y - 12);
  ctx.lineTo(p.x, p.y + 12);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

/**
 * Three steps, as in Owlbear: put the anchor on a cell corner, stretch the ruler over 4 cells,
 * then fix the accumulated drift with a handle at the far edge. Shift keeps a drag on one
 * axis, Ctrl slows it down 10 times. Works in image pixels and edits the grid live.
 */
export function VisualAlign({
  image,
  width,
  height,
  grid,
  onChange,
  onClose,
}: {
  image: ImageBitmap | undefined;
  width: number;
  height: number;
  grid: ImageGrid;
  onChange: (g: ImageGrid) => void;
  onClose: (keep: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [view, setView] = useState<View | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const original = useRef(grid);

  const cancel = useCallback(() => {
    onChange(original.current);
    onClose(false);
  }, [onChange, onClose]);

  const set = useCallback(
    (patch: Partial<ImageGrid>) => onChange({ ...grid, ...patch, source: 'manual' }),
    [grid, onChange],
  );

  const handles = useCallback((): Partial<Record<HandleId, Vec2>> => {
    const out: Partial<Record<HandleId, Vec2>> = { anchor: grid.offset };
    if (step === 2) out.size = sizeHandle(grid, width);
    if (step === 3) {
      const c = drag?.cells ?? farCells(grid, width, height);
      out.far = farHandle(grid, c.nx, c.ny);
    }
    return out;
  }, [grid, step, width, height, drag]);

  // Fit the image on first draw.
  useEffect(() => {
    const c = canvas.current;
    if (!c || view) return;
    const k = Math.min(c.clientWidth / width, c.clientHeight / height) * 0.95;
    setView({ k, x: (c.clientWidth - width * k) / 2, y: (c.clientHeight - height * k) / 2 });
  }, [view, width, height]);

  // Keys: Enter = next/done, Esc = cancel, arrows and +/− nudge. Captured before the dialog below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      else if (e.key === 'Enter') {
        if (step < 3) setStep((step + 1) as Step);
        else onClose(true);
      } else {
        const next = nudgeGrid(e, grid, 1);
        if (!next) return;
        onChange(next);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [grid, step, onChange, onClose, cancel]);

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
        const k = Math.min(40, Math.max(0.01, v.k * f));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  // Drawing.
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
    ctx.imageSmoothingEnabled = view.k < 2;
    if (image) ctx.drawImage(image, view.x, view.y, width * view.k, height * view.k);
    const img = {
      left: Math.max(0, view.x),
      top: Math.max(0, view.y),
      right: Math.min(w, view.x + width * view.k),
      bottom: Math.min(h, view.y + height * view.k),
    };
    const a = toScreen(view, grid.offset);
    const cell = grid.dpi * view.k;
    ctx.strokeStyle = ALIGN_GRID_COLOR;
    ctx.lineWidth = 1;
    if (step === 3) {
      drawGridLines(ctx, view, grid, img);
    } else {
      // A cell-shaped cross at the anchor; in step 2 a row of 4 cells along the ruler.
      const hs = handles();
      const dir = step === 2 && hs.size && hs.size.x < grid.offset.x ? -1 : 1;
      const n = step === 2 ? SIZE_CELLS : 1;
      ctx.beginPath();
      for (let i = step === 2 ? 0 : -1; i <= n; i++) {
        const x = a.x + dir * i * cell;
        ctx.moveTo(x, a.y - cell);
        ctx.lineTo(x, a.y + cell);
      }
      for (const dy of [-1, 0, 1]) {
        ctx.moveTo(step === 2 ? a.x : a.x - cell, a.y + dy * cell);
        ctx.lineTo(a.x + dir * n * cell, a.y + dy * cell);
      }
      ctx.stroke();
    }
    const hs = handles();
    for (const id of Object.keys(hs) as HandleId[]) {
      if (id === 'anchor' && step !== 1 && !(drag?.handle === 'anchor')) {
        drawHandle(ctx, a, false);
        continue;
      }
      drawHandle(ctx, toScreen(view, hs[id]!), drag?.handle === id);
    }

    // Loupe next to the pointer while a handle is dragged.
    if (drag && drag.handle !== 'pan') {
      const target = hs[drag.handle]!;
      const lk = view.k * LOUPE_ZOOM;
      const cx = Math.min(w - LOUPE_R - 8, Math.max(LOUPE_R + 8, drag.pointer.x - LOUPE_R - 30));
      const cy = Math.min(h - LOUPE_R - 8, Math.max(LOUPE_R + 8, drag.pointer.y - LOUPE_R - 30));
      const lv: View = { k: lk, x: cx - target.x * lk, y: cy - target.y * lk };
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#14151c';
      ctx.fillRect(cx - LOUPE_R, cy - LOUPE_R, LOUPE_R * 2, LOUPE_R * 2);
      ctx.imageSmoothingEnabled = false;
      if (image) ctx.drawImage(image, lv.x, lv.y, width * lk, height * lk);
      ctx.strokeStyle = ALIGN_GRID_COLOR;
      ctx.lineWidth = 1;
      drawGridLines(ctx, lv, grid, {
        left: cx - LOUPE_R,
        top: cy - LOUPE_R,
        right: cx + LOUPE_R,
        bottom: cy + LOUPE_R,
      });
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#a78bfa';
      ctx.stroke();
    }
  }, [image, width, height, grid, view, step, drag, handles]);

  const local = (e: React.PointerEvent): Vec2 => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hit = (p: Vec2): HandleId | null => {
    if (!view) return null;
    const hs = handles();
    // Later steps' handles win over the anchor.
    for (const id of ['far', 'size', 'anchor'] as HandleId[]) {
      const hp = hs[id];
      if (!hp) continue;
      const s = toScreen(view, hp);
      if (Math.hypot(s.x - p.x, s.y - p.y) <= HIT_PX) return id;
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    if (!view) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = local(e);
    let id = hit(p);
    if (!id && step === 1 && e.button === 0) {
      // Step 1: a press anywhere on the map moves the anchor there.
      set({ offset: toImage(view, p) });
      id = 'anchor';
      const start = toImage(view, p);
      setDrag({ handle: id, last: p, start, pos: start, pointer: p });
      return;
    }
    if (id) {
      const start = handles()[id]!;
      setDrag({
        handle: id,
        last: p,
        start,
        pos: start,
        pointer: p,
        cells: id === 'far' ? farCells(grid, width, height) : undefined,
      });
    } else {
      setDrag({ handle: 'pan', last: p, start: p, pos: p, view, pointer: p });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !view) return;
    const p = local(e);
    if (drag.handle === 'pan') {
      setView({ ...drag.view!, x: drag.view!.x + p.x - drag.start.x, y: drag.view!.y + p.y - drag.start.y });
      return;
    }
    const slow = e.ctrlKey || e.metaKey ? SLOW : 1;
    const pos = {
      x: drag.pos.x + ((p.x - drag.last.x) / view.k) * slow,
      y: drag.pos.y + ((p.y - drag.last.y) / view.k) * slow,
    };
    const delta = { x: pos.x - drag.start.x, y: pos.y - drag.start.y };
    const lock = e.shiftKey ? lockAxis(delta) : null;
    const moved = applyLock(delta, lock);
    const at = { x: drag.start.x + moved.x, y: drag.start.y + moved.y };
    if (drag.handle === 'anchor') set({ offset: at });
    else if (drag.handle === 'size') set({ dpi: dpiFromSize(grid.offset, at) });
    else {
      const c = drag.cells!;
      set({ dpi: dpiFromFar(grid.offset, at, c.nx, c.ny, lock) });
    }
    setDrag({ ...drag, last: p, pos, pointer: p });
  };

  const cols = width / grid.dpi;
  const rows = height / grid.dpi;
  const hint = step === 1 ? t.visualAlign.step1 : step === 2 ? t.visualAlign.step2 : t.visualAlign.step3;

  return createPortal(
    <div className="visual-align">
      <canvas
        ref={canvas}
        className={'visual-align-canvas' + (drag?.handle === 'pan' ? ' panning' : '')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      />
      <div className="panel visual-align-bar">
        <div className="visual-align-steps">
          {([1, 2, 3] as Step[]).map((s) => (
            <button
              key={s}
              type="button"
              className={'step' + (s === step ? ' active' : s < step ? ' done' : '')}
              onClick={() => setStep(s)}
            >
              {t.visualAlign.stepNames[s - 1]}
            </button>
          ))}
        </div>
        <p className="visual-align-hint">{hint}</p>
        <p className="muted">
          {t.visualAlign.values(grid.dpi, cols, rows)} · {t.visualAlign.keys}
        </p>
        <div className="row end">
          <button type="button" className="btn" onClick={cancel}>
            {t.common.cancel}
          </button>
          {step > 1 ? (
            <button type="button" className="btn" onClick={() => setStep((step - 1) as Step)}>
              {t.visualAlign.back}
            </button>
          ) : null}
          {step < 3 ? (
            <button type="button" className="btn primary" onClick={() => setStep((step + 1) as Step)}>
              {t.visualAlign.next}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => onClose(true)}>
              {t.visualAlign.done}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Button that opens the visual alignment over everything and edits `grid` live. */
export function VisualAlignButton({
  image,
  width,
  height,
  grid,
  onChange,
}: {
  image: ImageBitmap | undefined;
  width: number;
  height: number;
  grid: ImageGrid;
  onChange: (g: ImageGrid) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Crosshair size={16} /> {t.visualAlign.open}
      </button>
      {open ? (
        <VisualAlign
          image={image}
          width={width}
          height={height}
          grid={grid}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

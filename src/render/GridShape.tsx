import type Konva from 'konva';
import { Shape } from 'react-konva';
import { CELL } from '../core/constants';
import type { LineStyle } from '../core/types';

export interface GridLook {
  color: string;
  opacity: number;
  lineWidth: number; // screen px
  lineStyle: LineStyle;
}

function dashFor(style: LineStyle, w: number): number[] {
  if (style === 'dashed') return [w * 4, w * 3];
  if (style === 'dotted') return [0, w * 3];
  return [];
}

/**
 * Square grid drawn in screen space over the visible area only, so the line width does not
 * change with zoom. The viewport comes from the stage transform.
 */
function drawGrid(ctx: Konva.Context, shape: Konva.Shape) {
  const stage = shape.getStage();
  if (!stage) return;
  const look = shape.getAttr('look') as GridLook;
  const zoom = stage.scaleX();
  const cell = CELL * zoom;
  if (cell < 4) return; // denser than this is just noise
  const ox = stage.x();
  const oy = stage.y();
  const width = stage.width();
  const height = stage.height();
  const pr = ctx.getCanvas().getPixelRatio();
  const c = ctx._context;
  c.save();
  c.setTransform(pr, 0, 0, pr, 0, 0);
  c.globalAlpha = look.opacity;
  c.strokeStyle = look.color;
  c.lineWidth = look.lineWidth;
  c.lineCap = look.lineStyle === 'dotted' ? 'round' : 'butt';
  c.setLineDash(dashFor(look.lineStyle, look.lineWidth));
  // Lines start on a grid line above/left of the screen so dashes stay put while panning.
  const firstX = Math.floor(-ox / cell);
  const firstY = Math.floor(-oy / cell);
  const startX = firstX * cell + ox;
  const startY = firstY * cell + oy;
  c.beginPath();
  for (let x = startX; x <= width; x += cell) {
    if (x < 0) continue;
    c.moveTo(x, startY);
    c.lineTo(x, height);
  }
  for (let y = startY; y <= height; y += cell) {
    if (y < 0) continue;
    c.moveTo(startX, y);
    c.lineTo(width, y);
  }
  c.stroke();
  c.restore();
}

export function GridShape({ look }: { look: GridLook }) {
  return <Shape listening={false} perfectDrawEnabled={false} look={look} sceneFunc={drawGrid} />;
}

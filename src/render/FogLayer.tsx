import type Konva from 'konva';
import { Shape } from 'react-konva';
import type { FogShape } from '../core/types';

export interface FogLook {
  shapes: FogShape[];
  fill: boolean; // endless fog over the whole scene
  color: string;
  opacity: number; // translucent for the GM, 1 for players
}

/** Path of one fog shape in world units (rect and ellipse store [x, y, w, h]). */
export function traceFogShape(c: CanvasRenderingContext2D, s: FogShape): void {
  c.save();
  c.translate(s.position.x, s.position.y);
  c.rotate((s.rotation * Math.PI) / 180);
  c.scale(s.scale.x, s.scale.y);
  const p = s.points;
  c.beginPath();
  if (s.shape === 'rect') {
    c.rect(p[0], p[1], p[2], p[3]);
  } else if (s.shape === 'ellipse') {
    c.ellipse(p[0] + p[2] / 2, p[1] + p[3] / 2, Math.abs(p[2] / 2), Math.abs(p[3] / 2), 0, 0, Math.PI * 2);
  } else if (p.length >= 4) {
    c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.closePath();
  }
  c.restore();
}

const offscreens = new WeakMap<Konva.Shape, HTMLCanvasElement>();

/**
 * Fog = (fill ∪ uncut shapes) − cut shapes, painted at full strength on an offscreen canvas
 * and then copied onto the layer with the viewer's opacity.
 */
function drawFog(ctx: Konva.Context, shape: Konva.Shape) {
  const stage = shape.getStage();
  const look = shape.getAttr('look') as FogLook;
  if (!stage || (!look.fill && !look.shapes.some((s) => !s.cut))) return;
  const pr = ctx.getCanvas().getPixelRatio();
  const width = Math.ceil(stage.width() * pr);
  const height = Math.ceil(stage.height() * pr);
  let off = offscreens.get(shape);
  if (!off) {
    off = document.createElement('canvas');
    offscreens.set(shape, off);
  }
  if (off.width !== width || off.height !== height) {
    off.width = width;
    off.height = height;
  }
  const o = off.getContext('2d')!;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.clearRect(0, 0, width, height);
  o.fillStyle = look.color;
  if (look.fill) {
    o.fillRect(0, 0, width, height);
  }
  const z = stage.scaleX();
  o.setTransform(pr * z, 0, 0, pr * z, pr * stage.x(), pr * stage.y());
  for (const s of look.shapes) {
    if (s.cut) continue;
    traceFogShape(o, s);
    o.fill();
  }
  o.globalCompositeOperation = 'destination-out';
  for (const s of look.shapes) {
    if (!s.cut) continue;
    traceFogShape(o, s);
    o.fill();
  }
  const c = ctx._context;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = look.opacity;
  c.drawImage(off, 0, 0);
  c.restore();
}

export function FogLayerShape({ look }: { look: FogLook }) {
  return <Shape listening={false} perfectDrawEnabled={false} look={look} sceneFunc={drawFog} />;
}

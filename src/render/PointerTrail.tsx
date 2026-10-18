import Konva from 'konva';
import { useEffect, useRef } from 'react';
import { Shape } from 'react-konva';
import { ACCENT } from '../core/constants';

const TRAIL_MS = 500;
const FADE_MS = 1000;

interface Sample {
  x: number;
  y: number;
  t: number;
}

/** Laser pointer positions with timestamps; drawn as a dot with a short fading trail. */
export class PointerTrail {
  samples: Sample[] = [];
  releasedAt: number | null = null;
  private listeners = new Set<() => void>();

  push(x: number, y: number, t = performance.now()): void {
    this.samples.push({ x, y, t });
    this.releasedAt = null;
    this.prune(t);
    this.notify();
  }

  release(t = performance.now()): void {
    if (this.samples.length === 0) return;
    this.releasedAt = t;
    this.notify();
  }

  clear(): void {
    this.samples = [];
    this.releasedAt = null;
    this.notify();
  }

  private prune(now: number) {
    while (this.samples.length > 2 && now - this.samples[0].t > TRAIL_MS) this.samples.shift();
  }

  visible(now: number): boolean {
    if (this.samples.length === 0) return false;
    return this.releasedAt === null || now - this.releasedAt < FADE_MS;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const cb of this.listeners) cb();
  }
}

function draw(trail: PointerTrail) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    const now = performance.now();
    if (!trail.visible(now)) return;
    const zoom = shape.getStage()?.scaleX() ?? 1;
    const k = 1 / zoom;
    const fade = trail.releasedAt === null ? 1 : Math.max(0, 1 - (now - trail.releasedAt) / FADE_MS);
    const c = ctx._context;
    const s = trail.samples;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = ACCENT;
    for (let i = 1; i < s.length; i++) {
      const age = now - s[i].t;
      if (age > TRAIL_MS) continue;
      const a = (1 - age / TRAIL_MS) * fade;
      c.globalAlpha = a * 0.8;
      c.lineWidth = (3 + 7 * a) * k;
      c.beginPath();
      c.moveTo(s[i - 1].x, s[i - 1].y);
      c.lineTo(s[i].x, s[i].y);
      c.stroke();
    }
    const head = s[s.length - 1];
    c.globalAlpha = fade;
    c.shadowColor = ACCENT;
    c.shadowBlur = 16;
    c.fillStyle = ACCENT;
    c.beginPath();
    c.arc(head.x, head.y, 9 * k, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(head.x, head.y, 3.5 * k, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
}

/** Animates while the pointer is shown; idle otherwise. */
export function PointerTrailShape({ trail }: { trail: PointerTrail }) {
  const ref = useRef<Konva.Shape>(null);
  useEffect(() => {
    let anim: Konva.Animation | null = null;
    const start = () => {
      const layer = ref.current?.getLayer();
      if (!layer || anim) return;
      anim = new Konva.Animation(() => {
        if (!trail.visible(performance.now())) {
          anim?.stop();
          anim = null;
          layer.batchDraw();
          return false;
        }
        return true;
      }, layer);
      anim.start();
    };
    const off = trail.onChange(start);
    return () => {
      off();
      anim?.stop();
    };
  }, [trail]);
  return <Shape ref={ref} listening={false} perfectDrawEnabled={false} sceneFunc={draw(trail)} />;
}

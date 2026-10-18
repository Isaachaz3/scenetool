import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { ACCENT, FONT_FAMILIES } from '../core/constants';
import { labelAngle } from '../core/measure';
import type { MeasureView } from '../core/types';
import { textWidth } from './textMeasure';

const FONT = 18;
const PAD = 7;

/**
 * Dashed ruler with a distance plaque at the middle of its last segment, turned along the line
 * but never upside down. Sizes are in screen pixels whatever the zoom.
 */
export function MeasureShape({ measure, zoom }: { measure: MeasureView; zoom: number }) {
  const pts = measure.points;
  if (pts.length < 2) return null;
  const k = 1 / zoom;
  const flat = pts.flatMap((p) => [p.x, p.y]);
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const w = textWidth(measure.label, FONT) + PAD * 2;
  const h = FONT + PAD * 2;
  return (
    <Group listening={false}>
      <Line points={flat} stroke="rgba(0,0,0,0.55)" strokeWidth={7 * k} lineCap="round" lineJoin="round" />
      <Line
        points={flat}
        stroke="#ffffff"
        strokeWidth={3 * k}
        dash={[12 * k, 9 * k]}
        lineCap="round"
        lineJoin="round"
      />
      {pts.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={4 * k} fill={ACCENT} stroke="#fff" strokeWidth={1.5 * k} />
      ))}
      <Group x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} rotation={labelAngle(a, b)} scaleX={k} scaleY={k}>
        <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(20,20,28,0.92)" cornerRadius={8} />
        <Text
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          text={measure.label}
          align="center"
          verticalAlign="middle"
          fontSize={FONT}
          fontStyle="bold"
          fontFamily={FONT_FAMILIES.sans}
          fill="#ffffff"
        />
      </Group>
    </Group>
  );
}

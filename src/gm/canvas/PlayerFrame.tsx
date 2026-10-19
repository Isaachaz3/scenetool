import { Group, Rect, Text } from 'react-konva';
import { ACCENT, FONT_FAMILIES } from '../../core/constants';
import { playerFrameRect } from '../../core/viewport';
import { t } from '../../i18n/ru';
import { activeScene, useGm } from '../../state/store';
import { useUi } from '../../state/ui';

export const FRAME_NAME = 'player-frame';
export const FRAME_CORNER_NAME = 'player-frame-corner';
const CORNER = 10; // screen px

/**
 * What the player screen shows, as a dashed frame on the GM canvas. Dragging the border moves
 * the player view, a corner zooms it (input.ts handles both).
 */
export function PlayerFrame({ zoom }: { zoom: number }) {
  const screen = useUi((s) => s.player.screen);
  const linked = useUi((s) => s.player.links > 0);
  const view = useGm((s) => activeScene(s)?.playerViewport);
  const ref = useGm((s) => activeScene(s)?.playerViewRef);
  const preview = useUi((s) => s.preview);
  if (!screen || !linked || !view || preview) return null;
  const r = playerFrameRect(view, ref, screen);
  const k = 1 / zoom;
  const c = CORNER * k;
  const corners = [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ];
  return (
    <Group>
      <Rect
        name={FRAME_NAME}
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        stroke={ACCENT}
        strokeWidth={2 * k}
        dash={[10 * k, 8 * k]}
        hitStrokeWidth={14 * k}
        fillEnabled={false}
      />
      <Text
        x={r.x + 8 * k}
        y={r.y + 6 * k}
        text={t.playerFrame.label}
        fontSize={13 * k}
        fontFamily={FONT_FAMILIES.sans}
        fontStyle="bold"
        fill={ACCENT}
        listening={false}
      />
      {corners.map(([x, y], i) => (
        <Rect
          key={i}
          name={FRAME_CORNER_NAME}
          x={x - c / 2}
          y={y - c / 2}
          width={c}
          height={c}
          fill="#ffffff"
          stroke={ACCENT}
          strokeWidth={2 * k}
          hitStrokeWidth={8 * k}
        />
      ))}
    </Group>
  );
}

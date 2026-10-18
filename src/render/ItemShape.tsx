import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Image as KImage, Label, Tag, Text } from 'react-konva';
import { CELL, FONT_FAMILIES, TEXT_BACKGROUND } from '../core/constants';
import { imageScale } from '../core/geometry';
import type { DiscToken, ImageItem, Item, TextItem, Vec2 } from '../core/types';

export interface ImageSource {
  image?: CanvasImageSource;
  width: number;
  height: number;
}

interface CommonProps {
  position?: Vec2; // live override while dragging
  opacity?: number;
  listening?: boolean;
  nodeRef?: (node: Konva.Node | null) => void;
  /** Draw a placeholder where an image is still loading (GM only). */
  placeholder?: boolean;
  hiddenFor?: boolean; // text being edited in place
}

function ImageNode({
  item,
  source,
  position,
  opacity,
  listening,
  nodeRef,
  placeholder,
}: CommonProps & { item: ImageItem; source?: ImageSource }) {
  if (!source) return null;
  const s = imageScale(item.grid, item.scale);
  const p = position ?? item.position;
  // One node whether or not the image is decoded yet, so refs and the transformer stay valid;
  // while loading the GM sees a grey footprint.
  return (
    <KImage
      ref={nodeRef}
      id={item.id}
      name="item"
      image={source.image}
      fill={!source.image && placeholder ? 'rgba(58, 59, 74, 0.6)' : undefined}
      x={p.x}
      y={p.y}
      width={source.width}
      height={source.height}
      offsetX={item.grid.offset.x}
      offsetY={item.grid.offset.y}
      scaleX={s.x}
      scaleY={s.y}
      rotation={item.rotation}
      opacity={opacity}
      listening={listening}
      perfectDrawEnabled={false}
    />
  );
}

function contrastText(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return '#111';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#111111' : '#ffffff';
}

function DiscNode({ item, position, opacity, listening, nodeRef }: CommonProps & { item: DiscToken }) {
  const p = position ?? item.position;
  const r = (item.sizeCells * CELL) / 2;
  const inner = r * 0.9;
  const fontSize = item.text.length <= 2 ? inner * 1.0 : inner * (2.2 / item.text.length);
  return (
    <Group
      ref={nodeRef}
      id={item.id}
      name="item"
      x={p.x}
      y={p.y}
      rotation={item.rotation}
      opacity={opacity}
      listening={listening}
    >
      <Circle
        radius={inner}
        fill={item.color}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={inner * 0.08}
        perfectDrawEnabled={false}
      />
      <Text
        text={item.text}
        width={inner * 2}
        height={inner * 2}
        offsetX={inner}
        offsetY={inner}
        align="center"
        verticalAlign="middle"
        fontStyle="bold"
        fontFamily={FONT_FAMILIES.sans}
        fontSize={fontSize}
        fill={contrastText(item.color)}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

function TextNode({
  item,
  position,
  opacity,
  listening,
  nodeRef,
  hiddenFor,
}: CommonProps & { item: TextItem }) {
  const p = position ?? item.position;
  const st = item.style;
  const pad = st.background ? st.fontSize * 0.3 : 0;
  return (
    <Label
      ref={nodeRef}
      id={item.id}
      name="item"
      x={p.x}
      y={p.y}
      rotation={item.rotation}
      scaleX={item.scale.x}
      scaleY={item.scale.y}
      opacity={hiddenFor ? 0 : opacity}
      listening={listening}
    >
      {st.background ? (
        <Tag
          fill={st.background === 'dark' ? TEXT_BACKGROUND : st.background}
          cornerRadius={st.fontSize * 0.2}
        />
      ) : null}
      <Text
        text={item.text}
        fontFamily={FONT_FAMILIES[st.fontFamily]}
        fontSize={st.fontSize}
        fontStyle={st.bold ? 'bold' : 'normal'}
        fill={st.color}
        align={st.align}
        lineHeight={1.2}
        padding={pad}
        perfectDrawEnabled={false}
        shadowColor={st.background ? undefined : 'rgba(0,0,0,0.7)'}
        shadowBlur={st.background ? 0 : st.fontSize * 0.12}
        shadowEnabled={!st.background}
      />
    </Label>
  );
}

export interface ItemShapeProps extends CommonProps {
  item: Item;
  source?: ImageSource;
}

/** One scene item, drawn the same way in the GM and player windows. */
export const ItemShape = memo(function ItemShape(props: ItemShapeProps) {
  const { item } = props;
  switch (item.kind) {
    case 'image':
      return <ImageNode {...props} item={item} />;
    case 'disc':
      return <DiscNode {...props} item={item} />;
    case 'text':
      return <TextNode {...props} item={item} />;
    default:
      return null; // drawings, fog and rulers arrive in stage 2
  }
});

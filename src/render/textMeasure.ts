import { FONT_FAMILIES } from '../core/constants';

let ctx: CanvasRenderingContext2D | null = null;

/** Width of a single line of canvas text, for centering labels. */
export function textWidth(text: string, fontSize: number, bold = true, family = FONT_FAMILIES.sans): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${family}`;
  return ctx.measureText(text).width;
}

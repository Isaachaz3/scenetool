/** Ramer–Douglas–Peucker on a flat [x0, y0, x1, y1, …] polyline. */
export function simplify(points: number[], epsilon: number): number[] {
  const n = points.length / 2;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a * 2];
    const ay = points[a * 2 + 1];
    const bx = points[b * 2];
    const by = points[b * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i * 2];
      const py = points[i * 2 + 1];
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  return out;
}

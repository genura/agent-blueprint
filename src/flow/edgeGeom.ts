// Baglanti geometrisi: uygulama (FlowEdge) ve dogrulayici (FLOW_GUIDE.mjs) ayni hesabi kullanir.
import { Position, getBezierPath, getSmoothStepPath } from '@xyflow/system';
import type { EdgeKind, Side } from './format';

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };
export type EdgeShape = { kind: EdgeKind; bend?: [number, number] };

export const POS: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
export const NORMAL: Record<Side, [number, number]> = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] };

export const makeBox = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
export const pointBox = (p: Pt): Box => makeBox(p.x, p.y, 0, 0);

// Kenar verilmemisse: aradaki bosluk hangi eksende buyukse o eksenin kenarlari secilir
export function autoSides(a: Box, b: Box): [Side, Side] {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const gapX = Math.abs(dx) - (a.w + b.w) / 2;
  const gapY = Math.abs(dy) - (a.h + b.h) / 2;
  if (gapX > gapY) return dx > 0 ? ['r', 'l'] : ['l', 'r'];
  return dy > 0 ? ['b', 't'] : ['t', 'b'];
}

export function anchor(b: Box, s: Side): Pt {
  if (s === 't') return { x: b.cx, y: b.y };
  if (s === 'b') return { x: b.cx, y: b.y + b.h };
  if (s === 'l') return { x: b.x, y: b.cy };
  return { x: b.x + b.w, y: b.cy };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// SVG yolu ve etiketin (orta noktanin) konumu
export function buildPath(d: EdgeShape, p1: Pt, ss: Side, p2: Pt, ts: Side): [string, number, number] {
  const params = { sourceX: p1.x, sourceY: p1.y, sourcePosition: POS[ss], targetX: p2.x, targetY: p2.y, targetPosition: POS[ts] };
  const bend = d.bend ?? [0, 0];
  const bent = bend[0] !== 0 || bend[1] !== 0;
  const mid = { x: (p1.x + p2.x) / 2 + bend[0], y: (p1.y + p2.y) / 2 + bend[1] };
  if (d.kind === 'step') {
    const [path] = getSmoothStepPath({ ...params, borderRadius: 16, offset: 24, centerX: mid.x, centerY: mid.y });
    return [path, mid.x, mid.y];
  }
  if (d.kind === 'line') return [`M${p1.x},${p1.y} L${mid.x},${mid.y} L${p2.x},${p2.y}`, mid.x, mid.y];
  if (!bent) {
    const [path, lx, ly] = getBezierPath({ ...params, curvature: 0.35 });
    return [path, lx, ly];
  }
  // Bukulmus egri: orta noktadan gecen iki kubik parca
  let tx = (p2.x - p1.x) * 0.25;
  let ty = (p2.y - p1.y) * 0.25;
  if (Math.hypot(tx, ty) < 10) [tx, ty] = [30, 0];
  const k1 = Math.max(30, dist(p1, mid) * 0.5);
  const k2 = Math.max(30, dist(mid, p2) * 0.5);
  const [n1x, n1y] = NORMAL[ss];
  const [n2x, n2y] = NORMAL[ts];
  const path =
    `M${p1.x},${p1.y} C${p1.x + n1x * k1},${p1.y + n1y * k1} ${mid.x - tx},${mid.y - ty} ${mid.x},${mid.y}` +
    ` C${mid.x + tx},${mid.y + ty} ${p2.x + n2x * k2},${p2.y + n2y * k2} ${p2.x},${p2.y}`;
  return [path, mid.x, mid.y];
}

// Yolu noktalara cevirir (M L Q C, mutlak koordinat); dogrulayici kesisme/icinden gecme icin kullanir
export function samplePath(d: string, perSeg = 16): Pt[] {
  const tok = d.match(/[MLQC]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0, cmd = '', cur: Pt = { x: 0, y: 0 };
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[MLQC]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M' || cmd === 'L') {
      cur = { x: num(), y: num() };
      pts.push(cur);
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() }, e = { x: num(), y: num() }, s = cur;
      for (let k = 1; k <= perSeg; k++) {
        const t = k / perSeg, u = 1 - t;
        pts.push({ x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y });
      }
      cur = e;
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() }, c2 = { x: num(), y: num() }, e = { x: num(), y: num() }, s = cur;
      for (let k = 1; k <= perSeg; k++) {
        const t = k / perSeg, u = 1 - t;
        pts.push({
          x: u * u * u * s.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
          y: u * u * u * s.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
        });
      }
      cur = e;
    } else i++;
  }
  return pts;
}

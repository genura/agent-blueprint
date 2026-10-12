import type { ConnectionLineComponentProps } from '@xyflow/react';
import { nodeColors } from '../flow/format';
import type { Side } from '../flow/format';
import { NORMAL, buildPath } from '../flow/edgeGeom';
import { CAP_GEOM, edgeCaps } from '../flow/caps';
import { useFlow } from '../flow/store';
import type { ShapeNode } from '../flow/store';

const SIDE: Record<string, Side> = { top: 't', right: 'r', bottom: 'b', left: 'l' };

// FigJam: baglanti cizilirken kalin, kesikli ve kaynak nesnenin kenar renginde (silik degil).
// Sekil, secili baglanti turunu izler (Tab ile degisir): koseli / kavisli / duz ok / duz cizgi.
export function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition, fromNode }: ConnectionLineComponentProps<ShapeNode>) {
  const style = useFlow((s) => s.edgeStyle);
  const { kind } = style;
  const cap = edgeCaps(style)[1];
  const d = fromNode.data;
  const c = nodeColors(d.color, d.shape, d.stroke).stroke;
  const color = c === 'transparent' ? '#4C9AFF' : c;
  const ts = SIDE[toPosition] ?? 'l';
  const [path] = buildPath({ kind }, { x: fromX, y: fromY }, SIDE[fromPosition] ?? 'r', { x: toX, y: toY }, ts);
  // Ok ucu: duz cizgide gidis yonunde, digerlerinde hedef kenara dik gelecek yonde
  let head = null;
  if (cap) {
    const [nx, ny] = NORMAL[ts];
    const [vx, vy] = kind === 'line' ? [toX - fromX, toY - fromY] : [-nx, -ny];
    const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    head = <path d={CAP_GEOM[cap].d} transform={`translate(${toX} ${toY}) rotate(${deg}) scale(1.25)`} fill={CAP_GEOM[cap].fill ? color : 'none'} stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" />
      {head}
    </g>
  );
}

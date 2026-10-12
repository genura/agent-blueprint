import { nodeColors } from '../flow/format';
import type { Shape } from '../flow/format';

// Yerlestirme ve hizli ekleme onizlemesi: seklin yari saydam taslagi
export function ShapeGhost({ shape, color, stroke: strokeCode, w, h }: { shape: Shape; color: string; stroke?: string; w: number; h: number }) {
  const c = nodeColors(color, shape, strokeCode);
  const fill = c.fill === 'transparent' ? '#ffffff' : c.fill;
  const stroke = shape === 'text' || c.stroke === 'transparent' ? '#4C9AFF' : c.stroke;
  const sw = 2;
  const common = { fill, stroke, strokeWidth: sw };
  let el;
  if (shape === 'circle') el = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - sw} ry={h / 2 - sw} {...common} />;
  else if (shape === 'diamond') el = <polygon points={`${w / 2},${sw} ${w - sw},${h / 2} ${w / 2},${h - sw} ${sw},${h / 2}`} {...common} />;
  else if (shape === 'db') {
    const ry = Math.min(h * 0.18, 18);
    el = (
      <>
        <path d={`M${sw},${sw + ry} L${sw},${h - sw - ry} A${w / 2 - sw},${ry} 0 0 0 ${w - sw},${h - sw - ry} L${w - sw},${sw + ry}`} {...common} />
        <ellipse cx={w / 2} cy={sw + ry} rx={w / 2 - sw} ry={ry} {...common} />
      </>
    );
  } else if (shape === 'text') {
    el = (
      <>
        <rect x={1} y={1} width={w - 2} height={h - 2} fill="none" stroke={stroke} strokeDasharray="4 4" />
        <text x={8} y={h / 2 + 6} fontSize={16} fill="#1e1e1e">Yazi</text>
      </>
    );
  } else {
    const rx = shape === 'pill' ? h / 2 : shape === 'round' ? Math.min(w, h) * 0.3 : shape === 'group' ? 8 : 4;
    el = <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} rx={rx} {...common}
      strokeDasharray={shape === 'group' ? '6 6' : undefined} />;
  }
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', opacity: 0.45, display: 'block' }}>
      {el}
    </svg>
  );
}

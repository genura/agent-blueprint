// Gercek vektor SVG: sekiller, oklar ve yazilar SVG ogeleri (foreignObject yok), Figma/Illustrator/Inkscape acar.
// Geometri ve yazi satirlari ekrandaki DOM'dan okunur, boylece gorunum birebir ayni olur.
import { DASH, NODE_STROKE, nodeColors } from './format';
import { useFlow } from './store';
import { capSvg, edgeCaps } from './caps';
import type { ShapeData } from './store';

type Box = { x: number; y: number; w: number; h: number };
export type Frame = { fx: (sx: number) => number; fy: (sy: number) => number; z: number };

const num = (n: number) => Math.round(n * 100) / 100;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const boxOf = (el: Element, f: Frame): Box => {
  const r = el.getBoundingClientRect();
  return { x: f.fx(r.left), y: f.fy(r.top), w: r.width / f.z, h: r.height / f.z };
};

// ---- Sekil ----
function shapeSvg(shape: string, b: Box, d: ShapeData): string {
  const c = nodeColors(d.color, shape as ShapeData['shape'], d.stroke);
  const sw0 = NODE_STROKE[d.weight ?? 2];
  const dash = d.dash ? ` stroke-dasharray="${DASH}"` : '';
  const paint = (sw: number) => `fill="${c.fill}" stroke="${sw > 0 ? c.stroke : 'none'}" stroke-width="${sw}"${dash} stroke-linejoin="round"`;
  const T = `translate(${num(b.x)} ${num(b.y)})`;
  if (shape === 'text') return '';
  if (shape === 'circle' || shape === 'diamond' || shape === 'db') {
    const sw = Math.max(sw0, 1.5), { w, h } = b;
    let g = '';
    if (shape === 'circle') g = `<ellipse cx="${num(w / 2)}" cy="${num(h / 2)}" rx="${num(w / 2 - sw)}" ry="${num(h / 2 - sw)}" ${paint(sw0)}/>`;
    else if (shape === 'diamond')
      g = `<polygon points="${num(w / 2)},${sw} ${num(w - sw)},${num(h / 2)} ${num(w / 2)},${num(h - sw)} ${sw},${num(h / 2)}" ${paint(sw0)}/>`;
    else {
      const ry = Math.min(h * 0.18, 18), x0 = sw, x1 = w - sw, y0 = sw + ry, y1 = h - sw - ry, rx = (w - 2 * sw) / 2;
      g = `<path d="M${x0},${num(y0)} L${x0},${num(y1)} A${num(rx)},${num(ry)} 0 0 0 ${num(x1)},${num(y1)} L${num(x1)},${num(y0)}" ${paint(sw0)}/>` +
        `<ellipse cx="${num(w / 2)}" cy="${num(y0)}" rx="${num(rx)}" ry="${num(ry)}" ${paint(sw0)}/>`;
    }
    return `<g transform="${T}">${g}</g>`;
  }
  // rect / round / pill / group / table: kenarlik kutunun icinde, cizgi ortalanir
  let sw = sw0, stroke = c.stroke, rx = shape === 'pill' ? b.h / 2 : shape === 'round' ? Math.min(b.w, b.h) * 0.3 : 4;
  if (shape === 'group') { sw = d.weight === undefined ? 1 : sw0; stroke = d.weight === undefined ? '#e3e3e3' : c.stroke; }
  if (shape === 'table') { sw = NODE_STROKE[d.weight ?? 1]; }
  const p = `fill="${c.fill}" stroke="${sw > 0 ? stroke : 'none'}" stroke-width="${sw}"${dash} stroke-linejoin="round"`;
  return `<rect x="${num(b.x + sw / 2)}" y="${num(b.y + sw / 2)}" width="${num(b.w - sw)}" height="${num(b.h - sw)}" rx="${num(rx)}" ${p}/>`;
}

// ---- Yazi: DOM'daki her satiri ayri <text> olarak yazar ----
let ctx: CanvasRenderingContext2D | null = null;
const ascent = (font: string) => {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText('Hg').fontBoundingBoxAscent;
};

function textSvg(root: Element, f: Frame): string {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let tn = walker.nextNode() as Text | null; tn; tn = walker.nextNode() as Text | null) {
    const el = tn.parentElement;
    if (!el || el.closest('button, textarea, input, .react-flow__handle')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    const str = tn.data;
    const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const asc = ascent(font); // font px zaten sema birimi (zoom donusumu sadece kutulara uygulanir)
    // Karakterleri satirlara bol (ayni ust koordinat = ayni satir)
    type Line = { text: string; left: number; right: number; top: number };
    const lines: Line[] = [];
    for (let i = 0; i < str.length; i++) {
      range.setStart(tn, i);
      range.setEnd(tn, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) continue; // sarilma noktasindaki gorunmez bosluk
      const top = f.fy(r.top);
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - top) < 2) {
        last.text += str[i];
        last.right = f.fx(r.right);
      } else lines.push({ text: str[i], left: f.fx(r.left), right: f.fx(r.right), top });
    }
    const family = s.fontFamily.replace(/"/g, "'");
    const deco = s.textDecorationLine.includes('line-through') ? ' text-decoration="line-through"' : '';
    for (const l of lines) {
      const t = l.text.replace(/\s+$/, '');
      if (!t.trim()) continue;
      out.push(
        `<text x="${num(l.left)}" y="${num(l.top + asc)}" font-family="${esc(family)}" font-size="${num(parseFloat(s.fontSize))}" ` +
        `font-weight="${s.fontWeight}" fill="${s.color}"${deco} xml:space="preserve">${esc(t)}</text>`,
      );
    }
  }
  return out.join('');
}

// Liste maddesi isareti (CSS ::before oldugu icin DOM'da metin yok)
function bulletSvg(root: Element, f: Frame): string {
  let out = '';
  root.querySelectorAll<HTMLElement>('.li').forEach((li) => {
    const s = getComputedStyle(li);
    const fs = parseFloat(s.fontSize);
    const b = boxOf(li, f);
    const lh = parseFloat(s.lineHeight) || fs * 1.45;
    const family = s.fontFamily.replace(/"/g, "'");
    out += `<text x="${num(b.x + fs * 0.2)}" y="${num(b.y + (lh + fs * 0.7) / 2 - fs * 0.1)}" font-family="${esc(family)}" font-size="${num(fs)}" fill="${s.color}">•</text>`;
  });
  return out;
}

function nodeSvg(el: HTMLElement, d: ShapeData, f: Frame): string {
  const b = boxOf(el, f);
  let g = shapeSvg(d.shape, b, d);
  if (d.shape === 'table') {
    el.querySelectorAll('.cell').forEach((cell) => {
      const cb = boxOf(cell, f);
      const x = cb.x + cb.w, y = cb.y + cb.h;
      // Hucre cizgileri: sag ve alt kenar (tablonun kendi kenarligi ustte cizildi)
      g += `<path d="M${num(x - 0.5)},${num(cb.y)} L${num(x - 0.5)},${num(y)} M${num(cb.x)},${num(y - 0.5)} L${num(x)},${num(y - 0.5)}" stroke="#d9d9d9" stroke-width="1" fill="none"/>`;
    });
    const c = nodeColors(d.color, 'table', d.stroke);
    const sw = NODE_STROKE[d.weight ?? 1];
    g += `<rect x="${num(b.x + sw / 2)}" y="${num(b.y + sw / 2)}" width="${num(b.w - sw)}" height="${num(b.h - sw)}" rx="4" fill="none" stroke="${sw > 0 ? c.stroke : 'none'}" stroke-width="${sw}"${d.dash ? ` stroke-dasharray="${DASH}"` : ''}/>`;
  }
  if (d.shape === 'group') {
    const t = el.querySelector('.group-title');
    if (t) {
      const tb = boxOf(t, f);
      g += `<rect x="${num(tb.x)}" y="${num(tb.y)}" width="${num(tb.w)}" height="${num(tb.h)}" rx="6" fill="#e6e6e6"/>`;
    }
  }
  return `<g id="${esc(el.dataset.id ?? '')}">${g}${bulletSvg(el, f)}${textSvg(el, f)}</g>`;
}

// ---- Baglanti: yol + el ile cizilen ok ucu ----
function edgeSvg(el: SVGGElement): string {
  const path = el.querySelector<SVGPathElement>('.react-flow__edge-path');
  if (!path) return '';
  const s = getComputedStyle(path);
  const dash = s.strokeDasharray && s.strokeDasharray !== 'none' ? ` stroke-dasharray="${s.strokeDasharray.replace(/px/g, '')}"` : '';
  const sw = parseFloat(s.strokeWidth);
  let g = `<path d="${esc(path.getAttribute('d') ?? '')}" fill="none" stroke="${s.stroke}" stroke-width="${sw}"${dash} stroke-linecap="round"/>`;
  // Uclar (baslangic ve bitis): yolun ucundaki yone gore dondurulur
  const data = useFlow.getState().edges.find((e) => e.id === el.dataset.id)?.data;
  const [capS, capE] = data ? edgeCaps(data) : [undefined, undefined];
  const L = path.getTotalLength();
  const tip = (at: number, from: number, cap: typeof capS) => {
    if (!cap) return;
    const a = path.getPointAtLength(at), b = path.getPointAtLength(from);
    g += capSvg(cap, a.x, a.y, (Math.atan2(a.y - b.y, a.x - b.x) * 180) / Math.PI, s.stroke);
  };
  tip(0, Math.min(L, 1), capS);
  tip(L, Math.max(0, L - 1), capE);
  return `<g id="edge-${esc(el.dataset.id ?? '')}">${g}</g>`;
}

function labelSvg(el: HTMLElement, f: Frame): string {
  const s = getComputedStyle(el);
  const b = boxOf(el, f);
  const bw = parseFloat(s.borderTopWidth) || 0;
  const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : 'none';
  const rect = `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="${num(parseFloat(s.borderTopLeftRadius) || 0)}" fill="${bg}"` +
    (bw ? ` stroke="${s.borderTopColor}" stroke-width="${bw}"` : '') + '/>';
  return `<g>${rect}${textSvg(el, f)}</g>`;
}

export function buildSvg(
  viewport: HTMLElement, ids: { nodes: Set<string>; edges: Set<string> }, f: Frame,
  area: { x1: number; y1: number; width: number; height: number; pad: number },
  fontCss = '',
): string {
  const nodes = useFlow.getState().nodes;
  const data = new Map(nodes.map((n) => [n.id, n.data]));
  const nodeEls = [...viewport.querySelectorAll<HTMLElement>('.react-flow__node')].filter((e) => ids.nodes.has(e.dataset.id ?? '') && data.has(e.dataset.id ?? '') && !data.get(e.dataset.id ?? '')?.pt);
  const below = nodeEls.filter((e) => Number(getComputedStyle(e).zIndex) < 0); // ust duzey gruplar baglantilarin altinda
  const above = nodeEls.filter((e) => !below.includes(e));
  const edges = [...viewport.querySelectorAll<SVGGElement>('.react-flow__edge')].filter((e) => ids.edges.has(e.dataset.id ?? ''));
  const labels = [...viewport.querySelectorAll<HTMLElement>('.edge-label')].filter((e) => ids.edges.has(e.dataset.edge ?? ''));
  const draw = (e: HTMLElement) => nodeSvg(e, data.get(e.dataset.id!)!, f);
  // Cizim sirasi uygulamayla ayni: ust duzey gruplar, alttaki baglantilar, nesneler, "ustte" isaretli baglantilar, etiketler
  const top = new Set(useFlow.getState().edges.filter((e) => e.data?.top).map((e) => e.id));
  const isTop = (e: SVGGElement) => top.has(e.dataset.id ?? '');
  const body = below.map(draw).join('') + edges.filter((e) => !isTop(e)).map((e) => edgeSvg(e)).join('') + above.map(draw).join('') +
    edges.filter(isTop).map((e) => edgeSvg(e)).join('') + labels.map((e) => labelSvg(e, f)).join('');
  const { x1, y1, width, height, pad } = area;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `${fontCss ? `<defs><style>${fontCss}</style></defs>
` : ''}<rect width="${width}" height="${height}" fill="#FFFFFF"/>\n<g transform="translate(${num(pad - x1)} ${num(pad - y1)})">${body}</g>\n</svg>\n`;
}

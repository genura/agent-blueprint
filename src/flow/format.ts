// .flow formati: agent icin maksimum token tasarruflu, satir bazli sema dosyasi.
// Stil uygulamanin icinde sabit; dosyada sadece degisen bilgi durur.
//
// Node:  id[@grup] sekil[.bicim] renk x y w h metin
//   bicim (istege bagli, sirasiz): boyut s m l x, hiza < ^ >, kenarlik 0-3, ~ kesikli, font G M O W, =renk kenar rengi
//   metin: markdown (**kalin** ~~cizili~~ "- " liste), \n yeni satir; tabloda hucreler a|b\nc|d
// Edge:  kaynak>hedef[/secenek] etiket
//   secenek (sirasiz): renk, | (koseli) ya da _ (duz), - (oksuz), 1-3 kalinlik, ~ kesikli,
//   :XY (kenarlar t r b l *), @dx,dy (bukum)

export const SHAPES = ['rect', 'round', 'pill', 'circle', 'diamond', 'db', 'text', 'group', 'table'] as const;
export type Shape = (typeof SHAPES)[number];

export type Side = 't' | 'r' | 'b' | 'l';
export type Size = 's' | 'm' | 'l' | 'x';
export type Align = 'l' | 'c' | 'r';
export type EdgeKind = 'curve' | 'step' | 'line';
// Baglanti ucu (FigJam): a = cizgi ok, t = dolu ucgen, d = dolu baklava, c = dolu daire. Uc yok = alan bos.
export type Cap = 'a' | 't' | 'd' | 'c';
export const CAPS: Cap[] = ['a', 't', 'd', 'c'];
export const CAP_NAMES: Record<Cap | 'n', string> = { n: 'Yok', a: 'Cizgi ok', t: 'Ucgen ok', d: 'Baklava', c: 'Daire' };
export type Font = 'G' | 'M' | 'O' | 'W';

// Nesne fontlari: G (Google Sans) varsayilan
export const FONTS: Record<Font, { name: string; css: string }> = {
  G: { name: 'Google Sans', css: "'Google Sans Variable', system-ui, sans-serif" },
  M: { name: 'Montserrat', css: "'Montserrat Variable', system-ui, sans-serif" },
  O: { name: 'Orbitron', css: "'Orbitron Variable', system-ui, sans-serif" },
  W: { name: 'Work Sans', css: "'Work Sans Variable', system-ui, sans-serif" },
};
export const fontCss = (f?: Font) => FONTS[f ?? 'G'].css;

export const FONT_PX: Record<Size, number> = { s: 15, m: 20, l: 28, x: 40 };
export const SIZE_NAMES: Record<Size, string> = { s: 'Kucuk', m: 'Orta', l: 'Buyuk', x: 'Cok buyuk' };
const ALIGN_CH: Record<Align, string> = { l: '<', c: '^', r: '>' };
const CH_ALIGN: Record<string, Align> = { '<': 'l', '^': 'c', '>': 'r' };

// FigJam paleti: kucuk harf = canli, BUYUK harf = ayni sutunun acik tonu
export const PALETTE: Record<string, string> = {
  k: '#1E1E1E', g: '#757575', r: '#E5533B', o: '#F5A352', y: '#F7CB57', n: '#7DD17F',
  t: '#75D6CC', b: '#64B1F9', v: '#9150F5', p: '#EB52BE', w: '#FFFFFF',
  K: '#B3B3B3', G: '#D9D9D9', R: '#F7C6BF', O: '#FBDFC3', Y: '#FDEDC5', N: '#D4F2D5',
  T: '#CFF7F3', B: '#CDE5FB', V: '#DCCBFC', P: '#F6CCEB',
};
export const PALETTE_ROWS = ['kgroyntbvpw', 'KGROYNTBVP'];
const DARK_FILLS = 'kgrvp';

export const DEFAULT_SIZE: Record<Shape, [number, number]> = {
  rect: [176, 176], round: [304, 208], pill: [400, 48], circle: [176, 176],
  diamond: [176, 176], db: [80, 80], text: [160, 40], group: [496, 408], table: [480, 144],
};
export const DEFAULT_COLOR: Record<Shape, string> = {
  rect: 'w', round: 'T', pill: 'r', circle: 'w', diamond: 'T', db: 'T', text: 'k', group: 'w', table: 'w',
};
// Yeni sekil icin rastgele palet rengi (siyah/gri/beyaz haric); yazi, grup ve tablo sade kalir
const RANDOM_POOL = 'roytbvpnROYNTBVP';
export function newShapeColor(shape: Shape) {
  if (shape === 'text' || shape === 'group' || shape === 'table') return DEFAULT_COLOR[shape];
  return RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
}

// Yeni sekil icin rastgele kenar rengi: canli tonlardan, dolgunun sutunundan farkli
const STROKE_POOL = 'kgroyntbvp';
export function newStrokeColor(shape: Shape, fill: string): string | undefined {
  if (shape === 'text' || shape === 'group' || shape === 'table') return undefined;
  const pool = STROKE_POOL.replace(fill.toLowerCase(), '');
  return pool[Math.floor(Math.random() * pool.length)];
}

export const defaultFontSize = (shape: Shape): Size => (shape === 'text' ? 'm' : 's');

// Kalinlik: node kenarligi 0 (yok) .. 3, baglanti 1..3; varsayilan 2
export const NODE_STROKE = [0, 1.5, 3, 6];
export const EDGE_STROKE = [0, 1.5, 3, 5];
export const WEIGHT_NAMES = ['Yok', 'Ince', 'Normal', 'Kalin'];
// Tablo ve grup ince kenarlikla gelir, digerleri normal
export const defaultWeight = (shape: Shape) => (shape === 'table' || shape === 'group' ? 1 : 2);
export const DASH = '10 7';

// Tam format ve kurallar ayni klasordeki FLOW_GUIDE.md'de; her dosyada sadece kisa bir hatirlatma durur
export const HEADER = '#flow2 guide: FLOW_GUIDE.md in this folder | N:id[@grp] shape[.fmt] color x y w h text | E:from>to[/opts] label';

export interface FNode {
  id: string;
  parent?: string;
  shape: Shape;
  size?: Size;
  align?: Align;
  font?: Font;
  weight?: number;
  dash?: boolean;
  stroke?: string; // kenar rengi; yoksa dolgudan turetilir
  autoH?: boolean; // dosyada h "-": yukseklik metne gore uygulamada olculur, sonra sayi olarak yazilir
  line?: number; // kaynak satir (dogrulayici icin)
  sets?: string[]; // mantiksal gruplar (dosyada "&a,b,c" satirlari), en dis grup basta; ayni gruptakiler birlikte secilir/tasinir
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface FEdge {
  from: string;
  to: string;
  color: string;
  kind: EdgeKind;
  arrow: boolean; // bitis ucu var mi (dosyada "-" = yok)
  start?: Cap; // baslangic ucu ("<X"); yoksa uc yok
  end?: Cap; // bitis ucu (">X"); yoksa cizgi ok ("a"). arrow=false ise kullanilmaz
  top?: boolean; // dosyada "^": baglanti tum nesnelerin USTUNDE cizilir; yoksa altinda (varsayilan)
  weight?: number;
  dash?: boolean;
  sides?: [Side | '*', Side | '*'];
  bend?: [number, number];
  label: string;
  line?: number; // kaynak satir (dogrulayici icin)
}

// Baglantinin serbest ucu: id yerine "x,y" (hicbir nesneye bagli olmayan ok ucu, mutlak koordinat)
export function parsePt(s: string): { x: number; y: number } | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(s);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}
export const ptText = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

export interface FGraph {
  nodes: FNode[];
  edges: FEdge[];
  comments?: FComments;
}

// Agent'in yazdigi # yorumlari kaybolmasin: her yorum blogu altindaki satira baglanir (node id, ok, grup);
// o satir silinirse yorum dosyanin sonuna gider. Ilk icerikten onceki yorumlar en ustte kalir.
export interface FComments {
  head: string[];
  before: Record<string, string[]>;
  tail: string[];
}

// Okunamayan satirlar icin kod + arguman (dogrulayici Ingilizce yazar; uygulama Turkce mesaji gosterir)
export interface FIssue {
  line: number;
  code: string;
  args: string[];
}

const nodeKey = (id: string) => `n:${id}`;
const groupKey = (ids: string[]) => `g:${[...ids].sort().join(',')}`;

export function colorHex(c: string): string | undefined {
  if (c === '-') return undefined;
  return c.startsWith('#') ? c : PALETTE[c];
}

// Kenar rengi verilmemisse dolgudan turetilir. Yazi rengi dolgudan turetilir. Yazi seklinde renk = yazi rengi.
export function nodeColors(c: string, shape?: Shape, strokeCode?: string) {
  const fill = colorHex(c);
  if (shape === 'text') return { fill: 'transparent', stroke: 'transparent', text: fill ?? PALETTE.k };
  const text = c.length === 1 && DARK_FILLS.includes(c) ? '#FFFFFF' : PALETTE.k;
  if (strokeCode) return { fill: fill ?? 'transparent', stroke: colorHex(strokeCode) ?? 'transparent', text };
  if (!fill) return { fill: 'transparent', stroke: 'transparent', text: PALETTE.k };
  let stroke: string;
  if (c === 'w' || c === 'K' || c === 'G') stroke = PALETTE.g;
  else if (/^[A-Z]$/.test(c)) stroke = PALETTE[c.toLowerCase()];
  else stroke = darken(fill, 0.18);
  return { fill, stroke, text };
}

// Koyu tuval: dosyadaki siyah (k) yazi ve cizgi rengi koyu zeminde gorunmez; ekranda acik tona cevrilir (dosya degismez)
export const ink = (hex: string, dark: boolean) => (dark && hex.toUpperCase() === PALETTE.k ? '#EDEDED' : hex);

function darken(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - amount));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

const isColor = (c: string) => c === '-' || c in PALETTE || /^#[0-9a-fA-F]{6}$/.test(c);

// Ters bolu sadece belirsizlik yaratacagi yerde (\ ya da n onunde, satir sonunda) ikilenir; tablodaki \| aynen kalir
const esc = (s: string) => s.replace(/\\(?=[\\n]|$)/g, '\\\\').replace(/\n/g, '\\n');
const unesc = (s: string) => s.replace(/\\(\\|n)/g, (_, c) => (c === 'n' ? '\n' : '\\'));

// Tablo metni <-> hucre matrisi. Hucre icindeki | karakteri \| olarak saklanir.
export function parseTable(text: string): string[][] {
  const rows = (text || '').split('\n').map((r) => r.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|')));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(cols - r.length).fill('')]);
}
export const tableText = (cells: string[][]) =>
  cells.map((r) => r.map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join('|')).join('\n');

const NODE_RE = /^([^\s@>/]+)(?:@(\S+))?\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?: (.*))?$/;
const EDGE_RE = /^([^\s>/]+)>([^\s>/]+)(?:\/(\S*))?(?: (.*))?$/;
// Node bicimi: karakterler sirasiz okunur
function parseFmt(fmt: string): Partial<FNode> | null {
  const f: Partial<FNode> = {};
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    // =X ya da =#RRGGBB: kenar rengi
    if (ch === '=') {
      const code = fmt[i + 1] === '#' ? fmt.slice(i + 1, i + 8) : fmt[i + 1] ?? '';
      if (!code || code === '-' || !isColor(code)) return null;
      f.stroke = code;
      i += code.length;
      continue;
    }
    if ('smlx'.includes(ch)) f.size = ch as Size;
    else if (ch in CH_ALIGN) f.align = CH_ALIGN[ch];
    else if ('0123'.includes(ch)) f.weight = Number(ch);
    else if (ch === '~') f.dash = true;
    else if (ch in FONTS) f.font = ch as Font;
    else return null;
  }
  return f;
}

// Edge secenekleri: sirasiz okunur; #hex, :XY ve @dx,dy kendi uzunluklarini tuketir
function parseOpts(s: string): Omit<FEdge, 'from' | 'to' | 'label'> | null {
  const o: Omit<FEdge, 'from' | 'to' | 'label'> = { color: 'g', kind: 'curve', arrow: true };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#') {
      const hex = s.slice(i, i + 7);
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
      o.color = hex;
      i += 7;
      continue;
    }
    if (ch === ':') {
      const m = /^:([trbl*])([trbl*])/.exec(s.slice(i));
      if (!m) return null;
      o.sides = [m[1] as Side, m[2] as Side];
      i += 3;
      continue;
    }
    if (ch === '@') {
      const m = /^@(-?\d+),(-?\d+)/.exec(s.slice(i));
      if (!m) return null;
      o.bend = [Number(m[1]), Number(m[2])];
      i += m[0].length;
      continue;
    }
    if (ch === '<' || ch === '>') {
      // Uc bicimi: <X baslangic, >X bitis; X = n (yok) a t d c
      const cap = s[i + 1];
      if (!cap || !'natdc'.includes(cap)) return null;
      if (ch === '<') o.start = cap === 'n' ? undefined : (cap as Cap);
      else if (cap === 'n') o.arrow = false;
      else o.end = cap === 'a' ? undefined : (cap as Cap);
      i += 2;
      continue;
    }
    if (ch === '|') o.kind = 'step';
    else if (ch === '_') o.kind = 'line';
    else if (ch === '-') o.arrow = false;
    else if (ch === '~') o.dash = true;
    else if (ch === '^') o.top = true;
    else if ('123'.includes(ch)) o.weight = Number(ch);
    else if (ch in PALETTE) o.color = ch;
    else return null;
    i++;
  }
  return o;
}

export function parseFlow(text: string): { graph: FGraph; errors: string[]; issues: FIssue[] } {
  const nodes: FNode[] = [];
  const edges: FEdge[] = [];
  const errors: string[] = [];
  const issues: FIssue[] = [];
  const fail = (ln: number, code: string, args: string[], tr: string) => {
    errors.push(`${ln}: ${tr}`);
    issues.push({ line: ln, code, args });
  };
  const ids = new Set<string>();
  const pendingEdges: [number, FEdge][] = [];
  const pendingSets: [number, string[]][] = [];
  const comments: FComments = { head: [], before: {}, tail: [] };
  let pending: string[] = [];
  let seenContent = false;
  // Yorum blogunu altindaki gecerli satira bagla
  const anchor = (key: string) => {
    if (pending.length) {
      if (!seenContent) comments.head.push(...pending);
      else (comments.before[key] ??= []).push(...pending);
    }
    pending = [];
    seenContent = true;
  };
  const edgeCount = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line) return;
    if (line.startsWith('#')) {
      if (!line.startsWith('#flow2')) pending.push(line); // baslik her kayitta yeniden yazilir
      return;
    }
    const ln = i + 1;
    if (line.startsWith('&')) {
      const list = line.slice(1).split(',').map((s) => s.trim()).filter(Boolean);
      pendingSets.push([ln, list]);
      anchor(groupKey(list));
      return;
    }
    const e = EDGE_RE.exec(line);
    if (e) {
      const [, from, to, opts = '', label = ''] = e;
      const o = parseOpts(opts);
      if (!o) return fail(ln, 'E_EDGE_OPTS', [opts], `gecersiz edge secenegi "${opts}"`);
      pendingEdges.push([ln, { from, to, ...o, label: unesc(label), line: ln }]);
      const k = `${from}>${to}`;
      const c = (edgeCount.get(k) ?? 0) + 1;
      edgeCount.set(k, c);
      anchor(`e:${k}#${c}`);
      return;
    }
    const m = NODE_RE.exec(line);
    if (!m) return fail(ln, 'E_SYNTAX', [line.slice(0, 40)], `okunamadi "${line.slice(0, 40)}"`);
    const [, id, parent, shapeTok, color, xs, ys, ws, hs, txt = ''] = m;
    const [shape, fmt = ''] = shapeTok.split('.');
    if (!SHAPES.includes(shape as Shape)) return fail(ln, 'E_SHAPE', [shape], `bilinmeyen sekil "${shape}"`);
    const f = parseFmt(fmt);
    if (!f) return fail(ln, 'E_FMT', [fmt], `bilinmeyen bicim ".${fmt}"`);
    if (!isColor(color)) return fail(ln, 'E_COLOR', [color], `bilinmeyen renk "${color}"`);
    if (ids.has(id)) return fail(ln, 'E_DUP_ID', [id], `tekrar eden id "${id}"`);
    if (parent && !ids.has(parent)) return fail(ln, 'E_SECTION_ORDER', [parent], `section "${parent}" once tanimlanmali`);
    const num = (s: string) => (s === '-' ? NaN : Number(s));
    const [x, y, w, h] = [xs, ys, ws, hs].map(num);
    if ([xs, ys, ws, hs].some((s, k) => s !== '-' && Number.isNaN([x, y, w, h][k])))
      return fail(ln, 'E_NUMBER', [], 'x y w h sayi ya da - olmali');
    const def = DEFAULT_SIZE[shape as Shape];
    ids.add(id);
    // h "-" (yazi, tablo ve section haric): yukseklik metne gore olculur
    const autoH = Number.isNaN(h) && shape !== 'text' && shape !== 'table' && shape !== 'group';
    const node: FNode = {
      id, parent, shape: shape as Shape, color: shape === 'text' && color === '-' ? 'k' : color, x, y,
      w: Number.isNaN(w) ? def[0] : w, h: Number.isNaN(h) ? def[1] : h, text: unesc(txt), ...f, line: ln,
      ...(autoH ? { autoH } : {}),
    };
    nodes.push(node);
    anchor(nodeKey(id));
  });
  comments.tail = pending;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Gruplar ic ice olabilir (bir grup baska bir grubun alt kumesi); kismen ortusen iki grup gecersiz
  const accepted: { key: string; members: Set<string> }[] = [];
  pendingSets.forEach(([ln, list], k) => {
    const members = new Set(list);
    const missing = list.find((m) => !byId.has(m));
    if (missing) return fail(ln, 'E_GROUP_UNKNOWN', [missing], `grup satiri bilinmeyen node'a bagli "${missing}"`);
    if (members.size < 2) return fail(ln, 'E_GROUP_SIZE', [], 'grup en az 2 node icermeli');
    for (const o of accepted) {
      const common = [...members].filter((m) => o.members.has(m)).length;
      if (!common) continue;
      if (common === members.size && common === o.members.size) return fail(ln, 'E_GROUP_DUP', [], 'ayni uyeli grup zaten var');
      if (common !== members.size && common !== o.members.size)
        return fail(ln, 'E_GROUP_OVERLAP', [], 'grup baska bir grupla kismen ortusuyor (ic ice ya da ayri olmali)');
    }
    accepted.push({ key: `s${k + 1}`, members });
  });
  accepted.sort((a, b) => b.members.size - a.members.size);
  for (const g of accepted) for (const m of g.members) (byId.get(m)!.sets ??= []).push(g.key);

  for (const [ln, edge] of pendingEdges) {
    const bad = [edge.from, edge.to].find((x) => !ids.has(x) && !parsePt(x));
    if (bad) fail(ln, 'E_EDGE_NODE', [bad], `edge bilinmeyen node'a bagli "${bad}"`);
    else edges.push(edge);
  }

  autoPlace(nodes);
  return { graph: { nodes, edges, comments }, errors, issues };
}

// Konumu "-" verilen node'lari mevcutlarin altina, soldan saga dizer
function autoPlace(nodes: FNode[]) {
  const placed = nodes.filter((n) => !n.parent && !Number.isNaN(n.x) && !Number.isNaN(n.y));
  let cursorX = placed.length ? Math.min(...placed.map((n) => n.x)) : 0;
  const baseY = placed.length ? Math.max(...placed.map((n) => n.y + n.h)) + 80 : 0;
  for (const n of nodes) {
    if (!Number.isNaN(n.x) && !Number.isNaN(n.y)) continue;
    if (n.parent) {
      if (Number.isNaN(n.x)) n.x = 48;
      if (Number.isNaN(n.y)) n.y = 48;
      continue;
    }
    if (Number.isNaN(n.x)) n.x = cursorX;
    if (Number.isNaN(n.y)) n.y = baseY;
    cursorX = n.x + n.w + 48;
  }
}

export function serializeFlow(g: FGraph): string {
  const r = Math.round;
  const c = g.comments;
  const used = new Set<string>();
  const lines = [HEADER, ...(c?.head ?? [])];
  const put = (key: string, line: string) => {
    const before = c?.before[key];
    if (before && !used.has(key)) lines.push(...before);
    used.add(key);
    lines.push(line);
  };
  for (const n of g.nodes) {
    const id = n.parent ? `${n.id}@${n.parent}` : n.id;
    const fmt = (n.size && n.size !== defaultFontSize(n.shape) ? n.size : '') + (n.align ? ALIGN_CH[n.align] : '') +
      (n.weight !== undefined && n.weight !== defaultWeight(n.shape) ? n.weight : '') + (n.dash ? '~' : '') +
      (n.font && n.font !== 'G' ? n.font : '') + (n.stroke ? '=' + n.stroke : '');
    const shape = fmt ? `${n.shape}.${fmt}` : n.shape;
    // Yazi kendi boyutunu alir; w h yazilmaz
    const wh = n.shape === 'text' ? '- -' : `${r(n.w)} ${r(n.h)}`;
    put(nodeKey(n.id), `${id} ${shape} ${n.color} ${r(n.x)} ${r(n.y)} ${wh}${n.text ? ' ' + esc(n.text) : ''}`);
  }
  // Mantiksal gruplar: her anahtar (en az 2 uye) bir satir; ayni uyeli tekrarlar tek satira iner; buyukten kucuge
  const sets = new Map<string, string[]>();
  for (const n of g.nodes) for (const k of n.sets ?? []) sets.set(k, [...(sets.get(k) ?? []), n.id]);
  const seen = new Set<string>();
  [...sets.values()]
    .filter((ids) => ids.length > 1)
    .sort((a, b) => b.length - a.length)
    .forEach((ids) => {
      const line = '&' + ids.join(',');
      if (!seen.has(line)) put(groupKey(ids), line);
      seen.add(line);
    });
  const edgeCount = new Map<string, number>();
  for (const e of g.edges) {
    const k = `${e.from}>${e.to}`;
    const ec = (edgeCount.get(k) ?? 0) + 1;
    edgeCount.set(k, ec);
    let opts = (e.color !== 'g' ? e.color : '') + (e.kind === 'step' ? '|' : e.kind === 'line' ? '_' : '') + (e.arrow ? '' : '-') +
      (e.weight && e.weight !== 2 ? e.weight : '') + (e.dash ? '~' : '') +
      (e.start ? '<' + e.start : '') + (e.arrow && e.end && e.end !== 'a' ? '>' + e.end : '') + (e.top ? '^' : '');
    if (e.sides && (e.sides[0] !== '*' || e.sides[1] !== '*')) opts += ':' + e.sides.join('');
    if (e.bend && (e.bend[0] || e.bend[1])) opts += `@${r(e.bend[0])},${r(e.bend[1])}`;
    put(`e:${k}#${ec}`, `${e.from}>${e.to}${opts ? '/' + opts : ''}${e.label ? ' ' + esc(e.label) : ''}`);
  }
  // Satiri silinen yorumlar ve dosya sonundaki yorumlar kaybolmasin
  if (c) for (const [key, block] of Object.entries(c.before)) if (!used.has(key)) lines.push(...block);
  lines.push(...(c?.tail ?? []));
  return lines.join('\n') + '\n';
}

// FLOW_GUIDE.mjs kaynagi: .flow dogrulayici. Uygulamanin kendi okuyucusunu (format.ts) kullanir, kurallar ayni kalir.
// Derleme: npm run build:guide  (cikti: FLOW_GUIDE.mjs, tek dosya, bagimliliksiz). Cikti Ingilizce (agent okur).
import { readFileSync } from 'node:fs';
import { DEFAULT_SIZE, FONT_PX, NODE_STROKE, defaultFontSize, parseFlow, parsePt } from '../src/flow/format';
import type { FEdge, FIssue, FNode, Side } from '../src/flow/format';
import { NORMAL, anchor, autoSides, buildPath, makeBox, samplePath } from '../src/flow/edgeGeom';
import type { Pt } from '../src/flow/edgeGeom';

const SHAPE_LIST = 'rect round pill circle diamond db text group table';
const ERR: Record<string, (a: string[]) => string> = {
  E_SYNTAX: (a) => `unreadable line "${a[0]}" (node: id[@section] shape[.fmt] color x y w h text | edge: from>to[/opts] label | group: &id,id)`,
  E_EDGE_OPTS: (a) => `invalid edge opts "/${a[0]}" (any order: color, | elbow, _ straight, - no arrow, 1 2 3 width, ~ dashed, :XY sides, @dx,dy bend, <X start tip, >X end tip with X = a t d c n, ^ above nodes)`,
  E_SHAPE: (a) => `unknown shape "${a[0]}" (use ${SHAPE_LIST})`,
  E_FMT: (a) => `invalid fmt ".${a[0]}" (s m l x < ^ > 0 1 2 3 ~ M O W =X)`,
  E_COLOR: (a) => `unknown color "${a[0]}" (k g r o y n t b v p w, uppercase = light, - or #RRGGBB)`,
  E_DUP_ID: (a) => `duplicate id "${a[0]}"`,
  E_SECTION_ORDER: (a) => `Section "${a[0]}" must be defined on an earlier line`,
  E_NUMBER: () => 'x y w h must be numbers or -',
  E_GROUP_UNKNOWN: (a) => `group line refers to unknown id "${a[0]}"`,
  E_GROUP_SIZE: () => 'group line needs at least 2 ids',
  E_GROUP_DUP: () => 'same group already exists',
  E_GROUP_OVERLAP: () => 'group partly overlaps another group (must be nested or disjoint)',
  E_EDGE_NODE: (a) => `edge refers to unknown id "${a[0]}" (an end is a node id or a free point x,y)`,
};

type Box = { x: number; y: number; w: number; h: number };
const LABEL_PX = 14; // baglanti etiketi yazi boyutu (App.css .edge-label)

// Iki kirik cizgi kesisiyor mu
function segCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// Etiketin en az %25'i baska bir seyin ustunde mi (kenara hafif degme sayilmaz)
function covers(l: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(l.x + l.w, b.x + b.w) - Math.max(l.x, b.x);
  const h = Math.min(l.y + l.h, b.y + b.h) - Math.max(l.y, b.y);
  return w > 0 && h > 0 && w * h >= 0.25 * l.w * l.h;
}
function polylinesCross(p: Pt[], q: Pt[]) {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) if (segCross(p[i - 1], p[i], q[j - 1], q[j])) return true;
  return false;
}
type Out = { line: number; code: string; msg: string };

const LINE_H = 1.45;
// Harf genisligi / font boyutu (Google Sans'ta olculdu): ince, normal, genis harf ve buyuk harf sinifi.
// Diger fontlar bu degerin katsayisi; kalin yazi biraz genis.
const FONT_K: Record<string, number> = { G: 1, M: 1.14, O: 1.36, W: 1.08 };
const charEm = (ch: string) =>
  /[ilj.,;:'!|ftI1 ]/.test(ch) ? 0.27 : /[mwMW@%]/.test(ch) ? 0.8 : /[A-Z0-9#&]/.test(ch) ? 0.6 : 0.48;
const textW = (t: string, font: string, bold: boolean) =>
  [...t].reduce((s, ch) => s + charEm(ch), 0) * (FONT_K[font] ?? 1) * (bold ? 1.06 : 1);
// Sekle gore metnin kullanabildigi alan orani (elmas/daire koselerde dar)
const AREA: Record<string, number> = { diamond: 0.75, circle: 0.85, db: 0.9 };
const plain = (s: string) => s.replace(/\*\*|~~/g, '');

// Kelime kelime satira sar (tarayicinin pre-wrap davranisina yakin); maxEm = satir genisligi / font boyutu
function wrapLines(t: string, maxEm: number, font: string, bold: boolean) {
  const sp = textW(' ', font, bold);
  let lines = 1, cur = 0;
  for (const word of t.split(' ')) {
    const w = textW(word, font, bold);
    if (cur && cur + sp + w > maxEm) { lines++; cur = 0; }
    if (w > maxEm) { lines += Math.ceil(w / maxEm) - 1; cur = w % maxEm; }
    else cur += (cur ? sp : 0) + w;
  }
  return lines;
}

// Metin kutuya sigar mi (tahmin): [gereken ic yukseklik, mevcut ic yukseklik]
function textFit(n: FNode, w: number, h: number): [number, number] | null {
  if (!n.text || ['text', 'group', 'table'].includes(n.shape)) return null;
  const fs = FONT_PX[n.size ?? defaultFontSize(n.shape)];
  const sw = NODE_STROKE[n.weight ?? 2];
  const k = AREA[n.shape] ?? 1;
  const availW = (w - 28 - 2 * sw) * k;
  const availH = (h - 16 - 2 * sw) * k;
  let lines = 0;
  for (const raw of n.text.split('\n')) {
    const li = raw.startsWith('- ');
    const t = plain(li ? raw.slice(2) : raw);
    lines += wrapLines(t, (availW - (li ? 1.1 * fs : 0)) / fs, n.font ?? 'G', raw.includes('**'));
  }
  return [lines * fs * LINE_H, availH];
}

export function checkText(text: string): { nodes: number; edges: number; out: Out[] } {
  const { graph, issues } = parseFlow(text);
  const out: Out[] = issues.map((i: FIssue) => ({ line: i.line, code: i.code, msg: (ERR[i.code] ?? (() => i.code))(i.args) }));
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Mutlak kutular (Section icindekiler goreli)
  const abs = new Map<string, Box>();
  const absOf = (n: FNode, seen = new Set<string>()): Box => {
    const m = abs.get(n.id);
    if (m) return m;
    let { x, y } = n;
    const p = n.parent ? byId.get(n.parent) : undefined;
    if (p && !seen.has(p.id)) {
      seen.add(n.id);
      const pb = absOf(p, seen);
      x += pb.x;
      y += pb.y;
    }
    const fit = n.autoH ? textFit(n, n.w, 1e6) : null;
    const h = n.autoH ? Math.max(48, Math.ceil(((fit?.[0] ?? 0) + 16 + 2 * NODE_STROKE[n.weight ?? 2]) / 8) * 8) : n.h;
    const b = { x, y, w: n.shape === 'text' ? estTextW(n) : n.w, h: n.shape === 'text' ? estTextH(n) : h };
    abs.set(n.id, b);
    return b;
  };
  nodes.forEach((n) => absOf(n));
  const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const sections = nodes.filter((n) => n.shape === 'group');
  const warn = (n: FNode | undefined, line: number | undefined, code: string, msg: string) =>
    out.push({ line: line ?? n?.line ?? 0, code, msg });

  // Uygulamanin kuralina gore gercek Section: node'u TAMAMEN iceren en kucuk Section
  const owner = new Map<string, string | undefined>();
  for (const n of nodes) {
    const b = abs.get(n.id)!;
    let best: FNode | undefined;
    let area = Infinity;
    for (const s of sections) {
      if (s.id === n.id) continue;
      const sb = abs.get(s.id)!;
      const a = sb.w * sb.h;
      if (a > b.w * b.h && a < area && inside(b, sb)) { best = s; area = a; }
    }
    owner.set(n.id, best?.id);
  }

  for (const n of nodes) {
    const b = abs.get(n.id)!;
    if (n.parent && byId.get(n.parent)?.shape !== 'group')
      warn(n, undefined, 'W_PARENT', `${n.id}@${n.parent}: "${n.parent}" is not a Section (shape group); the app ignores it`);
    const real = owner.get(n.id);
    if ((n.parent ?? undefined) !== real) {
      const was = n.parent ? `written inside Section ${n.parent}` : 'written at top level';
      const will = real ? `fully inside Section ${real}` : 'not fully inside any Section';
      warn(n, undefined, 'W_SECTION', `${n.id} is ${was} but its box is ${will}; the app will re-parent it on the next edit`);
    }
    // Section kenarina kismen binen kutu
    for (const s of sections) {
      if (s.id === n.id || s.id === real || owner.get(s.id) === n.id) continue;
      const sb = abs.get(s.id)!;
      if (hit(b, sb) && !inside(b, sb) && !inside(sb, b))
        warn(n, undefined, 'W_SECTION_EDGE', `${n.id} partly overlaps Section ${s.id} (crosses its border)`);
    }
    const fit = n.autoH ? null : textFit(n, n.w, n.h);
    if (fit && fit[0] > fit[1] + 0.4 * LINE_H * FONT_PX[n.size ?? defaultFontSize(n.shape)]) {
      const sw = NODE_STROKE[n.weight ?? 2];
      const k = AREA[n.shape] ?? 1;
      const need = Math.ceil((fit[0] / k + 16 + 2 * sw) / 8) * 8;
      warn(n, undefined, 'W_TEXT_OVERFLOW', `${n.id}: text may not fit (needs about h ${need}, has ${n.h}); raise h, widen w, or write h as -`);
    }
  }

  // Ayni yerdeki (ayni gercek Section) kutularin ust uste binmesi; serbest yazi ve Section'lar haric
  const boxes = nodes.filter((n) => n.shape !== 'group' && n.shape !== 'text');
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (owner.get(a.id) !== owner.get(c.id)) continue;
      if (hit(abs.get(a.id)!, abs.get(c.id)!)) warn(c, undefined, 'W_OVERLAP', `${a.id} and ${c.id} overlap`);
    }
  // Iki Section kismen ortusuyor
  for (let i = 0; i < sections.length; i++)
    for (let j = i + 1; j < sections.length; j++) {
      const a = abs.get(sections[i].id)!, c = abs.get(sections[j].id)!;
      if (hit(a, c) && !inside(a, c) && !inside(c, a))
        warn(sections[j], undefined, 'W_OVERLAP', `Sections ${sections[i].id} and ${sections[j].id} partly overlap`);
    }
  for (const e of graph.edges) if (e.from === e.to) warn(undefined, e.line, 'W_SELF_EDGE', `${e.from}>${e.to}: edge to itself is not drawn`);

  // ---- Oklar: uygulamanin cizdigi yolun aynisi hesaplanir (edgeGeom)
  // Serbest uc ("x,y"): sifir boyutlu kutu, ok tam o noktada biter
  const bx = (id: string) => {
    const p = parsePt(id);
    if (p) return makeBox(p.x, p.y, 0, 0);
    const b = abs.get(id)!;
    return makeBox(b.x, b.y, b.w, b.h);
  };
  const solid = nodes.filter((n) => n.shape !== 'group');
  type Drawn = { e: FEdge; name: string; pts: Pt[]; label?: Box };
  const drawn: Drawn[] = [];
  for (const e of graph.edges) {
    if (e.from === e.to) continue;
    const a = bx(e.from), b = bx(e.to);
    const auto = autoSides(a, b);
    const fx0 = e.sides && e.sides[0] !== '*' ? (e.sides[0] as Side) : undefined;
    const fx1 = e.sides && e.sides[1] !== '*' ? (e.sides[1] as Side) : undefined;
    const ss = fx0 ?? auto[0], ts = fx1 ?? auto[1];
    const p1 = anchor(a, ss), p2 = anchor(b, ts);
    const name = `${e.from}>${e.to}`;
    // Elle verilen kenar hedefe ters bakiyorsa ok geri donup dolanir
    const away = (s: Side, from: Pt, to: Pt) => NORMAL[s][0] * (to.x - from.x) + NORMAL[s][1] * (to.y - from.y) < -8;
    if (fx0 && away(fx0, p1, p2)) warn(undefined, e.line, 'W_SIDE_BACK', `${name}: exit side "${fx0}" faces away from ${e.to}; the arrow loops back (pick the side facing ${e.to}, or * for auto)`);
    if (fx1 && away(fx1, p2, p1)) warn(undefined, e.line, 'W_SIDE_BACK', `${name}: entry side "${fx1}" faces away from ${e.from}; the arrow loops around ${e.to} (pick the side facing ${e.from}, or * for auto)`);
    const [path, lx, ly] = buildPath(e, p1, ss, p2, ts);
    const pts = samplePath(path);
    // Uclardaki birkac nokta (kutunun kenari) haric
    const core = pts.filter((p) => Math.hypot(p.x - p1.x, p.y - p1.y) > 10 && Math.hypot(p.x - p2.x, p.y - p2.y) > 10);
    const through = solid
      .filter((n) => n.id !== e.from && n.id !== e.to && n.shape !== 'text')
      .filter((n) => { const c = abs.get(n.id)!; return core.some((p) => p.x > c.x + 2 && p.x < c.x + c.w - 2 && p.y > c.y + 2 && p.y < c.y + c.h - 2); })
      .map((n) => n.id);
    if (through.length) warn(undefined, e.line, 'W_EDGE_THROUGH', `${name} passes through ${through.slice(0, 3).join(', ')}${through.length > 3 ? ` (+${through.length - 3})` : ''}; move a box, set :XY sides or bend with @dx,dy`);
    let label: Box | undefined;
    if (e.label) {
      const w = textW(e.label, 'G', false) * LABEL_PX + 16, h = LABEL_PX * LINE_H + 6;
      label = makeBox(lx - w / 2, ly - h / 2, w, h);
    }
    drawn.push({ e, name, pts: core, label });
  }
  // Etiket bir kutunun ya da baska etiketin ustunde
  for (const d of drawn) {
    if (!d.label) continue;
    const L = d.label;
    const under = solid.filter((n) => covers(L, abs.get(n.id)!)).map((n) => n.id);
    if (under.length) warn(undefined, d.e.line, 'W_LABEL_OVERLAP', `${d.name}: label "${d.e.label}" covers ${under.slice(0, 3).join(', ')}`);
    for (const o of drawn) if (o !== d && o.label && (o.e.line ?? 0) < (d.e.line ?? 0) && covers(L, o.label))
      warn(undefined, d.e.line, 'W_LABEL_OVERLAP', `${d.name}: label overlaps the label of ${o.name}`);
  }
  // Kesisen oklar (ortak ucu olan oklar haric); cok sayida ise ilk 15'i ve toplam
  const crossings: [Drawn, Drawn][] = [];
  for (let i = 0; i < drawn.length; i++)
    for (let j = i + 1; j < drawn.length; j++) {
      const A = drawn[i], B = drawn[j];
      const ends = new Set([A.e.from, A.e.to]);
      if (ends.has(B.e.from) || ends.has(B.e.to)) continue;
      if (polylinesCross(A.pts, B.pts)) crossings.push([A, B]);
    }
  crossings.slice(0, 15).forEach(([A, B]) => warn(undefined, B.e.line, 'W_EDGE_CROSS', `${B.name} crosses ${A.name}`));
  if (crossings.length > 15) warn(undefined, 0, 'W_EDGE_CROSS', `${crossings.length} crossing edge pairs in total (first 15 listed)`);

  out.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
  return { nodes: nodes.length, edges: graph.edges.length, out };
}

// Serbest yazi icin kaba boyut (cakisma denetimi yazilari atlar; Section uyeligi icin kullanilir)
function estTextW(n: FNode) {
  const fs = FONT_PX[n.size ?? defaultFontSize('text')];
  return Math.max(...n.text.split('\n').map((l) => textW(plain(l), n.font ?? 'G', l.includes('**')))) * fs + 8;
}
function estTextH(n: FNode) {
  const fs = FONT_PX[n.size ?? defaultFontSize('text')];
  return n.text.split('\n').length * fs * LINE_H + 4;
}

// Secenekler: --summary (tek satir ozet; E_ satirlari yine tam), --only KOD[,KOD] (sadece bu kodlar; on ek de olur: W_EDGE)
function main(argv: string[]) {
  let summary = false;
  let only: string[] | null = null;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--summary') summary = true;
    else if (a === '--only') only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a.startsWith('--only=')) only = a.slice(7).split(',').filter(Boolean);
    else files.push(a);
  }
  if (!files.length) {
    console.log('usage: node FLOW_GUIDE.mjs [--summary] [--only CODE[,CODE]] <file.flow> [more.flow ...]');
    process.exit(2);
  }
  let failed = false;
  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      console.log(`${f}: cannot read file`);
      failed = true;
      continue;
    }
    const r = checkText(text);
    const errs = r.out.filter((o) => o.code.startsWith('E_'));
    const warns = r.out.filter((o) => !o.code.startsWith('E_'));
    const byCode = new Map<string, number>();
    for (const w of warns) byCode.set(w.code, (byCode.get(w.code) ?? 0) + 1);
    const counts = [...byCode].sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ${n}`).join(', ');
    console.log(`${f}: ${r.nodes} nodes, ${r.edges} edges, ${errs.length} errors, ${warns.length} warnings${summary && counts ? ` (${counts})` : ''}`);
    // Hatalar her kipte tam yazilir; uyarilar ozet kipinde yazilmaz, --only ile suzulur
    const pick = (o: Out) => !only || only.some((c) => o.code.startsWith(c));
    const lines = summary ? errs : r.out;
    for (const o of lines) if (o.code.startsWith('E_') || pick(o)) console.log(`${o.line} ${o.code} ${o.msg}`);
    if (errs.length) failed = true;
  }
  if (failed) process.exit(1);
}

void DEFAULT_SIZE;
main(process.argv.slice(2));

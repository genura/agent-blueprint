import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { DEFAULT_SIZE, newShapeColor, newStrokeColor, parseFlow, parseTable, serializeFlow, tableText } from './format';
import { absPosition, parentsFirst, regroup } from './groups';
import { autoSides, makeBox } from './edgeGeom';
import type { Align, Cap, EdgeKind, FComments, FEdge, FGraph, FNode, Font, Shape, Side, Size } from './format';

export type ShapeData = { shape: Shape; color: string; text: string; size?: Size; align?: Align; font?: Font; weight?: number; dash?: boolean; stroke?: string; sets?: string[]; autoH?: boolean };
export type ShapeNode = Node<ShapeData, 'shape'>;
export type FlowEdgeData = {
  color: string; kind: EdgeKind; arrow: boolean; start?: Cap; end?: Cap; top?: boolean; weight?: number; dash?: boolean;
  sides?: [Side | '*', Side | '*']; bend?: [number, number]; label: string;
};
export type FlowEdge = Edge<FlowEdgeData, 'flow'>;

let edgeSeq = 0;
const OPPOSITE: Record<Side, Side> = { t: 'b', b: 't', l: 'r', r: 'l' };
const isSide = (s: unknown): s is Side => s === 't' || s === 'r' || s === 'b' || s === 'l';
// Son kullanilan baglanti stili (FigJam gibi): yeni baglantilar bununla gelir
type EdgeStyle = Pick<FlowEdgeData, 'color' | 'kind' | 'arrow' | 'start' | 'end' | 'weight' | 'dash'>;
const STYLE_KEYS = ['color', 'kind', 'arrow', 'start', 'end', 'weight', 'dash'] as const;
export const GUIDE_FILE = 'FLOW_GUIDE.flow';
export const QUICK_GAP = 80;
// Hizli eklemede baska bir sekil istenirse (Ctrl+Alt+Shift + arti/eksi): sekil ve onizlemede gorunen renkleri.
// Yalniz secili yondeki onizlemeye uygulanir; diger yonler ayni seklin kopyasi olarak kalir.
export type QuickAlt = { shape: Shape; color: string; stroke?: string };
// Arti/eksi ile gezilen sira: arac cubugundaki cizilen ve baglanabilen sekiller (Section yok), yazi en sonda
export const QUICK_SHAPES: Shape[] = ['rect', 'round', 'pill', 'circle', 'diamond', 'db', 'table', 'text'];
// Hizli eklenen nesnenin, kaynagin sol ust kosesine gore yeri ve boyutu. Ayni sekilde: yan yana, ayni hizada.
// Baska sekilde: o seklin varsayilan boyutu, kaynaga gore ortalanmis. Onizleme ve olusturma ayni hesabi kullanir.
export function quickOffset(w: number, h: number, side: Side, alt?: Shape) {
  const [w2, h2] = alt ? DEFAULT_SIZE[alt] : [w, h];
  const r8 = (v: number) => Math.round(v / 8) * 8;
  const cx = r8((w - w2) / 2), cy = r8((h - h2) / 2);
  const g = QUICK_GAP;
  const d = { r: { dx: w + g, dy: cy }, l: { dx: -w2 - g, dy: cy }, b: { dx: cx, dy: h + g }, t: { dx: cx, dy: -h2 - g } }[side];
  return { ...d, w: w2, h: h2 };
}
function quickPos(n: ShapeNode, side: Side, alt?: Shape) {
  const w = n.width ?? n.measured?.width ?? DEFAULT_SIZE[n.data.shape][0];
  const h = n.height ?? n.measured?.height ?? DEFAULT_SIZE[n.data.shape][1];
  const o = quickOffset(w, h, side, alt);
  return { pos: { x: n.position.x + o.dx, y: n.position.y + o.dy }, w: o.w, h: o.h };
}

// Bos alana birakilan baglantinin olusturacagi seklin yeri: hedefin kaynaga bakan kenari birakilan noktaya oturur
export function planConnected(nodes: ShapeNode[], from: string, shape: Shape | 'same', at: { x: number; y: number }) {
  const src = nodes.find((n) => n.id === from);
  if (!src) return null;
  const same = shape === 'same';
  const sh: Shape = same ? src.data.shape : shape;
  const w = (same ? src.width ?? src.measured?.width : undefined) ?? DEFAULT_SIZE[sh][0];
  const h = (same ? src.height ?? src.measured?.height : undefined) ?? DEFAULT_SIZE[sh][1];
  const sp = absPosition(nodes, from);
  const sw = src.width ?? src.measured?.width ?? 0, shh = src.height ?? src.measured?.height ?? 0;
  const dx = at.x - (sp.x + sw / 2), dy = at.y - (sp.y + shh / 2);
  const toSide: Side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'l' : 'r') : dy > 0 ? 't' : 'b';
  const raw = {
    l: { x: at.x, y: at.y - h / 2 }, r: { x: at.x - w, y: at.y - h / 2 },
    t: { x: at.x - w / 2, y: at.y }, b: { x: at.x - w / 2, y: at.y - h },
  }[toSide];
  const snap = (v: number) => Math.round(v / 8) * 8;
  return { shape: sh, w, h, toSide, pos: { x: snap(raw.x), y: snap(raw.y) }, color: same ? src.data.color : undefined, stroke: same ? src.data.stroke : undefined };
}

const nextId = (nodes: ShapeNode[]) => {
  const ids = new Set(nodes.map((n) => n.id));
  let k = 1;
  while (ids.has(`n${k}`)) k++;
  return `n${k}`;
};
const edgeId = () => `e${++edgeSeq}`;
// Nesnenin grup yolu (sets, en disttan ice), girilen yolla basliyor mu
export const inPath = (sets: string[], path: string[]) => path.every((k, i) => sets[i] === k);
export const newSetKey = () => 'g' + Math.random().toString(36).slice(2, 8);
// Section adi: kullanilmayan en kucuk "Section N"
const nextSectionName = (nodes: ShapeNode[]) => {
  const used = new Set(nodes.filter((n) => n.data.shape === 'group').map((n) => n.data.text));
  let k = 1;
  while (used.has(`Section ${k}`)) k++;
  return `Section ${k}`;
};

function toRF(g: FGraph): { nodes: ShapeNode[]; edges: FlowEdge[] } {
  const nodes = g.nodes.map<ShapeNode>((n) => ({
    id: n.id,
    type: 'shape',
    position: { x: n.x, y: n.y },
    // Yazi kendi boyutunu alir (Figma auto-width); w h dosyada olculen deger
    width: n.shape === 'text' ? undefined : n.w,
    // h "-": yukseklik bos birakilir, React Flow metne gore olcer; onNodesChange bunu sayiya cevirir
    height: n.shape === 'text' || n.autoH ? undefined : n.h,
    parentId: n.parent,
    zIndex: n.shape === 'group' ? -1 : undefined,
    data: { shape: n.shape, color: n.color, text: n.text, size: n.size, align: n.align, font: n.font, weight: n.weight, dash: n.dash, stroke: n.stroke, sets: n.sets, ...(n.autoH ? { autoH: true } : {}) },
  }));
  const edges = g.edges.map<FlowEdge>((e) => ({
    id: edgeId(),
    type: 'flow',
    source: e.from,
    target: e.to,
    data: { color: e.color, kind: e.kind, arrow: e.arrow, start: e.start, end: e.end, top: e.top, weight: e.weight, dash: e.dash, sides: e.sides, bend: e.bend, label: e.label },
  }));
  return { nodes, edges };
}

function fromRF(nodes: ShapeNode[], edges: FlowEdge[]): FGraph {
  return {
    nodes: nodes.map<FNode>((n) => ({
      id: n.id,
      parent: n.parentId,
      shape: n.data.shape,
      color: n.data.color,
      x: n.position.x,
      y: n.position.y,
      w: n.width ?? n.measured?.width ?? DEFAULT_SIZE[n.data.shape][0],
      h: n.height ?? n.measured?.height ?? DEFAULT_SIZE[n.data.shape][1],
      text: n.data.text,
      size: n.data.size,
      align: n.data.align,
      font: n.data.font,
      stroke: n.data.stroke,
      weight: n.data.weight,
      dash: n.data.dash,
      sets: n.data.sets,
    })),
    edges: edges.map<FEdge>((e) => ({
      from: e.source,
      to: e.target,
      ...(e.data as FlowEdgeData),
    })),
  };
}

const api = {
  async list(): Promise<{ dir: string; files: string[]; recent: string[]; guide?: boolean }> {
    return (await fetch('/api/files')).json();
  },
  async read(name: string) {
    const r = await fetch(`/api/file?name=${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(await r.text());
    return r.text();
  },
  async write(name: string, text: string) {
    const r = await fetch(`/api/file?name=${encodeURIComponent(name)}`, { method: 'PUT', body: text });
    if (!r.ok) throw new Error(await r.text());
  },
};

interface FlowState {
  nodes: ShapeNode[];
  edges: FlowEdge[];
  dir: string;
  files: string[];
  recent: string[];
  changeDir: (req: { dir?: string; pick?: boolean }) => Promise<string | null>;
  afterDirChange: () => Promise<void>;
  file: string | null;
  live: boolean;
  errors: string[];
  current: string; // son commit edilen metin
  disk: string; // dosyanin diskteki birebir metni (agent bunu okur)
  saved: string; // diskteki metin (normalize)
  past: string[];
  future: string[];
  externalChange: boolean;
  fitSignal: number;
  tool: 'select' | 'hand' | 'text';
  editingId: string | null;
  placing: Shape | null;
  placingColor: string;
  placingStroke?: string;
  // Akilli cogaltma (Figma): son kopyanin kaynagi ve kopyasi; Ctrl+D aradaki mesafeyi tekrarlar
  lastDup: { src: string[]; dup: string[] } | null;
  setLastDup: (d: { src: string[]; dup: string[] } | null) => void;
  duplicate: () => void;
  setPlacing: (s: Shape | null) => void;
  quickAdd: (id: string, side: Side, edit?: boolean, alt?: QuickAlt) => void;
  // Ctrl+Alt+Shift basili: secili nesnenin bos yonlerinde baglantili kopya onizlemeleri; ok tuslari yon secer, Enter olusturur
  quickKeys: { node: string; sides: Side[]; side: Side | null; alt?: QuickAlt } | null;
  startQuickKeys: (prefer?: Side | null, alt?: QuickAlt) => void;
  copySelection: () => string | null;
  copyNodes: (ids: string[]) => string | null;
  paste: (text: string, offset: number | { x: number; y: number }, at?: { x: number; y: number }, select?: boolean) => Map<string, string>;
  regroupAll: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  sectionSelection: () => void;
  unsectionSelection: () => void;
  changeShape: (ids: string[], shape: Shape) => void;
  setTool: (t: 'select' | 'hand' | 'text') => void;
  setEditing: (id: string | null) => void;
  barHidden: boolean;
  entered: string | null; // cift tikla icine girilen Section (icinde kare secim yapilir)
  setEntered: (id: string | null) => void;
  enteredSets: string[]; // cift tikla icine girilen mantiksal grup yolu (en disttan ice); bos = hicbirine girilmedi
  setEnteredSets: (keys: string[]) => void;
  enterGroupAt: (id: string) => boolean; // node'un bir sonraki grup katmanina gir; girdiyse true
  toggleBar: () => void;

  onNodesChange: (c: NodeChange<ShapeNode>[]) => void;
  onEdgesChange: (c: EdgeChange<FlowEdge>[]) => void;
  onConnect: (c: Connection) => void;
  setNodes: (fn: (n: ShapeNode[]) => ShapeNode[]) => void;
  addNode: (shape: Shape, center: { x: number; y: number }, color?: string, stroke?: string, rect?: { x: number; y: number; w: number; h: number }) => void;
  reorder: (ids: string[], mode: 'front' | 'back' | 'up' | 'down') => void;
  updateNode: (ids: string[], patch: Partial<ShapeData>) => void;
  updateEdge: (ids: string[], patch: Partial<FlowEdgeData>) => void;
  reconnect: (id: string, end: 'source' | 'target', nodeId: string, side: Side | '*', otherSide?: Side) => void;
  lastShape: Shape; // en son olusturulan nesnenin sekli: R tusu bu sekli yerlestirmeye alir
  popIds: string[]; // yeni olusturulan nesneler: kisa bir "belirme" animasyonu oynar, sonra temizlenir
  insertHint: { edge: string; node: string } | null; // Shift+surukle: nesne bu baglantinin arasina girecek (vurgulanir)
  splitEdge: (edgeId: string, nodeId: string) => void; // baglantiyi ikiye bol: kaynak>nesne ve nesne>hedef
  connectTo: (source: string, target: string, fromSide: Side | '*', toSide: Side | '*') => void;
  edgeStyle: EdgeStyle;
  newEdge: (source: string, target: string, fromSide?: Side | '*' | null, toSide?: Side | '*' | null) => FlowEdge;
  // Bos alana birakilan baglanti: secilen sekli olusturup baglar ("Aynisindan" = kaynagin kopyasi)
  addConnected: (from: string, fromSide: Side | '*', shape: Shape | 'same', at: { x: number; y: number }) => void;

  toText: () => string;
  comments?: FComments; // acik dosyadaki # yorumlari (kayitta yerlerine geri yazilir)
  applyText: (text: string) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;

  refreshFiles: () => Promise<void>;
  openFile: (name: string) => Promise<void>;
  newFile: (name: string) => Promise<void>;
  deleteFile: (name: string) => Promise<string | null>;
  fileGone: () => Promise<void>;
  save: () => Promise<void>;
  setLive: (live: boolean) => void;
  showGuide: boolean; // rehber ornegini sema listesinde goster
  setShowGuide: (v: boolean) => void;
  onExternalChange: (name: string) => Promise<void>;
}

export const useFlow = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  dir: '',
  files: [],
  recent: [],
  file: null,
  live: true,
  errors: [],
  current: '',
  disk: '',
  saved: '',
  past: [],
  future: [],
  externalChange: false,
  fitSignal: 0,
  tool: 'select',
  editingId: null,
  placing: null,
  placingColor: 'w',
  placingStroke: undefined,
  setPlacing: (placing) => {
    const color = placing ? newShapeColor(placing) : 'w';
    set({ placing, tool: 'select', placingColor: color, placingStroke: placing ? newStrokeColor(placing, color) : undefined });
  },
  lastDup: null,
  setLastDup: (lastDup) => set({ lastDup }),

  // Ctrl+D: secimi cogaltir. Secim son kopyanin kendisiyse ve tasindiysa, kaynak-kopya arasindaki
  // mesafeyi tekrarlar (Figma'daki gibi); degilse 24 px kaydirir.
  duplicate: () => {
    const s = get();
    const sel = s.nodes.filter((n) => n.selected && !(n.parentId && s.nodes.find((p) => p.id === n.parentId)?.selected)).map((n) => n.id);
    if (!sel.length) return;
    let offset: number | { x: number; y: number } = 24;
    const ld = s.lastDup;
    const same = ld && ld.dup.length === sel.length && ld.dup.every((id) => sel.includes(id));
    if (same && s.nodes.some((n) => n.id === ld.src[0])) {
      const a = absPosition(s.nodes, ld.src[0]);
      const b = absPosition(s.nodes, ld.dup[0]);
      offset = { x: b.x - a.x, y: b.y - a.y };
    }
    const text = s.copyNodes(sel);
    if (!text) return;
    const map = s.paste(text, offset);
    set({ lastDup: { src: sel, dup: sel.map((id) => map.get(id)!).filter(Boolean) } });
  },
  setTool: (tool) => set({ tool }),
  setEditing: (editingId) => set({ editingId }),
  // F: sol paneli gizle / goster (secim hatirlanir)
  entered: null,
  setEntered: (entered) => set({ entered }),
  enteredSets: [],
  setEnteredSets: (enteredSets) => set({ enteredSets }),
  enterGroupAt: (id) => {
    const { nodes, enteredSets: path } = get();
    const sets = nodes.find((n) => n.id === id)?.data.sets ?? [];
    if (!inPath(sets, path) || sets.length <= path.length) return false;
    const next = sets.slice(0, path.length + 1);
    // Girilen grubun icinde, tiklanan nesnenin o andaki birimi (alt grup ya da tek nesne) secili kalir
    const key = sets[next.length];
    set({
      enteredSets: next,
      nodes: nodes.map((n) => {
        const s = n.data.sets ?? [];
        const want = key ? s[next.length] === key && inPath(s, next) : n.id === id;
        return !!n.selected === want ? n : { ...n, selected: want };
      }),
    });
    return true;
  },
  barHidden: (() => { try { return localStorage.getItem('flow-bar-hidden') === '1'; } catch { return false; } })(),
  toggleBar: () => {
    const v = !get().barHidden;
    try { localStorage.setItem('flow-bar-hidden', v ? '1' : '0'); } catch { /* onemsiz */ }
    set({ barHidden: v });
  },

  // Mantiksal grup uyelerinden biri secilince/secimden cikinca hepsi birlikte (Figma grubu)
  onNodesChange: (c) => {
    let nodes = applyNodeChanges(c, get().nodes);
    const want = new Map<string, boolean>();
    let path = get().enteredSets;
    // Girilen grubun disindaki bir nesne secilirse gruptan cikilir
    if (path.length && c.some((ch) => ch.type === 'select' && ch.selected && !inPath(nodes.find((n) => n.id === ch.id)?.data.sets ?? [], path))) {
      path = [];
      set({ enteredSets: path });
    }
    for (const ch of c) {
      if (ch.type !== 'select') continue;
      // Tiklanan nesne, girilen grubun bir alt katmaninin birimi olarak (hic girilmediyse EN DIS grup) birlikte secilir
      const sets = nodes.find((n) => n.id === ch.id)?.data.sets ?? [];
      const key = sets[path.length];
      if (key) for (const n of nodes) if (inPath(n.data.sets ?? [], path) && n.data.sets?.[path.length] === key) want.set(n.id, ch.selected);
    }
    if (want.size) nodes = nodes.map((n) => (want.has(n.id) && !!n.selected !== want.get(n.id) ? { ...n, selected: want.get(n.id) } : n));
    // h "-" ile gelen node olculdu: yuksekligi sabitle (en az 48, 8'in katina yuvarla); kayitta sayi olarak yazilir
    if (c.some((ch) => ch.type === 'dimensions'))
      nodes = nodes.map((n) => {
        const mh = n.measured?.height;
        if (!n.data.autoH || !mh) return n;
        const { autoH: _, ...data } = n.data;
        return { ...n, height: Math.max(48, Math.ceil(mh / 8) * 8), data };
      });
    set({ nodes });
  },
  onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
  // Ayni iki node arasinda birden cok baglanti serbest (FigJam); uclar birakildigi kenara sabitlenir
  onConnect: (c) => {
    if (!c.source || !c.target || c.source === c.target) return;
    set({ edges: [...get().edges, get().newEdge(c.source, c.target, c.sourceHandle as Side, c.targetHandle as Side)] });
  },

  edgeStyle: { color: 'g', kind: 'curve', arrow: true },
  newEdge: (source, target, fromSide, toSide) => {
    const a = isSide(fromSide) ? fromSide : '*';
    const b = isSide(toSide) ? toSide : '*';
    return {
      id: edgeId(), type: 'flow', source, target,
      data: { ...get().edgeStyle, label: '', sides: a === '*' && b === '*' ? undefined : [a, b] },
    };
  },

  addConnected: (from, fromSide, shape, at) => {
    const all = get().nodes;
    const src = all.find((n) => n.id === from);
    const p = planConnected(all, from, shape, at);
    if (!src || !p) return;
    const same = shape === 'same';
    const sh = p.shape;
    const fill = same ? src.data.color : newShapeColor(sh);
    const node: ShapeNode = {
      id: nextId(all), type: 'shape', selected: true,
      position: p.pos,
      width: sh === 'text' ? undefined : p.w, height: sh === 'text' ? undefined : p.h,
      data: same
        ? { ...src.data, text: sh === 'table' ? tableText(parseTable(src.data.text).map((r) => r.map(() => ''))) : '' }
        : { shape: sh, color: fill, stroke: newStrokeColor(sh, fill), text: sh === 'table' ? '||\n||\n||' : '' },
    };
    const toSide = p.toSide;
    set({
      nodes: regroup(parentsFirst([...all.map((x) => (x.selected ? { ...x, selected: false } : x)), node])),
      popIds: [node.id],
      lastShape: sh,
      edges: [...get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)), get().newEdge(from, node.id, fromSide, toSide)],
      editingId: sh === 'group' ? get().editingId : node.id,
    });
  },
  setNodes: (fn) => set({ nodes: fn(get().nodes) }),

  // Kenar noktasindaki + : ayni sekli o yone kopyalar ve baglar (FigJam)
  quickKeys: null,
  startQuickKeys: (prefer, alt) => {
    const s = get();
    const sel = s.nodes.filter((n) => n.selected);
    if (sel.length !== 1 || ['text', 'group', 'table'].includes(sel[0].data.shape) || s.editingId || s.edges.some((e) => e.selected)) return set({ quickKeys: null });
    const n = sel[0];
    // Bos yon: kopyanin oturacagi yer baska bir nesneyle cakismiyor (Section'lar engel sayilmaz)
    const abs = absPosition(s.nodes, n.id);
    const sides = (['r', 'b', 'l', 't'] as Side[]).filter((side) => {
      const q = quickPos(n, side);
      const gx = abs.x + q.pos.x - n.position.x, gy = abs.y + q.pos.y - n.position.y;
      return !s.nodes.some((o) => {
        if (o.id === n.id || o.data.shape === 'group') return false;
        const p = absPosition(s.nodes, o.id);
        const ow = o.width ?? o.measured?.width ?? 0, oh = o.height ?? o.measured?.height ?? 0;
        return p.x < gx + q.w && p.x + ow > gx && p.y < gy + q.h && p.y + oh > gy;
      });
    });
    set({ quickKeys: { node: n.id, sides, alt, side: prefer && sides.includes(prefer) ? prefer : sides.includes('r') ? 'r' : sides[0] ?? null } });
  },
  quickAdd: (id, side, edit = true, alt) => {
    const all = get().nodes;
    const n = all.find((x) => x.id === id);
    if (!n) return;
    const { pos, w, h } = quickPos(n, side, alt?.shape);
    const text = n.data.shape === 'table' ? tableText(parseTable(n.data.text).map((r) => r.map(() => ''))) : '';
    // alt: ayni sekil yerine istenen sekil, varsayilan boyutunda ve onizlemedeki renklerle
    const copy: ShapeNode = alt
      ? {
          id: nextId(all), type: 'shape', position: pos, parentId: n.parentId, selected: true,
          width: alt.shape === 'text' ? undefined : w, height: alt.shape === 'text' ? undefined : h,
          data: { shape: alt.shape, color: alt.color, stroke: alt.stroke, text: alt.shape === 'table' ? '||\n||\n||' : '' },
        }
      : {
          id: nextId(all), type: 'shape', position: pos, width: n.width, height: n.height, parentId: n.parentId,
          zIndex: n.zIndex, selected: true, data: { ...n.data, text },
        };
    // Bos yazi nesnesi duzenlenmezse gorunmez kalir: yazida her zaman duzenlemeye gir
    if (alt?.shape === 'text') edit = true;
    const edge = get().newEdge(n.id, copy.id, side, OPPOSITE[side]);
    set({
      nodes: regroup([...all.map((x) => (x.selected ? { ...x, selected: false } : x)), copy]),
      popIds: [copy.id],
      lastShape: copy.data.shape,
      edges: [...get().edges, edge],
      editingId: edit ? copy.id : get().editingId,
    });
  },

  // Secimi .flow satirlari olarak verir (panoya yazilir; agent'a da yapistirilabilir)
  copySelection: () => get().copyNodes(get().nodes.filter((n) => n.selected).map((n) => n.id)),

  copyNodes: (ids) => {
    const all = get().nodes;
    const sel = new Set(ids);
    if (!sel.size) return null;
    // Secili grubun cocuklari (ic ice gruplar dahil) da gelir
    for (const n of parentsFirst(all)) if (n.parentId && sel.has(n.parentId)) sel.add(n.id);
    const byId = new Map(all.map((n) => [n.id, n]));
    const nodes = all.filter((n) => sel.has(n.id)).map((n) => {
      if (!n.parentId || sel.has(n.parentId)) return n;
      // Grubu kopyalanmayan cocuk mutlak konuma gecer
      const p = byId.get(n.parentId)!.position;
      return { ...n, parentId: undefined, position: { x: n.position.x + p.x, y: n.position.y + p.y } };
    });
    const edges = get().edges.filter((e) => sel.has(e.source) && sel.has(e.target));
    return serializeFlow(fromRF(nodes, edges));
  },

  paste: (text, offset, at, select = true) => {
    const map = new Map<string, string>();
    const { graph } = parseFlow(text);
    let nodes = get().nodes;
    if (!graph.nodes.length) {
      // Duz metin: yazi node'u olur
      const t = text.trim();
      if (!t) return map;
      graph.nodes.push({ id: 'x', shape: 'text', color: 'k', x: 0, y: 0, w: 160, h: 40, text: t });
    }
    // Id'leri yenile, cakisma olmasin
    const taken = [...nodes];
    for (const n of graph.nodes) {
      const id = nextId(taken);
      map.set(n.id, id);
      taken.push({ id } as ShapeNode);
    }
    const top = graph.nodes.filter((n) => !n.parent);
    let dx = typeof offset === 'number' ? offset : offset.x;
    let dy = typeof offset === 'number' ? offset : offset.y;
    if (at && top.length) {
      // Belirli bir noktaya (ekran ortasi) yapistir: sol ust kose oraya gelir
      dx = at.x - Math.min(...top.map((n) => n.x));
      dy = at.y - Math.min(...top.map((n) => n.y));
    }
    const setKeys = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.sets) {
        n.sets = n.sets.map((k) => {
          if (!setKeys.has(k)) setKeys.set(k, newSetKey());
          return setKeys.get(k)!;
        });
      }
      n.id = map.get(n.id)!;
      if (n.parent) n.parent = map.get(n.parent);
      else { n.x += dx; n.y += dy; }
    }
    for (const e of graph.edges) {
      e.from = map.get(e.from)!;
      e.to = map.get(e.to)!;
    }
    const rf = toRF(graph);
    if (select) nodes = nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    const added = rf.nodes.map((n) => ({ ...n, selected: select && !n.parentId }));
    // Gruplar en arkada kalsin
    const groups = added.filter((n) => n.data.shape === 'group');
    const edges = select ? get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)) : get().edges;
    set({
      nodes: regroup(parentsFirst([...groups, ...nodes, ...added.filter((n) => n.data.shape !== 'group')])),
      edges: [...edges, ...rf.edges],
    });
    return map;
  },

  regroupAll: () => {
    const next = regroup(get().nodes);
    if (next !== get().nodes) set({ nodes: next });
  },

  // Figma grubu: secili nesneler birlikte secilir ve tasinir; gorunur bir sey cizilmez. Baglantilar degismez.
  // Gruplar ic ice kurulur: yeni grup en disa eklenir, eski gruplar icinde aynen durur.
  groupSelection: () => {
    const sel = get().nodes.filter((n) => n.selected);
    if (sel.length < 2) return;
    // Secim zaten tek bir grubun tamami ise yeni grup onunla ayni olurdu: bir sey yapma
    const top = sel[0].data.sets?.[0];
    if (top && sel.every((n) => n.data.sets?.[0] === top) && get().nodes.filter((n) => n.data.sets?.[0] === top).length === sel.length) return;
    const key = newSetKey();
    set({ nodes: get().nodes.map((n) => (n.selected ? { ...n, data: { ...n.data, sets: [key, ...(n.data.sets ?? [])] } } : n)) });
    get().commit();
  },

  // Grubu dagitir, SADECE en dis katman: gruplanma sirasinin tersine, bir adim geri (ic gruplar durur)
  ungroupSelection: () => {
    const all = get().nodes;
    const keys = new Set(all.filter((n) => n.selected).map((n) => n.data.sets?.[0]).filter(Boolean));
    if (!keys.size) return;
    set({
      nodes: all.map((n) => {
        const k = n.data.sets?.[0];
        return k && keys.has(k) ? { ...n, data: { ...n.data, sets: n.data.sets!.length > 1 ? n.data.sets!.slice(1) : undefined } } : n;
      }),
    });
    get().commit();
  },

  // FigJam section: secili nesnelerin etrafina gorunur bir bolum cizer. Uyelik geometriden gelir (regroup);
  // baglantilar degismez, hala eski nesnelere bagli kalir.
  sectionSelection: () => {
    const all = get().nodes;
    const sel = all.filter((n) => n.selected);
    if (!sel.length) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of sel) {
      const a = absPosition(all, n.id);
      const w = n.width ?? n.measured?.width ?? DEFAULT_SIZE[n.data.shape][0];
      const h = n.height ?? n.measured?.height ?? DEFAULT_SIZE[n.data.shape][1];
      x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y); x2 = Math.max(x2, a.x + w); y2 = Math.max(y2, a.y + h);
    }
    const PAD = 40;
    const snap = (v: number) => Math.round(v / 8) * 8;
    const gx = snap(x1 - PAD), gy = snap(y1 - PAD);
    const group: ShapeNode = {
      id: nextId(all), type: 'shape', selected: true, zIndex: -1,
      position: { x: gx, y: gy }, width: snap(x2 + PAD) - gx, height: snap(y2 + PAD) - gy,
      data: { shape: 'group', color: 'w', text: nextSectionName(all) },
    };
    set({
      nodes: regroup([...all.map((n) => (n.selected ? { ...n, selected: false } : n)), group]),
      edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    });
    get().commit();
  },

  // Secili section'lari kaldirir; icindekiler (ve ust section varsa onun uyesi olarak) yerinde kalir
  unsectionSelection: () => {
    const all = get().nodes;
    const gone = new Map(all.filter((n) => n.selected && n.data.shape === 'group').map((g) => [g.id, g]));
    if (!gone.size) return;
    const resolve = (g: ShapeNode): { parentId?: string; dx: number; dy: number } => {
      let dx = g.position.x, dy = g.position.y, p = g.parentId;
      while (p && gone.has(p)) {
        const pg = gone.get(p)!;
        dx += pg.position.x; dy += pg.position.y; p = pg.parentId;
      }
      return { parentId: p, dx, dy };
    };
    const next = all.filter((n) => !gone.has(n.id)).map((n) => {
      if (!n.parentId || !gone.has(n.parentId)) return n.selected ? { ...n, selected: false } : n;
      const r = resolve(gone.get(n.parentId)!);
      return { ...n, parentId: r.parentId, selected: true, position: { x: n.position.x + r.dx, y: n.position.y + r.dy } };
    });
    set({ nodes: regroup(next), edges: get().edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) });
    get().commit();
  },

  // Sekil degistir; hap'a donerken kare/dik oran hap gibi gorunsun diye yukseklik hap oranina iner
  changeShape: (ids, shape) => {
    set({
      nodes: get().nodes.map((n) => {
        if (!ids.includes(n.id)) return n;
        const w = n.width ?? n.measured?.width ?? DEFAULT_SIZE[n.data.shape][0];
        const h = n.height ?? n.measured?.height ?? DEFAULT_SIZE[n.data.shape][1];
        let height = n.height;
        if (shape === 'pill' && w / h < 2.5) height = Math.max(40, Math.round(w / 4 / 8) * 8);
        return { ...n, height, data: { ...n.data, shape } };
      }),
    });
    get().regroupAll();
  },

  // rect verilirse (surukleyerek cizim) kutu o boyutta olusur; yoksa varsayilan boyut center'a ortalanir
  addNode: (shape, center, color, stroke, rect) => {
    const k = nextId(get().nodes).slice(1);
    const [dw, dh] = DEFAULT_SIZE[shape];
    const snap = (v: number) => Math.round(v / 8) * 8;
    const sized = rect && shape !== 'text';
    const w = sized ? Math.max(24, snap(rect.w)) : dw;
    const h = sized ? Math.max(24, snap(rect.h)) : dh;
    const node: ShapeNode = {
      id: `n${k}`, type: 'shape', selected: true,
      width: shape === 'text' ? undefined : w, height: shape === 'text' ? undefined : h,
      position: sized ? { x: snap(rect.x), y: snap(rect.y) } : { x: snap(center.x - dw / 2), y: snap(center.y - dh / 2) },
      zIndex: shape === 'group' ? -1 : undefined,
      data: (() => {
        const fill = color ?? newShapeColor(shape);
        return { shape, color: fill, stroke: color ? stroke : newStrokeColor(shape, fill), text: shape === 'table' ? '||\n||\n||' : shape === 'group' ? nextSectionName(get().nodes) : '' };
      })(),
    };
    const others = get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    // Gruplar, cocuklari onunde tanimlanmali; en basa koy
    set({
      nodes: regroup(shape === 'group' ? [node, ...others] : [...others, node]),
      popIds: [node.id],
      lastShape: shape === 'group' ? get().lastShape : shape, // Section R tusunun hatirladigi sekil olmaz
      editingId: shape === 'text' ? node.id : get().editingId,
    });
  },

  // Cizim sirasi = dizi sirasi = dosyadaki satir sirasi
  reorder: (ids, mode) => {
    const all = get().nodes;
    const sel = new Set(ids);
    let next = [...all];
    if (mode === 'front') next = [...all.filter((n) => !sel.has(n.id)), ...all.filter((n) => sel.has(n.id))];
    else if (mode === 'back') next = [...all.filter((n) => sel.has(n.id)), ...all.filter((n) => !sel.has(n.id))];
    else {
      const step = mode === 'up' ? 1 : -1;
      const order = step === 1 ? [...next.keys()].reverse() : [...next.keys()];
      for (const i of order) {
        const j = i + step;
        if (sel.has(next[i].id) && j >= 0 && j < next.length && !sel.has(next[j].id))
          [next[i], next[j]] = [next[j], next[i]];
      }
    }
    set({ nodes: parentsFirst(next) });
  },

  updateNode: (ids, patch) =>
    set({ nodes: get().nodes.map((n) => (ids.includes(n.id) ? { ...n, data: { ...n.data, ...patch } } : n)) }),
  updateEdge: (ids, patch) => {
    const style: Partial<EdgeStyle> = {};
    for (const k of STYLE_KEYS) if (k in patch) (style as Record<string, unknown>)[k] = patch[k];
    set({
      edges: get().edges.map((e) => (ids.includes(e.id) ? { ...e, data: { ...(e.data as FlowEdgeData), ...patch } } : e)),
      ...(Object.keys(style).length ? { edgeStyle: { ...get().edgeStyle, ...style } } : {}),
    });
  },

  lastShape: 'rect',
  popIds: [],
  insertHint: null,
  // Araya ekleme (Blender): A>B baglantisi A>N ve N>B olur. Stil korunur; etiket ve baslangic ucu ilk parcada kalir,
  // uclarin sabit kenarlari kendi tarafinda korunur, bukum sifirlanir.
  splitEdge: (id, nodeId) => {
    const edges = get().edges;
    const i = edges.findIndex((e) => e.id === id);
    const e = edges[i];
    if (!e || e.source === nodeId || e.target === nodeId) return;
    const d = e.data as FlowEdgeData;
    // Kenarlar eklendigi andaki geometriye gore SABITLENIR: nesne tasinirken baglanti noktalari yer degistirmesin.
    // Kaynak ve hedefin onceden sabit kenarlari korunur.
    const nodes = get().nodes;
    const boxOf = (nid: string) => {
      const n = nodes.find((x) => x.id === nid);
      if (!n) return null;
      const p = absPosition(nodes, nid);
      return makeBox(p.x, p.y, n.width ?? n.measured?.width ?? 0, n.height ?? n.measured?.height ?? 0);
    };
    const a = boxOf(e.source), m = boxOf(nodeId), b = boxOf(e.target);
    if (!a || !m || !b) return;
    const [aOut, mIn] = autoSides(a, m);
    const [mOut, bIn] = autoSides(m, b);
    const fixed = (s: Side | '*' | undefined, auto: Side): Side => (s && s !== '*' ? s : auto);
    const first: FlowEdge = { ...e, target: nodeId, selected: false, data: { ...d, bend: undefined, sides: [fixed(d.sides?.[0], aOut), mIn] } };
    const second: FlowEdge = {
      id: edgeId(), type: 'flow', source: nodeId, target: e.target,
      data: { ...d, label: '', start: undefined, bend: undefined, sides: [mOut, fixed(d.sides?.[1], bIn)] },
    };
    set({ edges: [...edges.slice(0, i), first, second, ...edges.slice(i + 1)], insertHint: null });
    get().commit();
  },

  // Bir ucu baska node'a (ya da ayni node'un baska kenarina) tasir
  reconnect: (id, end, nodeId, side, otherSide) =>
    set({
      edges: get().edges.map((e) => {
        if (e.id !== id) return e;
        const other = end === 'source' ? e.target : e.source;
        if (other === nodeId) return e;
        const d = e.data as FlowEdgeData;
        const sides: [Side | '*', Side | '*'] = [...(d.sides ?? ['*', '*'])];
        sides[end === 'source' ? 0 : 1] = side;
        // Tasinmayan uc ekranda gorundugu kenarda kalir (FigJam)
        if (otherSide) sides[end === 'source' ? 1 : 0] = otherSide;
        const keep = sides[0] !== '*' || sides[1] !== '*';
        return { ...e, [end]: nodeId, data: { ...d, sides: keep ? sides : undefined, bend: undefined } };
      }),
    }),

  connectTo: (source, target, fromSide, toSide) => {
    if (source === target) return;
    set({ edges: [...get().edges, get().newEdge(source, target, fromSide, toSide)] });
  },

  toText: () => serializeFlow({ ...fromRF(get().nodes, get().edges), comments: get().comments }),

  applyText: (text) => {
    const { graph, errors } = parseFlow(text);
    set({ ...toRF(graph), errors, comments: graph.comments });
  },

  commit: () => {
    const s = get();
    if (!s.file) return;
    const text = s.toText();
    if (text === s.current) return;
    set({ past: [...s.past, s.current].slice(-100), future: [], current: text });
    if (s.live) void get().save();
  },

  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    s.applyText(prev);
    set({ past: s.past.slice(0, -1), future: [...s.future, s.current], current: get().toText() });
    if (s.live) void get().save();
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const next = s.future[s.future.length - 1];
    s.applyText(next);
    set({ future: s.future.slice(0, -1), past: [...s.past, s.current], current: get().toText() });
    if (s.live) void get().save();
  },

  refreshFiles: async () => {
    const { dir, files, recent, guide } = await api.list();
    // Rehber ornegi (FLOW_GUIDE.flow) normalde listede yok; "Rehber semasini goster" isaretliyse en sona eklenir
    set({ dir, files: get().showGuide && guide ? [...files, GUIDE_FILE] : files, recent });
  },

  // Sema klasorunu degistir; hata mesaji ya da null (iptal/basari) doner
  changeDir: async (req) => {
    const r = await fetch('/api/dir', { method: 'POST', body: JSON.stringify(req) });
    const body = (await r.json()) as { dir?: string; cancelled?: boolean; error?: string };
    if (!r.ok) return body.error ?? 'hata';
    if (body.cancelled || body.dir === get().dir) return null;
    await get().afterDirChange();
    return null;
  },

  afterDirChange: async () => {
    if (get().live && get().current !== get().saved) await get().save();
    await get().refreshFiles();
    const { files } = get();
    const last = localStorage.getItem(`flow-last-file:${get().dir}`);
    const pick = last && files.includes(last) ? last : files[0];
    if (pick) await get().openFile(pick);
    else set({ file: null, nodes: [], edges: [], current: '', saved: '', past: [], future: [], errors: [] });
  },

  openFile: async (name) => {
    const text = await api.read(name);
    get().applyText(text);
    const norm = get().toText();
    set({ file: name, current: norm, saved: norm, disk: text, past: [], future: [], externalChange: false, fitSignal: get().fitSignal + 1 });
    localStorage.setItem('flow-last-file', name);
    localStorage.setItem(`flow-last-file:${get().dir}`, name);
  },

  newFile: async (name) => {
    if (!name.endsWith('.flow')) name += '.flow';
    set({ nodes: [], edges: [], errors: [], comments: undefined });
    const text = get().toText();
    await api.write(name, text);
    set({ file: name, current: text, saved: text, disk: text, past: [], future: [], externalChange: false });
    localStorage.setItem('flow-last-file', name);
    await get().refreshFiles();
  },

  // Windows'ta Geri Donusum Kutusu'na gider. Acik sema silindiyse siradakine gecilir.
  deleteFile: async (name) => {
    if (name === GUIDE_FILE) return 'Rehber dosyasi silinemez (uygulama onu master kopyadan uretir)';
    const r = await fetch(`/api/file?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!r.ok) return (await r.text()) || 'silinemedi';
    if (name === get().file) await get().fileGone();
    else await get().refreshFiles();
    return null;
  },

  fileGone: async () => {
    // Dosya yok; kaydetmeye calismasin
    set({ file: null, current: '', saved: '', disk: '' });
    await get().afterDirChange();
  },

  save: async () => {
    const { file } = get();
    if (!file) return;
    const text = get().toText();
    // Rehber ornegi salt okunur: bu klasordeki dosya master'in kopyasidir ve onunla ayni kalmali.
    // Degisiklik sadece ekranda kalir (yukseklik olcumu dahil), diske yazilmaz.
    if (file === GUIDE_FILE) return set({ saved: text, current: text, externalChange: false });
    await api.write(file, text);
    set({ saved: text, current: text, disk: text, externalChange: false });
  },

  showGuide: (() => { try { return localStorage.getItem('flow-show-guide') === '1'; } catch { return false; } })(),
  setShowGuide: (v) => {
    try { localStorage.setItem('flow-show-guide', v ? '1' : '0'); } catch { /* onemsiz */ }
    set({ showGuide: v });
    void get().refreshFiles();
  },
  setLive: (live) => {
    set({ live });
    localStorage.setItem('flow-live', live ? '1' : '0');
    if (live && get().externalChange && get().file) void get().onExternalChange(get().file!);
    else if (live && get().current !== get().saved) void get().save();
  },

  // Dosya disaridan (agent tarafindan) degisti
  onExternalChange: async (name) => {
    void get().refreshFiles();
    const s = get();
    if (name !== s.file) return;
    if (!s.live && s.current !== s.saved) return set({ externalChange: true });
    let text: string;
    try {
      text = await api.read(name);
    } catch {
      return;
    }
    const before = get().current;
    get().applyText(text);
    const norm = get().toText();
    if (norm === before) return set({ saved: norm, disk: text });
    set({ past: [...get().past, before].slice(-100), future: [], current: norm, saved: norm, disk: text, externalChange: false });
  },
}));

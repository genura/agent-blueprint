// Grup uyeligi geometriden hesaplanir (Figma bolumu gibi): bir node'u TAMAMEN iceren en kucuk grup onun ebeveynidir.
// Kesisme yetmez. Ic ice grup desteklenir; alan kesin buyuk olmali (dongu olusmaz).
import { DEFAULT_SIZE } from './format';
import type { ShapeNode } from './store';

type Rect = { x: number; y: number; w: number; h: number };

const sizeOf = (n: ShapeNode): [number, number] => [
  n.width ?? n.measured?.width ?? (n.data.shape === 'text' ? 0 : DEFAULT_SIZE[n.data.shape][0]),
  n.height ?? n.measured?.height ?? (n.data.shape === 'text' ? 0 : DEFAULT_SIZE[n.data.shape][1]),
];

const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

// Ebeveyn, cocuklarindan once gelmeli (React Flow sarti); diger sira korunur
export function parentsFirst(nodes: ShapeNode[]): ShapeNode[] {
  const out: ShapeNode[] = [];
  const done = new Set<string>();
  let rest = nodes;
  while (rest.length) {
    const later: ShapeNode[] = [];
    for (const n of rest) {
      if (!n.parentId || done.has(n.parentId)) {
        out.push(n);
        done.add(n.id);
      } else later.push(n);
    }
    if (later.length === rest.length) {
      out.push(...later);
      break;
    }
    rest = later;
  }
  return out;
}

// Node'un mutlak (canvas) konumu: ebeveyn zinciri boyunca toplanir
export function absPosition(nodes: ShapeNode[], id: string): { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let n = byId.get(id);
  let x = 0, y = 0;
  const seen = new Set<string>();
  while (n && !seen.has(n.id)) {
    seen.add(n.id);
    x += n.position.x;
    y += n.position.y;
    n = n.parentId ? byId.get(n.parentId) : undefined;
  }
  return { x, y };
}

export function regroup(nodes: ShapeNode[]): ShapeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const absMemo = new Map<string, { x: number; y: number }>();
  const abs = (n: ShapeNode, seen = new Set<string>()): { x: number; y: number } => {
    const m = absMemo.get(n.id);
    if (m) return m;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    let p = n.position;
    if (parent && !seen.has(parent.id)) {
      seen.add(n.id);
      const pp = abs(parent, seen);
      p = { x: pp.x + n.position.x, y: pp.y + n.position.y };
    }
    absMemo.set(n.id, p);
    return p;
  };
  const rect = new Map<string, Rect>(nodes.map((n) => {
    const a = abs(n);
    const [w, h] = sizeOf(n);
    return [n.id, { x: a.x, y: a.y, w, h }];
  }));
  const groups = nodes.filter((n) => n.data.shape === 'group');

  let changed = false;
  const next = nodes.map((n) => {
    if (n.data.pt) return n; // serbest ok ucu: Section'a girmez (konumu hep mutlak)
    const r = rect.get(n.id)!;
    const area = r.w * r.h;
    let best: ShapeNode | undefined;
    let bestArea = Infinity;
    for (const g of groups) {
      if (g.id === n.id) continue;
      const gr = rect.get(g.id)!;
      const ga = gr.w * gr.h;
      if (ga > area && ga < bestArea && inside(r, gr)) {
        best = g;
        bestArea = ga;
      }
    }
    // Mevcut Section'i hala tamamen icine aliyorsa nesne orada kalir: ust uste binen kopya (Ctrl+D, Alt+surukle) baska
    // bir Section'in cocuklarini kendine cekmesin. Yoksa her cogaltmada cocuklar katlanarak artiyordu.
    const cur = n.parentId ? byId.get(n.parentId) : undefined;
    const cr = cur?.data.shape === 'group' ? rect.get(cur.id) : undefined;
    const keep = cr && cr.w * cr.h > area && inside(r, cr);
    const parentId = keep ? cur!.id : best?.id;
    // Ust duzey grup en arkada; ic grup ebeveyninin ustunde cizilsin
    const zIndex = n.data.shape === 'group' ? (parentId ? undefined : -1) : n.zIndex;
    if (parentId === n.parentId && zIndex === n.zIndex) return n;
    changed = true;
    const pa = parentId ? rect.get(parentId)! : { x: 0, y: 0 };
    return { ...n, parentId, zIndex, position: { x: r.x - pa.x, y: r.y - pa.y } };
  });
  return changed ? parentsFirst(next) : nodes;
}

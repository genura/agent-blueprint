// Canvas'i (ya da sadece secimi) PNG/SVG olarak cizer ve sema klasorune kaydeder.
// Kaynak: ekrandaki React Flow DOM'u (html-to-image). Secim cizgileri/tutamaclar goruntuye girmez.
import { getFontEmbedCSS, toPng } from 'html-to-image';
import { buildSvg } from './exportSvg';
import { useFlow } from './store';

export type ExportFormat = 'png' | 'svg';

const PAD = 32; // kenar boslugu (sema pikseli)
const MAX_PX = 8000; // PNG'nin uzun kenari bunu gecmesin

// Tarayicida goruntuye girmeyecek arayuz parcalari
const UI_SKIP = ['react-flow__handle', 'react-flow__resize-control', 'react-flow__viewport-portal', 'quick-ghost', 'edge-bend', 'edge-end'];

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Secim varsa: secili nesneler + secili gruplarin icindekiler + secili baglantilar + iki ucu da secimde olan baglantilar
function pickIds(onlySelected: boolean) {
  const { nodes, edges } = useFlow.getState();
  if (!onlySelected) return { nodes: new Set(nodes.map((n) => n.id)), edges: new Set(edges.map((e) => e.id)) };
  const ns = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const n of nodes) if (n.parentId && ns.has(n.parentId) && !ns.has(n.id)) { ns.add(n.id); grew = true; }
  }
  const es = new Set(edges.filter((e) => e.selected || (ns.has(e.source) && ns.has(e.target))).map((e) => e.id));
  return { nodes: ns, edges: es };
}

export async function exportImage(format: ExportFormat, scale: number, onlySelected: boolean, name: string, embedFonts = true): Promise<string> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas bulunamadi');
  const ids = pickIds(onlySelected);
  if (!ids.nodes.size && !ids.edges.size) throw new Error('Disa aktarilacak bir sey yok');

  // Mavi secim gorunumu goruntuye girmesin: secimi gecici kaldir, cizilince geri koy
  const saved = useFlow.getState();
  useFlow.setState({
    nodes: saved.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    edges: saved.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    editingId: null,
  });
  await nextFrame();
  try {
    // Sinirlar ekrandaki gercek kutulardan (yazi nesneleri, egriler ve etiketler dahil) hesaplanir
    // ekran = kapsayici + kaydirma + sema * zoom
    const m = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
    const box = viewport.parentElement!.getBoundingClientRect();
    const fx = (sx: number) => (sx - box.left - m.e) / m.a;
    const fy = (sy: number) => (sy - box.top - m.f) / m.a;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const grow = (r: DOMRect) => {
      if (!r.width && !r.height) return;
      x1 = Math.min(x1, fx(r.left)); y1 = Math.min(y1, fy(r.top)); x2 = Math.max(x2, fx(r.right)); y2 = Math.max(y2, fy(r.bottom));
    };
    viewport.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => ids.nodes.has(el.dataset.id ?? '') && grow(el.getBoundingClientRect()));
    viewport.querySelectorAll<SVGGElement>('.react-flow__edge').forEach((el) => {
      if (ids.edges.has(el.dataset.id ?? '')) grow(el.querySelector('.react-flow__edge-path')!.getBoundingClientRect());
    });
    viewport.querySelectorAll<HTMLElement>('.edge-label').forEach((el) => ids.edges.has(el.dataset.edge ?? '') && grow(el.getBoundingClientRect()));
    if (!Number.isFinite(x1)) throw new Error('Disa aktarilacak bir sey yok');

    const width = Math.ceil(x2 - x1 + PAD * 2);
    const height = Math.ceil(y2 - y1 + PAD * 2);
    if (format === 'svg') {
      const fontCss = embedFonts ? await getFontEmbedCSS(viewport) : '';
      const svg = buildSvg(viewport, ids, { fx, fy, z: m.a }, { x1, y1, width, height, pad: PAD }, fontCss);
      const file = `${name}.svg`;
      const r = await fetch(`/api/export?name=${encodeURIComponent(file)}`, { method: 'PUT', body: svg });
      if (!r.ok) throw new Error(await r.text());
      return file;
    }
    const ratio = Math.min(scale, MAX_PX / Math.max(width, height));
    const filter = (el: HTMLElement) => {
      const cl = el.classList;
      if (!cl) return true;
      if (UI_SKIP.some((c) => cl.contains(c))) return false;
      if (cl.contains('react-flow__node')) return ids.nodes.has(el.dataset.id ?? '');
      if (cl.contains('react-flow__edge')) return ids.edges.has(el.dataset.id ?? '');
      if (cl.contains('edge-label')) return ids.edges.has(el.dataset.edge ?? '');
      return true;
    };
    const opts = {
      width, height, pixelRatio: ratio, backgroundColor: '#FFFFFF', filter,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${PAD - x1}px, ${PAD - y1}px) scale(1)` },
    };
    const data = await toPng(viewport, opts);

    const file = `${name}.${format}`;
    const r = await fetch(`/api/export?name=${encodeURIComponent(file)}`, { method: 'PUT', body: data });
    if (!r.ok) throw new Error(await r.text());
    return file;
  } finally {
    // Kullanici bu arada baska bir sey secmediyse eski secimi geri koy
    const now = useFlow.getState();
    const sel = new Set([...saved.nodes, ...saved.edges].filter((x) => x.selected).map((x) => x.id));
    if (!now.nodes.some((n) => n.selected) && !now.edges.some((e) => e.selected))
      useFlow.setState({
        nodes: now.nodes.map((n) => (sel.has(n.id) ? { ...n, selected: true } : n)),
        edges: now.edges.map((e) => (sel.has(e.id) ? { ...e, selected: true } : e)),
      });
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, NodeToolbar, Position, ReactFlow, ReactFlowProvider,
  EdgeToolbar, SelectionMode, ViewportPortal, useReactFlow, useStore, useStoreApi,
} from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import type { OnConnectEnd, OnNodeDrag } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';
import { DEFAULT_SIZE, PALETTE_ROWS, newShapeColor, newStrokeColor, nodeColors, parseTable } from './flow/format';
import type { Shape, Side } from './flow/format';
import { QUICK_SHAPES, inPath, useFlow } from './flow/store';
import { FilePicker } from './components/FilePicker';
import { ContextMenu, selectionKind } from './components/ContextMenu';
import type { ContextTarget } from './components/ContextMenu';
import { initHotbar } from './flow/hotbar';
import { absPosition } from './flow/groups';
import { selSig, useTabLabel } from './flow/tabLabel';
import { compactNumber, useTokens } from './flow/useTokens';
import { PanelLeftOpen } from 'lucide-react';
import type { FlowEdge as FlowEdgeT, ShapeNode as ShapeNodeT } from './flow/store';
import { ShapeNode } from './components/ShapeNode';
import { FlowEdge } from './components/FlowEdge';
import { ConnectionLine } from './components/ConnectionLine';
import { ConnectMenu, EdgeBar, LINE_TYPES, MainToolbar, MixedBar, NodeBar, TabChip } from './components/Toolbars';
import type { PendingConnect } from './components/Toolbars';
import { Sidebar } from './components/Sidebar';
import { ShapeGhost } from './components/ShapeGhost';

const nodeTypes = { shape: ShapeNode };
const edgeTypes = { flow: FlowEdge };

// Fare basili bir islem (tasima, boyutlandirma, bukme...) suruyor mu
let gesture = false;
let swallowClick = false;
// Suren Alt+surukle kopyasi: [orijinal, kopya] ciftleri ve gecici yeniden baglanan dis baglantilar
let altDrag: { pairs: [string, string][]; edges: Map<string, { source: string; target: string }> } | null = null;

// Esc: suren islemi oldugu yerde bitir (geri almaz; nesne bulundugu yerde kalir)
function stopGesture() {
  if (!gesture) return;
  gesture = false;
  // React Flow'un surukleme/boyutlandirma islemini bitir, kendi tutamaclarimiza haber ver
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
  window.dispatchEvent(new Event('flowcancel'));
}

// Tab ile yerlestirme araclari arasinda gezinme sirasi (alttaki cubukla ayni)
// Section dongude yok: baglanti kurulamadigi icin sadece arac cubugundan secilir
const PLACE_CYCLE = ['text', 'rect', 'round', 'pill', 'circle', 'diamond', 'db', 'table'] as const;

// Tab ile secim (FigJam):
// - Nesne ve baglanti birlikte seciliyse: sadece baglantilar -> sadece nesneler -> ilk secim -> ... (sonsuz).
//   Baska bir sey secilirse ya da bosa tiklanirsa hafiza silinir.
// - Degilse: nesneler arasinda gezer (yukaridan asagi, soldan saga); Shift+Tab geri.
let tabCycle: { base: { nodes: string[]; edges: string[] }; step: number; sig: string } | null = null;

// En son secili olan nesneler: secim kaldirildiktan sonra Tab buradan devam eder
let lastSelected = new Set<string>();
useFlow.subscribe((s, prev) => {
  if (s.nodes === prev.nodes) return;
  const sel = s.nodes.filter((n) => n.selected);
  if (sel.length) lastSelected = new Set(sel.map((n) => n.id));
});

function tabSelect(back: boolean) {
  const s = useFlow.getState();
  const selNodes = s.nodes.filter((n) => n.selected).map((n) => n.id);
  const selEdges = s.edges.filter((e) => e.selected).map((e) => e.id);
  const apply = (nodes: string[], edges: string[], label = '') => {
    const ns = new Set(nodes), es = new Set(edges);
    useFlow.setState({
      nodes: s.nodes.map((n) => (!!n.selected === ns.has(n.id) ? n : { ...n, selected: ns.has(n.id) })),
      edges: s.edges.map((e) => (!!e.selected === es.has(e.id) ? e : { ...e, selected: es.has(e.id) })),
    });
    const sig = selSig(nodes, edges);
    useTabLabel.setState({ label, sig });
    return sig;
  };

  // Secim, dongunun son biraktigi halden farkliysa (kullanici baska sey sectiyse) yeni dongu
  const sig = selSig(selNodes, selEdges);
  if (!tabCycle || tabCycle.sig !== sig)
    tabCycle = selNodes.length && selEdges.length ? { base: { nodes: selNodes, edges: selEdges }, step: 0, sig } : null;
  if (tabCycle) {
    const { base } = tabCycle;
    // step 0 = ilk hal; 1 = sadece baglantilar; 2 = sadece nesneler
    const states: [string[], string[]][] = [[base.nodes, base.edges], [[], base.edges], [base.nodes, []]];
    tabCycle.step = (tabCycle.step + (back ? 2 : 1)) % 3;
    const labels = [
      `Type: Nodes + Connections (${base.nodes.length + base.edges.length})`,
      `Type: Connections (${base.edges.length})`,
      `Type: Nodes (${base.nodes.length})`,
    ];
    tabCycle.sig = apply(...states[tabCycle.step], labels[tabCycle.step]);
    return;
  }

  // Nesneler arasinda gezinme: okuma sirasi (ust -> alt, sol -> sag)
  // Kapsam: icine girilen Section varsa onun icindekiler; girilen grup varsa o grubun uyeleri.
  // Birim: girilen katmandaki alt grup (hepsi birlikte) ya da tek nesne.
  // Section'a girilmemis olsa bile, secili nesne(ler) tek bir Section'in icindeyse dongu o Section'in icinde doner
  const parents = new Set(s.nodes.filter((n) => n.selected).map((n) => n.parentId));
  const sec = s.entered ?? (parents.size === 1 ? [...parents][0] : undefined);
  const inSection = (id: string) => {
    for (let p = s.nodes.find((n) => n.id === id)?.parentId; p; p = s.nodes.find((n) => n.id === p)?.parentId) if (p === sec) return true;
    return false;
  };
  const path = s.enteredSets;
  const unitOf = (n: (typeof s.nodes)[number]) => n.data.sets?.[path.length] ?? n.id;
  // Section'in kendisi seciliyse (icine girilmemis) dongu disarda doner: ayni katmandaki nesneler, Section icerikleri atlanir
  const outerLevel = !s.entered && s.nodes.find((n) => n.selected && n.data.shape === 'group');
  const scope = s.nodes.filter((n) => (outerLevel ? n.parentId === outerLevel.parentId : !sec || inSection(n.id)) && inPath(n.data.sets ?? [], path));
  const first = new Map<string, { id: string; p: { x: number; y: number } }>();
  for (const n of scope) {
    const p = absPosition(s.nodes, n.id), u = unitOf(n), f = first.get(u);
    if (!f || p.y < f.p.y || (p.y === f.p.y && p.x < f.p.x)) first.set(u, { id: u, p });
  }
  const order = [...first.values()].sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x).map((u) => u.id);
  if (!order.length) {
    if (path.length) { useFlow.getState().setEnteredSets([]); tabSelect(back); } // gecersiz kalan yol (grup dagitildi/dosya degisti)
    return;
  }
  // Secili birimin son uyesinden sonrakine gec
  const idx = scope.filter((n) => n.selected).map((n) => order.indexOf(unitOf(n)));
  const cur = idx.length ? (back ? Math.min(...idx) : Math.max(...idx)) : -1;
  // Hicbir sey secili degilse: en son secili olan nesneden basla (o nesne yeniden secilir); o da yoksa bastan/sondan
  const lastNode = cur < 0 ? scope.find((n) => lastSelected.has(n.id)) : undefined;
  const resume = lastNode ? order.indexOf(unitOf(lastNode)) : -1;
  const next = cur < 0 ? (resume >= 0 ? resume : back ? order.length - 1 : 0) : (cur + (back ? -1 : 1) + order.length) % order.length;
  apply(scope.filter((n) => unitOf(n) === order[next]).map((n) => n.id), []);
}

const inField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select');

// Figma: birden cok secimde hepsini saran tek ince cerceve (tiklamayi engellemez)
function SelectionFrame({ ids }: { ids: string[] }) {
  const rf = useReactFlow();
  useFlow((s) => s.nodes); // konum/boyut degisince yeniden ciz
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of ids) {
    const n = rf.getInternalNode(id);
    if (!n) continue;
    const { x, y } = n.internals.positionAbsolute;
    x1 = Math.min(x1, x); y1 = Math.min(y1, y);
    x2 = Math.max(x2, x + (n.measured.width ?? 0)); y2 = Math.max(y2, y + (n.measured.height ?? 0));
  }
  if (!Number.isFinite(x1)) return null;
  return (
    <ViewportPortal>
      <div className="selection-frame" style={{ transform: `translate(${x1}px, ${y1}px)`, width: x2 - x1, height: y2 - y1 }} />
    </ViewportPortal>
  );
}

// Icine girilen mantiksal grubun siniri: ince kesikli cerceve (tiklamayi engellemez)
function EnteredGroupFrame() {
  const rf = useReactFlow();
  const path = useFlow((s) => s.enteredSets);
  const nodes = useFlow((s) => s.nodes);
  const last = path[path.length - 1];
  if (!last) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    if (!inPath(n.data.sets ?? [], path)) continue;
    const m = rf.getInternalNode(n.id);
    if (!m) continue;
    const { x, y } = m.internals.positionAbsolute;
    x1 = Math.min(x1, x); y1 = Math.min(y1, y);
    x2 = Math.max(x2, x + (m.measured.width ?? 0)); y2 = Math.max(y2, y + (m.measured.height ?? 0));
  }
  if (!Number.isFinite(x1)) return null;
  return (
    <ViewportPortal>
      <div className="entered-group-frame" style={{ transform: `translate(${x1 - 8}px, ${y1 - 8}px)`, width: x2 - x1 + 16, height: y2 - y1 + 16 }} />
    </ViewportPortal>
  );
}

// Birden cok baglanti secili (node yok): ortak cubuk, baglantilarin ustunde ortada
function EdgesBar({ edges }: { edges: FlowEdgeT[] }) {
  const rf = useReactFlow();
  useFlow((s) => s.nodes); // node'lar tasininca yeniden konumlan
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity;
  for (const e of edges) {
    for (const id of [e.source, e.target]) {
      const n = rf.getInternalNode(id);
      if (!n) continue;
      const { x, y } = n.internals.positionAbsolute;
      x1 = Math.min(x1, x); x2 = Math.max(x2, x + (n.measured.width ?? 0)); y1 = Math.min(y1, y);
    }
  }
  if (!Number.isFinite(x1)) return null;
  return (
    <EdgeToolbar edgeId={edges[0].id} x={(x1 + x2) / 2} y={y1 - 36} alignY="bottom" isVisible>
      <div className="tb-wrap">
        <EdgeBar ids={edges.map((e) => e.id)} data={edges[0].data!} />
        <TabChip />
      </div>
    </EdgeToolbar>
  );
}

// Alan secimi baglantilari da secer: cizgisi kareye degen baglanti secilir (Figma).
// React Flow kendi kuralini (secili node'a bagli olanlar) uyguladiktan sonra bu kural ustune yazilir.
// Shift basili alan secimi (FigJam): kare icindekilerin secimi tersine doner (secili degilse eklenir, seciliyse cikar);
// karenin disindaki secim korunur. Taban secim, fare basildigi anda (React Flow secimi silmeden once) alinir.
let marqueeBase: { nodes: Set<string>; edges: Set<string> } | null = null;

type RectNode = { id: string; internals: { positionAbsolute: { x: number; y: number } }; measured: { width?: number; height?: number }; hidden?: boolean };
function selectInRect(rect: { x: number; y: number; width: number; height: number }, [tx, ty, z]: [number, number, number], lookup: Map<string, RectNode>) {
  const x1 = (rect.x - tx) / z, y1 = (rect.y - ty) / z, x2 = x1 + rect.width / z, y2 = y1 + rect.height / z;
  // Nesneler: kareye degen (kismi secim, React Flow ile ayni kural)
  const rectNodes = new Set<string>();
  // Icine girilen Section ve onu iceren Section'lar secilmez (icindekiler secilir)
  const skip = new Set<string>();
  const nodesNow = useFlow.getState().nodes;
  for (let p = useFlow.getState().entered ?? undefined; p; p = nodesNow.find((n) => n.id === p)?.parentId) skip.add(p);
  for (const n of lookup.values()) {
    if (n.hidden || skip.has(n.id)) continue;
    const { x, y } = n.internals.positionAbsolute;
    const w = n.measured.width ?? 0, h = n.measured.height ?? 0;
    if (x < x2 && x + w > x1 && y < y2 && y + h > y1) rectNodes.add(n.id);
  }
  // Mantiksal grubun bir uyesi icerideyse tum grup (en dis grup)
  const st = useFlow.getState();
  // Girilen grup varsa onun disindakiler secilmez; icindeki alt gruplar birim olarak secilir
  const path = st.enteredSets;
  if (path.length) for (const n of st.nodes) if (!inPath(n.data.sets ?? [], path)) rectNodes.delete(n.id);
  const outer = new Set([...rectNodes].map((id) => st.nodes.find((n) => n.id === id)?.data.sets?.[path.length]).filter(Boolean));
  for (const n of st.nodes) if (n.data.sets?.[path.length] && outer.has(n.data.sets[path.length]) && inPath(n.data.sets, path)) rectNodes.add(n.id);
  const inside = (p: { x: number; y: number }) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
  const hit = new Set<string>();
  document.querySelectorAll<SVGGElement>('.react-flow__edge').forEach((el) => {
    const id = el.dataset.id;
    const path = el.querySelector<SVGPathElement>('.react-flow__edge-path');
    if (!id || !path) return;
    const b = path.getBBox();
    if (b.x > x2 || b.x + b.width < x1 || b.y > y2 || b.y + b.height < y1) return;
    const len = path.getTotalLength();
    const step = Math.max(4, len / 200);
    for (let d = 0; d <= len; d += step) if (inside(path.getPointAtLength(d))) return void hit.add(id);
    if (inside(path.getPointAtLength(len))) hit.add(id);
  });
  const base = marqueeBase;
  const wantN = (id: string) => (base ? base.nodes.has(id) !== rectNodes.has(id) : rectNodes.has(id));
  const wantE = (id: string) => (base ? base.edges.has(id) !== hit.has(id) : hit.has(id));
  const { nodes, edges } = useFlow.getState();
  if (nodes.every((n) => !!n.selected === wantN(n.id)) && edges.every((e) => !!e.selected === wantE(e.id))) return;
  useFlow.setState({
    nodes: nodes.map((n) => (!!n.selected === wantN(n.id) ? n : { ...n, selected: wantN(n.id) })),
    edges: edges.map((e) => (!!e.selected === wantE(e.id) ? e : { ...e, selected: wantE(e.id) })),
  });
}

// Sol panel gizliyken alt ortada (arac cubugunun ustunde) panelin durumu ve mini gosterge; tiklayinca panel geri gelir
function BarStatus() {
  const hidden = useFlow((s) => s.barHidden);
  const file = useFlow((s) => s.file);
  const live = useFlow((s) => s.live);
  const dirty = useFlow((s) => s.current !== s.saved);
  const tokens = useTokens();
  if (!hidden || !file) return null;
  return (
    <button className="bar-status" title="Paneli goster (F)" onClick={() => useFlow.getState().toggleBar()}>
      <PanelLeftOpen size={15} />
      <span className="bs-name">{file.replace(/.flow$/, '')}</span>
      <span className="bs-tok">{tokens === null ? '…' : compactNumber(tokens)} token</span>
      <span className={`bs-dot ${dirty ? 'dirty' : live ? 'live' : ''}`} title={dirty ? 'Kaydedilmemis degisiklik' : live ? 'Canli mod acik' : 'Canli mod kapali'} />
      <kbd>F</kbd>
    </button>
  );
}

// Sag altta, mini haritanin hemen ustunde: semadaki oge sayilari ve (varsa) secim
function ItemStats() {
  const sections = useFlow((s) => s.nodes.reduce((k, n) => k + (n.data.shape === 'group' ? 1 : 0), 0));
  const nodes = useFlow((s) => s.nodes.length) - sections;
  const edges = useFlow((s) => s.edges.length);
  const selN = useFlow((s) => s.nodes.reduce((k, n) => k + (n.selected ? 1 : 0), 0));
  const selE = useFlow((s) => s.edges.reduce((k, e) => k + (e.selected ? 1 : 0), 0));
  // Esik uyarisi: ayni semayi agent'a GORSEL olarak vermek kac token eder ve yazilar okunur mu?
  // Gorsel tahmini (Claude kurali): uzun kenar en fazla 1568 px ve toplam ~1.15 megapiksele kucultulur, token = piksel / 750.
  // Yazi: varsayilan 15 px, ayni oranda kuculur; 10 px alti zor, 8 px alti okunmaz sayilir.
  const all = useFlow((s) => s.nodes);
  const flowTok = useTokens();
  const img = useMemo(() => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of all) {
      const p = absPosition(all, n.id);
      const w = n.width ?? n.measured?.width ?? 0, h = n.height ?? n.measured?.height ?? 0;
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + w); y2 = Math.max(y2, p.y + h);
    }
    if (!Number.isFinite(x1)) return null;
    const w = x2 - x1 + 64, h = y2 - y1 + 64; // disa aktarimdaki kenar boslugu dahil
    const f = Math.min(1, 1568 / Math.max(w, h), Math.sqrt(1_150_000 / (w * h)));
    return { tok: Math.round((w * f * h * f) / 750), font: 15 * f };
  }, [all]);
  const level = !img ? '' : img.font < 8 ? 'bad' : img.font < 10 ? 'warn' : 'ok';
  const cheaper = img && flowTok !== null ? (flowTok <= img.tok ? 'flow' : 'img') : null;
  return (
    <div className="item-stats" title="Semadaki oge sayilari. Gorsel satiri bir tahmindir: semayi agent'a resim olarak vermenin token maliyeti (Claude kurali) ve kucultulmus resimde varsayilan yazinin boyutu.">
      <div className="is-row">
        <span><b>{nodes}</b> nesne</span>
        <span><b>{edges}</b> baglanti</span>
        {sections > 0 && <span><b>{sections}</b> section</span>}
      </div>
      <div className="is-row is-sub">
        <span>toplam <b>{nodes + edges + sections}</b></span>
        {selN + selE > 0 && <span className="is-sel">secili <b>{selN + selE}</b></span>}
      </div>
      {img && (
        <div className="is-hint">
          <div className="is-row is-sub">
            <span className={cheaper === 'flow' ? 'is-win' : ''}>flow <b>{flowTok === null ? '…' : compactNumber(flowTok)}</b> tok</span>
            <span className={cheaper === 'img' ? 'is-win' : ''}>gorsel ~<b>{compactNumber(img.tok)}</b> tok</span>
          </div>
          <div className={`is-badge ${level}`}>
            {level === 'ok' ? 'gorselde yazi okunur' : level === 'warn' ? 'gorselde yazi kuculur' : 'gorselde yazi okunmaz'} (~{Math.round(img.font)} px)
          </div>
          {cheaper === 'img' && level !== 'ok' && <div className={`is-level ${level}`}>gorsel ucuz gorunur ama ise yaramaz</div>}
        </div>
      )}
      {flowTok !== null && nodes + edges + sections > 0 && (() => {
        // Agent ayni semayi YAZSAYDI (cikti tokeni): .flow gercek sayi; SVG kaba tahmin (elle yazilan sade SVG:
        // nesne basina ~80, baglanti basina ~55 token + baslik). Sure: ~60 token/sn cikti hizi varsayimi.
        const svgTok = 150 + (nodes + sections) * 80 + edges * 55;
        const secs = (t: number) => (t < 90 ? `${Math.max(1, Math.round(t / 60))} sn` : t < 5400 ? `${Math.round(t / 60)} sn` : `${Math.round(t / 3600)} dk`);
        return (
          <div className="is-hint" title="Agent bu semayi sifirdan yazsaydi harcayacagi cikti tokeni ve suresi. flow: gercek sayi. SVG: kaba tahmin (nesne basina ~80, baglanti basina ~55 token). Sure: saniyede ~60 token varsayimi.">
            <div className="is-cap">agent yazsaydi</div>
            <div className="is-row is-sub">
              <span className="is-win">flow <b>{compactNumber(flowTok)}</b> tok · {secs(flowTok)}</span>
              <span>SVG ~<b>{compactNumber(svgTok)}</b> tok · {secs(svgTok)}</span>
            </div>
            <div className="is-badge">flow ~{Math.max(1, Math.round(svgTok / Math.max(flowTok, 1)))} kat az cikti</div>
          </div>
        );
      })()}
    </div>
  );
}

function Canvas() {
  const nodes = useFlow((s) => s.nodes);
  const edges = useFlow((s) => s.edges);
  // "Ustte" isaretli baglantilar (dosyada ^) tum nesnelerin ustunde cizilir; digerleri React Flow'un varsayilan katmaninda (altta)
  const rfEdges = useMemo(() => edges.map((e) => (e.data?.top ? { ...e, zIndex: 1000 } : e)), [edges]);
  const file = useFlow((s) => s.file);
  const fitSignal = useFlow((s) => s.fitSignal);
  const insertHint = useFlow((s) => s.insertHint);
  // Yeni olusturulan nesne: onizlemedeki "basma" animasyonuyla ayni esnek belirme; bitince isaret temizlenir
  const popIds = useFlow((s) => s.popIds);
  useEffect(() => {
    if (!popIds.length) return;
    const t = setTimeout(() => useFlow.getState().popIds === popIds && useFlow.setState({ popIds: [] }), 450);
    return () => clearTimeout(t);
  }, [popIds]);
  const tool = useFlow((s) => s.tool);
  const placing = useFlow((s) => s.placing);
  const placingColor = useFlow((s) => s.placingColor);
  const placingStroke = useFlow((s) => s.placingStroke);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [ghostPress, setGhostPress] = useState(false); // orta tus basili: onizleme "basilmis" gorunur
  // Surukleyerek cizim: onizleme kutusu (kapsayiciya gore ekran pikseli)
  // Sekil/renk cizim basladigi anda kilitlenir; onizleme ve sonuc hep ayni nesnedir
  const [drawBox, setDrawBox] = useState<{ x: number; y: number; w: number; h: number; shape: Shape; color: string; stroke?: string } | null>(null);
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const selectedNodes = useFlow(useShallow((s) => s.nodes.filter((n) => n.selected)));
  const selectedEdges = useFlow(useShallow((s) => s.edges.filter((e) => e.selected)));
  const multi = selectedNodes.length + selectedEdges.length > 1;
  const connecting = useStore((s) => s.connection.inProgress);
  const dragging = useFlow((s) => s.nodes.some((n) => n.dragging));
  const { onNodesChange, onEdgesChange, onConnect, addNode, setTool } = useFlow.getState();
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  const wrap = useRef<HTMLDivElement>(null);

  // Tutamaclar ekranda sabit boyutta kalsin diye zoom --z olarak CSS'e verilir (bkz. App.css --px)
  useEffect(() => {
    let last = 0;
    const apply = (z: number) => {
      if (z === last || !wrap.current) return;
      last = z;
      wrap.current.style.setProperty('--z', String(z));
    };
    apply(rfStore.getState().transform[2]);
    return rfStore.subscribe((s) => apply(s.transform[2]));
  }, [rfStore]);

  useEffect(() => rfStore.subscribe((s, prev) => {
    if (s.userSelectionActive && s.userSelectionRect && s.userSelectionRect !== prev.userSelectionRect)
      selectInRect(s.userSelectionRect, s.transform, s.nodeLookup as unknown as Map<string, RectNode>);
  }), [rfStore]);

  useEffect(() => {
    if (fitSignal) requestAnimationFrame(() => rf.fitView({ padding: 0.15 }));
  }, [fitSignal, rf]);

  // Sekil yerlestirme modunda (R, O...) fare tekerlegi dolgu rengini palet sirasiyla degistirir (ileri/geri);
  // tuval o sirada kaymaz. Ctrl+tekerlek yine zoom yapar. Yazi, Section ve tablo sade kalir (renk degismez).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const colors = PALETTE_ROWS.join('');
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const s = useFlow.getState();
      if (!s.placing || e.ctrlKey || e.metaKey || !(e.target as HTMLElement).closest('.react-flow')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.buttons || s.placing === 'text' || s.placing === 'group' || s.placing === 'table') return; // cizim surerken renk sabit
      // Dokunmatik yuzey cok kucuk adimlar yollar: bir tekerlek tikine denk gelene kadar biriktir
      acc += e.deltaY;
      if (Math.abs(acc) < 50) return;
      const dir = acc > 0 ? 1 : -1;
      acc = 0;
      const i = colors.indexOf(s.placingColor);
      const color = colors[(Math.max(i, 0) + dir + colors.length) % colors.length];
      // Kenar rengi dolguyla ayni sutuna denk gelirse yenisi secilir, yoksa korunur
      const stroke = s.placingStroke && s.placingStroke !== color.toLowerCase() ? s.placingStroke : newStrokeColor(s.placing, color);
      useFlow.setState({ placingColor: color, placingStroke: stroke });
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  // Figma kisayollari
  useEffect(() => {
    // Shift+0 / 1 / 2: %100 / tumu / secime zoom
    const viewKey = (digit: string) => {
      if (digit === '0') return void rf.zoomTo(1, { duration: 200 });
      if (digit === '2') {
        // Secime zoom: secili nesneler + secili baglantilarin cizgileri (sema koordinatinda)
        const st = useFlow.getState();
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        const grow = (x: number, y: number, w: number, h: number) => {
          x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h);
        };
        for (const n of st.nodes) {
          const m = n.selected ? rf.getInternalNode(n.id) : undefined;
          if (m) grow(m.internals.positionAbsolute.x, m.internals.positionAbsolute.y, m.measured.width ?? 0, m.measured.height ?? 0);
        }
        for (const ed of st.edges) {
          if (!ed.selected) continue;
          const b = document.querySelector<SVGPathElement>(`.react-flow__edge[data-id="${CSS.escape(ed.id)}"] .react-flow__edge-path`)?.getBBox();
          if (b) grow(b.x, b.y, b.width, b.height);
        }
        if (Number.isFinite(x1)) return void rf.fitBounds({ x: x1, y: y1, width: Math.max(x2 - x1, 1), height: Math.max(y2 - y1, 1) }, { padding: 0.25, duration: 250 });
      }
      void rf.fitView({ padding: 0.15, duration: 250 });
    };
    // Shift + numpad 0/1/2 de ayni isi yapar. Windows'ta NumLock acikken Shift+numpad, Shift'i "birakilmis" gosterip
    // tusu gezinme tusuna cevirir (Numpad2 -> ArrowDown, shiftKey=false); bu yuzden hemen onceki Shift birakmasina bakilir.
    // Yakalama asamasi: React Flow ayni tusu ok tusu sanip nesneyi tasimasin.
    let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
    let shiftUpAt = -1;
    const onShiftUpTime = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftUpAt = e.timeStamp; };
    const onShiftNumpad = (e: KeyboardEvent) => {
      const m = /^Numpad([012])$/.exec(e.code);
      if (!m || e.ctrlKey || e.metaKey || e.altKey) return;
      const fakeShift = !/^\d$/.test(e.key) && shiftUpAt >= 0 && e.timeStamp - shiftUpAt < 40;
      if (!e.shiftKey && !fakeShift) return;
      if ((e.target as HTMLElement).closest?.('input, textarea, select, .modal, .fp') || document.querySelector('.table-node.cell-mode')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) viewKey(m[1]);
    };
    window.addEventListener('keyup', onShiftUpTime, true);
    window.addEventListener('keydown', onShiftNumpad, true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const s = useFlow.getState();
      const selected = s.nodes.filter((n) => n.selected);
      const mod = e.ctrlKey || e.metaKey;
      if (e.shiftKey && !mod && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit0')) {
        e.preventDefault();
        viewKey(e.code.slice(-1));
        return;
      }
      if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
        const selEdges = s.edges.filter((x) => x.selected);
        if (!selected.length && !selEdges.length) return;
        e.preventDefault();
        const up = e.code === 'BracketRight';
        if (selected.length) s.reorder(selected.map((n) => n.id), mod ? (up ? 'up' : 'down') : up ? 'front' : 'back');
        // Baglantilarin iki katmani var: ] (ve Ctrl+]) tum nesnelerin ustune, [ (ve Ctrl+[) altina alir
        if (selEdges.length) s.updateEdge(selEdges.map((x) => x.id), { top: up ? true : undefined });
        return;
      }
      // Ctrl+D: cogalt; son kopya tasindiysa ayni mesafeyi tekrarlar (Figma akilli cogaltma)
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicate();
        return;
      }
      // Ctrl+A: tumunu sec (grup cocuklari haric; grup tasininca onlar da gelir)
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        useFlow.setState((st) => ({
          nodes: st.nodes.map((n) => (!!n.selected === !n.parentId ? n : { ...n, selected: !n.parentId })),
          edges: st.edges.map((x) => (x.selected ? x : { ...x, selected: true })),
        }));
        return;
      }
      // Ctrl+G: grupla; Ctrl+Shift+G: grubu dagit (bir katman). Ctrl+Alt+S: section olustur; Ctrl+Shift+S: section'i kaldir
      if (mod && e.code === 'KeyG' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) s.ungroupSelection();
        else s.groupSelection();
        return;
      }
      if (mod && e.code === 'KeyS' && (e.altKey || e.shiftKey)) {
        e.preventDefault();
        if (e.altKey) s.sectionSelection();
        else s.unsectionSelection();
        return;
      }
      // Ctrl+Shift+E: disa aktar (Figma)
      if (mod && e.shiftKey && e.code === 'KeyE') {
        e.preventDefault();
        window.dispatchEvent(new Event('flow-export'));
        return;
      }
      if (mod || e.altKey) return;
      // Hicbir sey secili degilken yon tuslari tuvali kaydirir (FigJam); Shift = buyuk adim
      if (e.key.startsWith('Arrow') && !selected.length && !s.edges.some((x) => x.selected)) {
        e.preventDefault();
        const step = e.shiftKey ? 240 : 80;
        const v = rf.getViewport();
        const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        void rf.setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom }, e.repeat ? undefined : { duration: 120 });
        return;
      }
      // Nesne secili ama klavye odagi nesnede degil (Tab, alan secimi, Ctrl+A ile secildi): React Flow ok tuslarini
      // yalniz odaktaki nesnede isler, bu yuzden tasimayi burada yap. Odak nesnedeyse React Flow tasir (cift tasima olmaz).
      if (e.key.startsWith('Arrow') && selected.length && !(e.target as HTMLElement).closest('.react-flow__node')) {
        e.preventDefault();
        const step = e.shiftKey ? 32 : 8;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const sel = new Set(selected.map((n) => n.id));
        // Secili bir Section'in icindekiler onunla birlikte gider: ayrica tasinmaz
        const underSelected = (n: ShapeNodeT) => {
          for (let p = n.parentId; p; p = s.nodes.find((x) => x.id === p)?.parentId) if (sel.has(p)) return true;
          return false;
        };
        s.setNodes((all) => all.map((n) => (n.selected && !underSelected(n) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
        clearTimeout(nudgeTimer);
        nudgeTimer = setTimeout(() => useFlow.getState().regroupAll(), 300);
        return;
      }
      // Baglanti cizilirken (surukleme suruyor) Tab: baglanti turunu degistirir; normal modda Tab asagidaki islerine devam eder
      if (e.key === 'Tab' && rfStore.getState().connection.inProgress) {
        e.preventDefault();
        const cur = LINE_TYPES.findIndex((t) => t.kind === s.edgeStyle.kind && t.arrow === s.edgeStyle.arrow);
        const next = LINE_TYPES[(cur + (e.shiftKey ? LINE_TYPES.length - 1 : 1)) % LINE_TYPES.length];
        useFlow.setState({ edgeStyle: { ...s.edgeStyle, kind: next.kind, arrow: next.arrow } });
        return;
      }
      if (e.key === 'Tab' && s.placing) {
        e.preventDefault();
        const i = PLACE_CYCLE.indexOf(s.placing as (typeof PLACE_CYCLE)[number]);
        const n = PLACE_CYCLE.length;
        s.setPlacing(PLACE_CYCLE[(i + (e.shiftKey ? -1 : 1) + n) % n]);
        return;
      }
      if (e.key === 'Tab' && !mod) {
        e.preventDefault();
        tabSelect(e.shiftKey);
        return;
      }
      if (e.key === 'f' || e.key === 'F') s.toggleBar();
      else if (e.key === 'v' || e.key === 'V') { s.setPlacing(null); setTool('select'); }
      else if (e.key === 'h' || e.key === 'H') { s.setPlacing(null); setTool('hand'); }
      else if (e.key === 't' || e.key === 'T') s.setPlacing('text');
      // R: yerlestirme yoksa en son olusturulan sekil (ilk seferde kutu); varsa ayni aracin rengini yeniden rastgele sec
      else if (e.key === 'r' || e.key === 'R') s.setPlacing(s.placing ?? s.lastShape);
      else if (e.key === 'o' || e.key === 'O') s.setPlacing('circle');
      // Enter / F2: secili tek nesnenin yazisini (ya da tek baglantinin etiketini) duzenle
      else if ((e.key === 'Enter' || e.key === 'F2') && selected.length === 1) {
        e.preventDefault();
        s.setEditing(selected[0].id);
      } else if ((e.key === 'Enter' || e.key === 'F2') && !selected.length) {
        const ed = s.edges.filter((x) => x.selected);
        if (ed.length === 1) {
          e.preventDefault();
          s.setEditing(`edge:${ed[0].id}`);
        }
      } else if (e.key === 'Escape') {
        // Oncelik: suren islemi iptal et > yerlestirmeyi birak > secimi kaldir
        if (gesture) return stopGesture();
        if (s.placing) {
          s.setPlacing(null);
          setGhost(null);
          return;
        }
        if (s.enteredSets.length) s.setEnteredSets([]);
        s.setNodes((all) => all.map((n) => (n.selected ? { ...n, selected: false } : n)));
        s.onEdgesChange(s.edges.filter((ed) => ed.selected).map((ed) => ({ id: ed.id, type: 'select', selected: false })));
      }
    };
    // Kopyala / kes / yapistir: pano icerigi .flow satirlari
    let lastCopied = '';
    let pasteCount = 0;
    const onCopy = (e: ClipboardEvent) => {
      if (inField(e.target)) return;
      const t = useFlow.getState().copySelection();
      if (!t || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', t);
      lastCopied = t;
      pasteCount = 0;
    };
    const onCut = (e: ClipboardEvent) => {
      onCopy(e);
      if (!e.defaultPrevented) return;
      const s = useFlow.getState();
      const sel = new Set(s.nodes.filter((n) => n.selected).map((n) => n.id));
      const gone = new Set(s.nodes.filter((n) => sel.has(n.id) || (n.parentId && sel.has(n.parentId))).map((n) => n.id));
      useFlow.setState({
        nodes: s.nodes.filter((n) => !gone.has(n.id)),
        edges: s.edges.filter((x) => !x.selected && !gone.has(x.source) && !gone.has(x.target)),
      });
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target)) return;
      const t = e.clipboardData?.getData('text/plain');
      if (!t) return;
      e.preventDefault();
      const s = useFlow.getState();
      if (t === lastCopied) s.paste(t, 24 * ++pasteCount);
      else {
        // Disaridan gelen (agent'in verdigi .flow satirlari ya da duz yazi): ekranin ortasina
        const r = wrap.current!.getBoundingClientRect();
        s.paste(t, 0, rf.screenToFlowPosition({ x: r.left + r.width / 2 - 100, y: r.top + r.height / 2 - 60 }));
      }
    };
    const onUp = () => {
      gesture = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    // Ctrl+ok (FigJam): secili nesneleri boyutlandir; sol ust kose sabit. Sag/Sol = genislik +/-, Asagi/Yukari = yukseklik +/-;
    // Shift = buyuk adim. Yakalama asamasinda: React Flow'un ok tusuyla tasimasi ayni tusta calismasin.
    const onResizeKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !e.key.startsWith('Arrow')) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, .modal, .fp') || document.querySelector('.table-node.cell-mode')) return;
      const s = useFlow.getState();
      if (!s.nodes.some((n) => n.selected && n.data.shape !== 'text')) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 40 : 8;
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
      const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
      const snap = (v: number) => Math.round(v / 8) * 8;
      s.setNodes((all) => all.map((n) => {
        if (!n.selected || n.data.shape === 'text') return n;
        const w = n.width ?? n.measured?.width ?? 0, h = n.height ?? n.measured?.height ?? 0;
        const grid = n.data.shape === 'table' ? parseTable(n.data.text) : null;
        const minW = n.data.shape === 'group' ? 80 : grid ? grid[0].length * 40 : 24;
        const minH = n.data.shape === 'group' ? 60 : grid ? grid.length * 28 : 24;
        return { ...n, width: dx ? Math.max(minW, snap(w + dx)) : w, height: dy ? Math.max(minH, snap(h + dy)) : h };
      }));
      setTimeout(() => useFlow.getState().regroupAll(), 0);
    };
    // Shift birakildi: vurgulanan baglanti varsa nesne hemen araya girer (surukleme surer, baglantilar nesneyi izler)
    const onShiftUp = (e: KeyboardEvent) => {
      const hint = useFlow.getState().insertHint;
      if (e.key === 'Shift' && hint) useFlow.getState().splitEdge(hint.edge, hint.node);
    };
    window.addEventListener('keyup', onShiftUp);
    // Ctrl + / - / 0 (FigJam): yakinlas / uzaklas / %100. Tarayicinin kendi sayfa zoom'u yerine tuval zoom'u; yazi alaninda da gecerli.
    const onZoomKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key, c = e.code;
      const act = k === '+' || k === '=' || c === 'NumpadAdd' ? 'in' : k === '-' || k === '_' || c === 'NumpadSubtract' ? 'out' : (k === '0' || c === 'Numpad0') && !e.shiftKey ? 'reset' : null;
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      if (document.querySelector('.modal-backdrop')) return;
      if (act === 'in') void rf.zoomIn({ duration: 150 });
      else if (act === 'out') void rf.zoomOut({ duration: 150 });
      else void rf.zoomTo(1, { duration: 200 });
    };
    // Ctrl+Alt+Shift basili (FigJam hizli eklemenin klavye hali): secili nesnenin bos yonlerinde baglantili kopya onizlemeleri
    // gorunur. Ok tuslari yonu secer, Enter o yonde nesneyi olusturur ve secim ona gecer (tuslar basiliyken zincir kurulabilir).
    // Uc tustan biri birakilinca onizlemeler kapanir.
    const ARROW_SIDE: Record<string, Side> = { ArrowRight: 'r', ArrowLeft: 'l', ArrowUp: 't', ArrowDown: 'b' };
    // Arti / eksi (ust sira ya da numpad): secili yonde olusacak nesnenin seklini sirayla degistirir (QUICK_SHAPES);
    // her geciste renk yeniden rastgele secilir ve onizlemede gorunur. Diger yonlerin onizlemesi degismez.
    const quickCycle = (dir: 1 | -1) => {
      const st = useFlow.getState();
      const qk = st.quickKeys;
      const cur = qk && (qk.alt?.shape ?? st.nodes.find((n) => n.id === qk.node)?.data.shape);
      if (!qk || !qk.side || !cur) return;
      const n = QUICK_SHAPES.length;
      const shape = QUICK_SHAPES[(QUICK_SHAPES.indexOf(cur) + dir + n) % n];
      const color = newShapeColor(shape);
      useFlow.setState({ quickKeys: { ...qk, alt: { shape, color, stroke: newStrokeColor(shape, color) } } });
    };
    // Klavye duzenine gore degisir: once uretilen karaktere, sonra numpad'e, en son tusun fiziksel yerine bakilir
    const plusMinus = (e: KeyboardEvent): 1 | -1 | 0 =>
      e.key === '+' ? 1 : e.key === '-' || e.key === '_' ? -1
        : e.code === 'NumpadAdd' ? 1 : e.code === 'NumpadSubtract' ? -1
          : e.code === 'Equal' ? 1 : e.code === 'Minus' ? -1 : 0;
    const onQuickKeys = (e: KeyboardEvent) => {
      const st = useFlow.getState();
      const trio = e.ctrlKey && e.altKey && e.shiftKey;
      if (e.type === 'keyup' || !trio) {
        if (st.quickKeys && !trio) quickOff();
        return;
      }
      if (document.querySelector('.modal-backdrop') || (e.target as HTMLElement).closest?.('input, textarea, select')) return;
      // Baslangicta ya da secim bu arada degistiyse (onizleme baska nesnede kaldiysa) yeniden kur
      if (!st.quickKeys || !st.nodes.some((n) => n.id === st.quickKeys!.node && n.selected)) {
        st.startQuickKeys();
        if (!useFlow.getState().quickKeys) return;
      }
      const qk = useFlow.getState().quickKeys!;
      const side = ARROW_SIDE[e.key];
      const step = plusMinus(e);
      if (step) {
        e.preventDefault();
        e.stopPropagation();
        quickCycle(step);
      } else if (side) {
        e.preventDefault();
        e.stopPropagation();
        if (qk.sides.includes(side)) useFlow.setState({ quickKeys: { ...qk, side } });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || !qk.side) return;
        st.quickAdd(qk.node, qk.side, false, qk.alt);
        // Yeni nesne secili: onizlemeler ona gore yenilenir, ayni yon bossa secili kalir
        useFlow.getState().startQuickKeys(qk.side);
      }
    };
    function quickOff() { if (useFlow.getState().quickKeys) useFlow.setState({ quickKeys: null }); }
    window.addEventListener('keydown', onQuickKeys, true);
    window.addEventListener('keyup', onQuickKeys, true);
    window.addEventListener('blur', quickOff);
    window.addEventListener('keydown', onZoomKey, true);
    window.addEventListener('keydown', onResizeKey, true);
    window.addEventListener('paste', onPaste);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('keyup', onShiftUp);
      window.removeEventListener('keyup', onShiftUpTime, true);
      window.removeEventListener('keydown', onShiftNumpad, true);
      window.removeEventListener('keydown', onQuickKeys, true);
      window.removeEventListener('keyup', onQuickKeys, true);
      window.removeEventListener('blur', quickOff);
      window.removeEventListener('keydown', onZoomKey, true);
      window.removeEventListener('keydown', onResizeKey, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('pointerup', onUp);
    };
  }, [rf, rfStore, setTool]);

  // Arac secili: tikla = varsayilan boyutta birak; basili tutup surukle = o anda cizmeye basla (kose -> imlec)
  const startPlace = (e: React.PointerEvent, shape: Shape) => {
    const box = wrap.current!.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const [dw, dh] = DEFAULT_SIZE[shape];
    const st0 = useFlow.getState();
    const color = st0.placingColor, stroke = st0.placingStroke; // cizim boyunca sabit
    let drawing = false;
    let finished = false;
    let last = { x: sx, y: sy, shift: e.shiftKey };
    // Kose (sx,sy) -> imlec. Shift basiliyken sekil varsayilan oranini korur (kare sekillerde kare); birakinca serbest
    const geom = () => {
      let w = Math.abs(last.x - sx), h = Math.abs(last.y - sy);
      if (last.shift) {
        const r = dw / dh;
        w = Math.max(w, h * r);
        h = w / r;
      }
      return { x: last.x >= sx ? sx : sx - w, y: last.y >= sy ? sy : sy - h, w, h };
    };
    const show = () => {
      const g = geom();
      setDrawBox({ x: g.x - box.left, y: g.y - box.top, w: g.w, h: g.h, shape, color, stroke });
    };
    const stop = () => {
      finished = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      setDrawBox(null);
      // Tiklama olayi gelmediyse (surukleme) bir sonraki gercek tiklama yutulmasin
      setTimeout(() => { swallowClick = false; }, 0);
    };
    const cancel = () => {
      if (finished) return;
      stop();
      useFlow.getState().setPlacing(null);
    };
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
      if (!drawing && Math.hypot(last.x - sx, last.y - sy) < 4) return;
      drawing = true;
      setGhost(null);
      show();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && ev.type === 'keydown') {
        ev.stopPropagation();
        cancel();
      } else if (ev.key === 'Shift') {
        // Imlec durdugunda da Shift'e basinca/birakinca anlik guncellensin
        last = { ...last, shift: ev.type === 'keydown' };
        if (drawing) show();
      } else if (ev.type === 'keydown' && ev.key !== 'Control' && ev.key !== 'Alt' && ev.key !== 'Meta') {
        // Cizim surerken arac/renk kisayollari (R, Tab, O, T, V, H...) yoksayilir: sekil ve renk degismez
        ev.stopPropagation();
        ev.preventDefault();
      }
    };
    const up = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
      const g = geom();
      stop();
      const st = useFlow.getState();
      if (drawing && shape !== 'text') {
        const a = rf.screenToFlowPosition({ x: g.x, y: g.y });
        const z = rf.getZoom();
        addNode(shape, a, color, stroke, { x: a.x, y: a.y, w: g.w / z, h: g.h / z });
      } else {
        const p = rf.screenToFlowPosition({ x: sx, y: sy });
        if (shape === 'text') addNode('text', { x: p.x + 76, y: p.y + 4 });
        else addNode(shape, p, color, stroke);
      }
      st.setPlacing(null);
      setGhost(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
  };
  // Yerlestirme modu: tikla = birak; diger her basista Esc icin durum fotografi
  const onPointerDownCapture = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.react-flow') || t.closest('.react-flow__panel, .react-flow__node-toolbar, .react-flow__edge-toolbar')) return;
    // Bos alanda Shift'le basildi: alan secimi mevcut secimi tersine cevirecek; tabani simdi al
    if (t.classList.contains('react-flow__pane') && e.shiftKey && e.button === 0) {
      const st = useFlow.getState();
      marqueeBase = { nodes: new Set(st.nodes.filter((n) => n.selected).map((n) => n.id)), edges: new Set(st.edges.filter((x) => x.selected).map((x) => x.id)) };
    } else if (t.classList.contains('react-flow__pane')) marqueeBase = null;
    const s = useFlow.getState();
    if (s.placing && e.button === 0) {
      e.stopPropagation();
      e.preventDefault();
      swallowClick = true;
      startPlace(e, s.placing);
      return;
    }
    gesture = true;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!placing) return;
    const r = wrap.current!.getBoundingClientRect();
    setGhost({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  // Orta tusla (ya da Space ile) kaydirirken de onizleme imleci izlesin: kaydirma, fare hareketini yakalama asamasinda
  // yutar ve yukaridaki onMouseMove'a ulasmaz; bu yuzden bir tus basiliyken hareketi pencereden, ondan once dinle.
  useEffect(() => {
    if (!placing) return;
    const follow = (e: MouseEvent) => {
      if (!e.buttons) return;
      const r = wrap.current?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      setGhost({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    // Orta tus basili: onizleme hafifce kuculur; birakinca esnek bir sekilde eski boyutuna doner (basma hissi)
    const press = (e: PointerEvent) => { if (e.button === 1) setGhostPress(e.type === 'pointerdown'); };
    const release = () => setGhostPress(false);
    window.addEventListener('mousemove', follow, true);
    window.addEventListener('pointermove', follow, true);
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('pointerup', press, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mousemove', follow, true);
      window.removeEventListener('pointermove', follow, true);
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('pointerup', press, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', release);
      setGhostPress(false);
    };
  }, [placing]);

  // Baglanti birakma (FigJam): nokta uzerine -> o kenar (onConnect), node govdesine -> en yakin kenar,
  // bos alana -> sekil menusu. Ayni iki node arasinda birden cok baglanti serbest.
  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (state.isValid || !state.fromNode) return;
    const p = 'changedTouches' in event ? event.changedTouches[0] : event;
    const from = state.fromNode.id;
    const fromSide = (state.fromHandle?.id ?? '*') as Side | '*';
    const hits = document.elementsFromPoint(p.clientX, p.clientY) as HTMLElement[];
    const el = hits.map((x) => x.closest<HTMLElement>('.react-flow__node')).find(Boolean);
    const at = rf.screenToFlowPosition({ x: p.clientX, y: p.clientY });
    if (el?.dataset.id) {
      if (el.dataset.id === from) return;
      const n = rf.getInternalNode(el.dataset.id);
      if (!n) return;
      const { x, y } = n.internals.positionAbsolute;
      const w = n.measured.width ?? 0, h = n.measured.height ?? 0;
      const d: [Side, number][] = [['l', Math.abs(at.x - x)], ['r', Math.abs(at.x - x - w)], ['t', Math.abs(at.y - y)], ['b', Math.abs(at.y - y - h)]];
      const side = d.sort((a, b) => a[1] - b[1])[0][0];
      useFlow.getState().connectTo(from, el.dataset.id, fromSide, side);
      return;
    }
    if (!hits.some((x) => x.classList.contains('react-flow__pane'))) return;
    const r = wrap.current!.getBoundingClientRect();
    setPending({ from, fromSide, at, screen: { x: p.clientX - r.left, y: p.clientY - r.top } });
  };

  const closePending = useCallback(() => setPending(null), []);
  // Sag tik menusu: baglam o anki secimden cikar (bosa tik = tuval). Tarayicinin kendi menusu acilmaz.
  const [context, setContext] = useState<ContextTarget | null>(null);
  const closeContext = useCallback(() => setContext(null), []);
  const openContext = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    if (useFlow.getState().placing) return;
    setContext({ ...selectionKind(), x: e.clientX, y: e.clientY });
  };

  // Tasima bitince: tamamen bir grubun icine giren node o gruba girer, cikan cikar (ic ice gruplar dahil)
  const onNodeDragStop: OnNodeDrag<ShapeNodeT> = () => {
    finishAltDrag();
    // Shift hala basiliyken birakildi: vurgulanan baglantinin arasina gir
    const hint = useFlow.getState().insertHint;
    if (hint) useFlow.getState().splitEdge(hint.edge, hint.node);
    setTimeout(() => useFlow.getState().regroupAll(), 0);
  };

  // Shift + surukle (Blender node editoru): baglantisiz tek bir nesne bir baglantinin ustune gelince baglanti ve nesnenin
  // baglanti noktalari vurgulanir; Shift birakilinca (ya da nesne birakilinca) nesne araya girer: A>B -> A>N, N>B.
  const onNodeDrag: OnNodeDrag<ShapeNodeT> = (e, node, dragged) => {
    const s = useFlow.getState();
    const setHint = (h: { edge: string; node: string } | null) => {
      if (h?.edge !== s.insertHint?.edge || h?.node !== s.insertHint?.node) useFlow.setState({ insertHint: h });
    };
    const shift = 'shiftKey' in e && e.shiftKey;
    if (!shift || altDrag || dragged.length !== 1 || node.data.shape === 'group' || s.edges.some((x) => x.source === node.id || x.target === node.id))
      return setHint(null);
    const n = rf.getInternalNode(node.id);
    if (!n) return setHint(null);
    const { x, y } = n.internals.positionAbsolute;
    const w = n.measured.width ?? 0, h = n.measured.height ?? 0;
    const cx = x + w / 2, cy = y + h / 2;
    // Nesnenin kutusundan gecen baglantilardan, merkeze en yakin gecen secilir
    let best: string | null = null, bestD = Infinity;
    document.querySelectorAll<SVGGElement>('.react-flow__edge').forEach((el) => {
      const id = el.dataset.id;
      const path = el.querySelector<SVGPathElement>('.react-flow__edge-path');
      if (!id || !path) return;
      const b = path.getBBox();
      if (b.x > x + w || b.x + b.width < x || b.y > y + h || b.y + b.height < y) return;
      const len = path.getTotalLength();
      const step = Math.max(4, len / 200);
      for (let d = 0; d <= len; d += step) {
        const p = path.getPointAtLength(d);
        if (p.x < x || p.x > x + w || p.y < y || p.y > y + h) continue;
        const dist = Math.hypot(p.x - cx, p.y - cy);
        if (dist < bestD) { bestD = dist; best = id; }
      }
    });
    setHint(best ? { edge: best, node: node.id } : null);
  };

  // Alt + surukle (FigJam): baglantili orijinal yerinde kalir, baglantisiz kopya tasinir.
  // Id'ler sabit kalsin diye: suruklerken React Flow orijinali tasir; dis baglantilar gecici olarak
  // yerinde duran kopyaya baglanir. Birakinca ikisinin yeri degisir ve baglantilar orijinale doner.
  const onNodeDragStart: OnNodeDrag<ShapeNodeT> = (e, _n, dragged) => {
    if (!e.altKey) return;
    const s = useFlow.getState();
    const ids = dragged.map((d) => d.id);
    const text = s.copyNodes(ids);
    if (!text) return;
    const map = s.paste(text, 0, undefined, false);
    const moving = new Set(ids);
    const edges = new Map<string, { source: string; target: string }>();
    useFlow.setState({
      edges: useFlow.getState().edges.map((ed) => {
        const sIn = moving.has(ed.source), tIn = moving.has(ed.target);
        if (sIn === tIn) return ed; // ic baglantilar zaten kopyalandi; disaridakilere dokunma
        edges.set(ed.id, { source: ed.source, target: ed.target });
        return { ...ed, source: sIn ? map.get(ed.source) ?? ed.source : ed.source, target: tIn ? map.get(ed.target) ?? ed.target : ed.target };
      }),
    });
    altDrag = { pairs: ids.map((id) => [id, map.get(id)!] as [string, string]).filter((p) => p[1]), edges };
  };

  function finishAltDrag() {
    const ad = altDrag;
    if (!ad) return;
    altDrag = null;
    const { nodes, edges } = useFlow.getState();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const swap = new Map<string, ShapeNodeT>();
    for (const [orig, copy] of ad.pairs) {
      const o = byId.get(orig), c = byId.get(copy);
      if (!o || !c) continue;
      // Orijinal (ayni id, baglantilariyla) eski yerine; kopya birakilan yere ve secili
      swap.set(orig, { ...o, position: c.position, parentId: c.parentId, selected: false, dragging: false });
      swap.set(copy, { ...c, position: o.position, parentId: o.parentId, selected: true });
    }
    useFlow.setState({
      nodes: nodes.map((n) => swap.get(n.id) ?? n),
      edges: edges.map((ed) => {
        const back = ad.edges.get(ed.id);
        return back ? { ...ed, ...back } : ed;
      }),
    });
    // Ctrl+D: orijinal -> tasinan kopya mesafesini tekrarlar
    useFlow.getState().setLastDup({ src: ad.pairs.map((p) => p[0]), dup: ad.pairs.map((p) => p[1]) });
  }

  return (
    <main className={`canvas tool-${tool} ${placing ? 'placing' : ''} ${multi ? 'multi-select' : ''} ${connecting ? 'connecting' : ''}`} ref={wrap}
      onContextMenu={(e) => {
        // React Flow'un yakalamadigi yerler (baglanti etiketi, tutamaclar vb.): yine kendi menumuz, o anki secimle
        if (!e.defaultPrevented && (e.target as HTMLElement).closest('.react-flow')) openContext(e);
      }}
      onDoubleClickCapture={(e) => {
        // Gruba ait nesneye cift tik: grubun bir katman icine gir (yazi duzenleme yerine); en ic katmanda normal davranis
        const id = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id;
        if (tool === 'select' && id && useFlow.getState().enterGroupAt(id)) e.stopPropagation();
      }}
      onPointerDownCapture={onPointerDownCapture} onClickCapture={onClickCapture} onMouseMove={onMouseMove}
      onMouseLeave={() => setGhost(null)}>
      {file ? (
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onPaneContextMenu={(e) => openContext(e)}
          onSelectionContextMenu={(e) => openContext(e)}
          onNodeContextMenu={(e, n) => {
            // Secili olmayan nesneye sag tik: once onu sec (grubuyla birlikte), sonra menuyu ac
            if (!n.selected) {
              const st = useFlow.getState();
              useFlow.setState({
                nodes: st.nodes.map((x) => (x.selected ? { ...x, selected: false } : x)),
                edges: st.edges.map((x) => (x.selected ? { ...x, selected: false } : x)),
              });
              useFlow.getState().onNodesChange([{ id: n.id, type: 'select', selected: true }]);
            }
            openContext(e);
          }}
          onEdgeContextMenu={(e, ed) => {
            if (!ed.selected) {
              const st = useFlow.getState();
              useFlow.setState({
                nodes: st.nodes.map((x) => (x.selected ? { ...x, selected: false } : x)),
                edges: st.edges.map((x) => (x.selected !== (x.id === ed.id) ? { ...x, selected: x.id === ed.id } : x)),
              });
            }
            openContext(e);
          }}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={['Delete', 'Backspace']}
          snapToGrid
          snapGrid={[8, 8]}
          minZoom={0.1}
          maxZoom={4}
          // Figma davranisi: tekerlek kaydirir, Ctrl+tekerlek zoom, Space+surukle / orta tus kaydirir
          panOnScroll
          zoomOnDoubleClick={false}
          elevateNodesOnSelect={false}
          selectionMode={SelectionMode.Partial}
          connectOnClick={false}
          // Baglanti cizerken: kalin, kesikli, yari saydam
          connectionLineComponent={ConnectionLine}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => { tabCycle = null; if (useFlow.getState().enteredSets.length) useFlow.getState().setEnteredSets([]); }}
          connectionRadius={36}
          onEdgeDoubleClick={(_e, ed) => useFlow.getState().setEditing(`edge:${ed.id}`)}
          selectionOnDrag={tool === 'select'}
          panOnDrag={tool === 'hand' ? true : [1]}
          nodesDraggable={tool === 'select'}
          nodesConnectable={tool === 'select'}
          elementsSelectable={tool !== 'hand'}
          multiSelectionKeyCode="Shift"
        >
          <EnteredGroupFrame />
          {popIds.length > 0 && (
            <style>{`${popIds.map((id) => `.react-flow__node[data-id="${CSS.escape(id)}"] > :is(.shape-node, .group-node, .table-node)`).join(', ')} { animation: node-pop 0.38s cubic-bezier(0.34, 1.7, 0.5, 1); }`}</style>
          )}
          {insertHint && (
            <style>{`
              .react-flow__edge[data-id="${CSS.escape(insertHint.edge)}"] .react-flow__edge-path { stroke: var(--select) !important; }
              .react-flow__node[data-id="${CSS.escape(insertHint.node)}"] .side-handle {
                opacity: 1; width: calc(16 * var(--px)); height: calc(16 * var(--px));
                border: calc(2 * var(--px)) solid var(--select); background: var(--select); box-shadow: 0 0 0 calc(1 * var(--px)) #fff;
              }
            `}</style>
          )}
          {selectedNodes.length > 1 && <SelectionFrame ids={selectedNodes.map((n) => n.id)} />}
          <NodeToolbar nodeId={selectedNodes.map((n) => n.id)} isVisible={selectedNodes.length > 0 && !dragging && !connecting && !pending}
            position={Position.Top} offset={44}>
            {selectedNodes.length > 0 && (
              <div className="tb-wrap">
                {selectedEdges.length ? <MixedBar nodes={selectedNodes} edges={selectedEdges} /> : <NodeBar nodes={selectedNodes} />}
                <TabChip />
              </div>
            )}
          </NodeToolbar>
          {!selectedNodes.length && selectedEdges.length > 1 && !dragging && <EdgesBar edges={selectedEdges} />}
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#C9C9C9" bgColor="#F5F5F5" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => nodeColors((n as ShapeNodeT).data.color).fill} />
        </ReactFlow>
      ) : (
        <div className="empty">Soldan bir sema sec ya da yeni sema olustur.</div>
      )}
      {file && <MainToolbar />}
      {file && <BarStatus />}
      {file && <ItemStats />}
      {pending && <ConnectMenu pending={pending} onClose={closePending} />}
      {context && <ContextMenu target={context} onClose={closeContext} />}
      {drawBox && (
        <div className="place-ghost" style={{ left: drawBox.x, top: drawBox.y }}>
          <ShapeGhost shape={drawBox.shape} color={drawBox.color} stroke={drawBox.stroke} w={Math.max(drawBox.w, 1)} h={Math.max(drawBox.h, 1)} />
        </div>
      )}
      {placing && ghost && !drawBox && (() => {
        const z = rf.getZoom();
        const [w, h] = DEFAULT_SIZE[placing];
        const left = placing === 'text' ? ghost.x : ghost.x - (w * z) / 2;
        const top = placing === 'text' ? ghost.y - 4 * z : ghost.y - (h * z) / 2;
        return (
          <div className={`place-ghost hover-ghost ${ghostPress ? 'press' : ''}`} style={{ left, top }}>
            <ShapeGhost shape={placing} color={placingColor} stroke={placingStroke} w={w * z} h={h * z} />
          </div>
        );
      })()}
    </main>
  );
}

export default function App() {
  useEffect(() => initHotbar(), []);
  useEffect(() => {
    const s = useFlow.getState();
    const live = localStorage.getItem('flow-live');
    if (live) useFlow.setState({ live: live === '1' });
    s.refreshFiles().then(() => {
      const { files } = useFlow.getState();
      const last = localStorage.getItem('flow-last-file');
      const pick = last && files.includes(last) ? last : files[0];
      if (pick) void useFlow.getState().openFile(pick);
    });

    // Degisiklikler durulunca gecmise yaz (canli modda diske de)
    let timer: ReturnType<typeof setTimeout>;
    const unsub = useFlow.subscribe((st, prev) => {
      if (st.nodes === prev.nodes && st.edges === prev.edges) return;
      clearTimeout(timer);
      timer = setTimeout(() => useFlow.getState().commit(), 400);
    });

    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { file?: string; deleted?: boolean; dirChanged?: string };
      // Klasor baska bir sekmeden degistirildi
      if (msg.dirChanged) {
        if (msg.dirChanged !== useFlow.getState().dir) void useFlow.getState().afterDirChange();
        return;
      }
      // Acik sema disaridan silindiyse siradakine gec
      if (msg.file && msg.deleted) {
        if (msg.file === useFlow.getState().file) void useFlow.getState().fileGone();
        else void useFlow.getState().refreshFiles();
        return;
      }
      if (msg.file) void useFlow.getState().onExternalChange(msg.file);
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const st = useFlow.getState();
      if (k === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        st.commit();
        void st.save();
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.commit();
        useFlow.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        st.redo();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      unsub();
      clearTimeout(timer);
      es.close();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <FilePicker />
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
    </div>
  );
}

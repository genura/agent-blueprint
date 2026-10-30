import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ChevronDown, ChevronUp, GripVertical, Search, X } from 'lucide-react';
import { useFlow } from '../flow/store';
import { absPosition } from '../flow/groups';
import { foldQuery, searchItems, storeItems } from '../flow/search';

// Ctrl+F / F3: sema ici arama kutusu (FigJam). Tuvalin sag ustunde, her seyin ustunde durur; arka plan bulanmaz ve
// tuval kullanilmaya devam eder. Tutup tasinir, yeri hatirlanir. Eslesen kelimeler nesnelerin icinde rozetlenir
// (RichText/Hl): gezilen oge turuncu, digerleri sari; eslesmeyen ogeler solar. Arama mantigi: flow/search.ts
const POS_KEY = 'flow-search-pos';
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hitEl = (key: string) =>
  document.querySelector<HTMLElement>(
    key.startsWith('n:') ? `.react-flow__node[data-id="${CSS.escape(key.slice(2))}"]` : `.edge-label[data-edge="${CSS.escape(key.slice(2))}"]`,
  );

export function SearchBox() {
  const rf = useReactFlow();
  const open = useFlow((s) => s.searchOpen);
  const q = useFlow((s) => s.searchQ);
  const fq = useFlow((s) => s.searchFq);
  const cur = useFlow((s) => s.searchCur);
  const nodes = useFlow((s) => s.nodes);
  const edges = useFlow((s) => s.edges);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(POS_KEY) ?? 'null'); } catch { return null; }
  });

  // Eslesenler, okuma sirasiyla: yukaridan asagi, sonra soldan saga (baglanti: iki ucunun ortasi)
  const hits = useMemo(() => {
    if (!open || !fq) return [];
    const mid = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const p = absPosition(nodes, n.id);
      mid.set(n.id, { x: p.x + (n.width ?? n.measured?.width ?? 0) / 2, y: p.y + (n.height ?? n.measured?.height ?? 0) / 2 });
    }
    const at = (kind: string, id: string) => {
      if (kind === 'node') return mid.get(id) ?? { x: 0, y: 0 };
      const e = edges.find((x) => x.id === id);
      const a = e && mid.get(e.source), b = e && mid.get(e.target);
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
    };
    return searchItems(storeItems(nodes, edges), fq)
      .map((h) => ({ ...h, p: at(h.kind, h.id) }))
      .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  }, [open, fq, nodes, edges]);
  const sig = hits.map((h) => h.key).join(' ');
  const idx = hits.findIndex((h) => h.key === cur);
  const live = useRef({ hits, idx });
  live.current = { hits, idx };

  // Ogeyi ekrana getir: zaten rahat gorunuyorsa kipirdatma; degilse yumusak bir gecisle ortala. Cok uzaksa okunur
  // bir zoom'a yaklas, ekrana sigmiyorsa sigacak kadar uzaklas.
  const travel = (key: string) => {
    const el = hitEl(key), wrap = boxRef.current?.closest<HTMLElement>('.canvas');
    if (!el || !wrap) return;
    const r = el.getBoundingClientRect(), c = wrap.getBoundingClientRect(), b = boxRef.current!.getBoundingClientRect();
    const z = rf.getZoom();
    const inside = r.left >= c.left + 48 && r.right <= c.right - 48 && r.top >= c.top + 48 && r.bottom <= c.bottom - 48;
    const underBox = r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
    if (inside && !underBox && z >= 0.5) return;
    const center = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const fit = Math.min((c.width * 0.6) / (r.width / z), (c.height * 0.6) / (r.height / z));
    const zoom = Math.max(0.1, Math.min(Math.max(z, 0.75), fit, 4));
    void rf.setCenter(center.x, center.y, { zoom, duration: 520, ease, interpolate: 'smooth' });
  };
  const step = (dir: 1 | -1) => {
    const { hits: h, idx: i } = live.current;
    if (!h.length) return;
    const next = h[(i + dir + h.length) % h.length] ?? h[0];
    useFlow.setState({ searchCur: next.key });
    travel(next.key);
  };

  // Sorgu degisince (yazarken kisa bir bekleme ile) ilk eslesmeye git; gezilen oge hala eslesiyorsa yerinde kal.
  // Sema degisip gezilen oge eslesmez olursa sadece isaret tasinir, ekran oynamaz.
  const lastFq = useRef('');
  useEffect(() => {
    const typed = lastFq.current !== fq;
    const t = setTimeout(() => {
      lastFq.current = fq;
      const { hits: h, idx: i } = live.current;
      if (i >= 0) return;
      useFlow.setState({ searchCur: h[0]?.key ?? null });
      if (h[0] && typed) travel(h[0].key);
    }, typed ? 160 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fq, sig]);

  const focusInput = () => { inputRef.current?.focus(); inputRef.current?.select(); };
  const close = (select = true) => {
    const { hits: h, idx: i } = live.current;
    const hit = h[i];
    useFlow.setState({ searchOpen: false, searchFq: '', searchCur: null });
    if (!hit || !select) return;
    // Bulunan oge secili kalir: aramadan cikar cikmaz uzerinde calisilabilir
    const st = useFlow.getState();
    useFlow.setState({
      nodes: st.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      edges: st.edges.map((e) => (!!e.selected !== (hit.kind === 'edge' && e.id === hit.id) ? { ...e, selected: !e.selected } : e)),
    });
    if (hit.kind === 'node') {
      useFlow.getState().onNodesChange([{ id: hit.id, type: 'select', selected: true }]);
      requestAnimationFrame(() => hitEl(hit.key)?.focus({ preventScroll: true }));
    }
  };

  // Ctrl+F: ac / kutuya don. F3: ac, aciksa sonraki (Shift+F3 onceki). Tarayicinin kendi aramasi acilmaz.
  const act = useRef({ step, focusInput, close });
  act.current = { step, focusInput, close };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tuvalde Esc: iptal edilecek baska bir sey yoksa (secim, duzenleme, yerlestirme, icine girilmis grup) kutuyu kapatir.
      // Kutunun icindeki Esc kendi isleyicisindedir.
      if (e.key === 'Escape') {
        const s = useFlow.getState();
        if (!s.searchOpen || (e.target as HTMLElement).closest?.('input, textarea, select') || document.querySelector('.modal-backdrop, .fp, .ctx-menu')) return;
        if (s.editingId || s.placing || s.entered || s.enteredSets.length || s.nodes.some((n) => n.selected) || s.edges.some((x) => x.selected)) return;
        return act.current.close(false);
      }
      const f3 = e.key === 'F3';
      const cf = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyF';
      if ((!f3 && !cf) || document.querySelector('.modal-backdrop, .fp')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const s = useFlow.getState();
      if (!s.searchOpen) return useFlow.setState({ searchOpen: true, searchFq: foldQuery(s.searchQ) });
      if (cf || !s.searchFq) act.current.focusInput();
      else act.current.step(e.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Arama modu tuvalde baska bir ise gecilince biter: tuvale sol tik, ya da bir seyin secilmesi (nisangahla Enter, Tab vb.).
  // Orta tusla kaydirma ve tekerlek aramayi bozmaz. Bu yolla kapaninca gezilen oge secilmez; kullanicinin secimi kalir.
  const anySel = useFlow((s) => s.nodes.some((n) => n.selected) || s.edges.some((e) => e.selected));
  useEffect(() => {
    if (anySel && useFlow.getState().searchOpen) act.current.close(false);
  }, [anySel]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (e.button === 0 && t.closest?.('.canvas') && !t.closest('.search-box')) act.current.close(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Acilinca: yazmaya hazir. Kutu tasinmis ve yarisindan fazlasi tuvalin disinda kalmissa varsayilan yerine doner.
  useLayoutEffect(() => {
    if (!open) return;
    focusInput();
    const b = boxRef.current?.getBoundingClientRect(), c = boxRef.current?.closest('.canvas')?.getBoundingClientRect();
    if (!pos || !b || !c) return;
    const w = Math.min(b.right, c.right) - Math.max(b.left, c.left), h = Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top);
    if (w <= 0 || h <= 0 || w * h < b.width * b.height * 0.5) {
      setPos(null);
      try { localStorage.removeItem(POS_KEY); } catch { /* yok say */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tuvale "arama suruyor" isareti: eslesmeyenleri solduran kurallar buna baglidir (App.css)
  useEffect(() => {
    const wrap = document.querySelector<HTMLElement>('.canvas');
    if (!wrap || !hits.length) return;
    wrap.dataset.search = '1';
    return () => { delete wrap.dataset.search; };
  }, [hits.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const onDragDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('input, button')) return;
    const box = boxRef.current!, c = box.closest('.canvas')!.getBoundingClientRect(), b = box.getBoundingClientRect();
    const dx = e.clientX - b.left, dy = e.clientY - b.top;
    let last = { x: b.left - c.left, y: b.top - c.top };
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      last = { x: Math.round(ev.clientX - dx - c.left), y: Math.round(ev.clientY - dy - c.top) };
      setPos(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem(POS_KEY, JSON.stringify(last)); } catch { /* yok say */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const curSel = cur ? (cur.startsWith('n:') ? `.react-flow__node[data-id="${CSS.escape(cur.slice(2))}"]` : `.edge-label[data-edge="${CSS.escape(cur.slice(2))}"]`) : '';
  const hitEdges = hits.filter((h) => h.kind === 'edge').map((h) => `.react-flow__edge[data-id="${CSS.escape(h.id)}"]`);
  return (
    <div ref={boxRef} className={`search-box ${fq && !hits.length ? 'none' : ''}`} style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}
      onPointerDown={onDragDown} title="Tutup tasiyabilirsin">
      {hits.length > 0 && (
        <style>{`
          ${hitEdges.length ? `${hitEdges.join(', ')} { opacity: 1 !important; }` : ''}
          ${curSel ? `${curSel} { --hl-bg: #ff9a3c; --hl-ring: #ffd9b3; --hl-anim: hl-pop; }` : ''}
        `}</style>
      )}
      <GripVertical size={14} className="sb-grip" />
      <Search size={15} className="sb-icon" />
      <input ref={inputRef} value={q} placeholder="Semada ara" spellCheck={false}
        onChange={(e) => useFlow.setState({ searchQ: e.target.value, searchFq: foldQuery(e.target.value) })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        }} />
      <span className="sb-count">{!fq ? '' : hits.length ? `${idx + 1} / ${hits.length}` : 'sonuc yok'}</span>
      <button title="Onceki (Shift+Enter / Shift+F3)" disabled={!hits.length} onClick={() => step(-1)}><ChevronUp size={16} /></button>
      <button title="Sonraki (Enter / F3)" disabled={!hits.length} onClick={() => step(1)}><ChevronDown size={16} /></button>
      <button title="Kapat (Esc)" onClick={() => close()}><X size={15} /></button>
    </div>
  );
}

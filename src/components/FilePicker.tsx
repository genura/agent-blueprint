import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePlus2, FileText, Search } from 'lucide-react';
import { useFlow } from '../flow/store';
import { DeleteDialog } from './Sidebar';
import { fontCss, nodeColors, parseFlow } from '../flow/format';
import type { FNode } from '../flow/format';

// F9: hizli sema secici. Liste + arama; yon tuslariyla gezilir (canvas degismez), Enter acar.
// Esc: liste odakliysa aramaya git; arama doluysa sil; bossa kapat.

const cache = new Map<string, string>(); // dosya adi -> okunan metin (liste her acilista temizlenir)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const H = (n: FNode) => (n.h > 0 ? n.h : 48);

function nodeSvg(n: FNode, abs: { x: number; y: number }) {
  const c = nodeColors(n.color, n.shape, n.stroke);
  const h = H(n), w = n.w, { x, y } = abs;
  const sw = n.shape === 'group' || n.shape === 'table' ? 1 : 2;
  const common = `fill="${c.fill}" stroke="${c.stroke}" stroke-width="${sw}"${n.dash ? ' stroke-dasharray="10 7"' : ''}`;
  let shape = '';
  if (n.shape === 'circle') shape = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common}/>`;
  else if (n.shape === 'diamond') shape = `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${common}/>`;
  else if (n.shape === 'text') shape = '';
  else shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.shape === 'pill' ? h / 2 : n.shape === 'round' ? Math.min(w, h) * 0.3 : 4}" ${common}/>`;
  let text = '';
  if (n.shape === 'table') {
    const rows = n.text.split('\n');
    const cols = Math.max(1, ...rows.map((r) => r.split(/(?<!\\)\|/).length));
    for (let i = 1; i < rows.length; i++) text += `<line x1="${x}" x2="${x + w}" y1="${y + (h * i) / rows.length}" y2="${y + (h * i) / rows.length}" stroke="${c.stroke}"/>`;
    for (let i = 1; i < cols; i++) text += `<line y1="${y}" y2="${y + h}" x1="${x + (w * i) / cols}" x2="${x + (w * i) / cols}" stroke="${c.stroke}"/>`;
  } else if (n.text) {
    const size = n.shape === 'text' ? 20 : n.shape === 'group' ? 16 : 15;
    const lines = n.text.replace(/\\n/g, '\n').split('\n').slice(0, 6);
    const lh = size * 1.25;
    const left = n.align === 'l' || (!n.align && (n.shape === 'text' || n.text.includes('\n')));
    const top = n.shape === 'group' ? y + size + 8 : y + h / 2 - (lines.length * lh) / 2 + size * 0.85;
    lines.forEach((l, i) => {
      text += `<text x="${left || n.shape === 'group' ? x + 10 : x + w / 2}" y="${top + i * lh}" font-size="${size}" fill="${n.shape === 'group' ? '#777' : c.text}" text-anchor="${left || n.shape === 'group' ? 'start' : 'middle'}" font-family="${esc(fontCss(n.font))}">${esc(l.slice(0, 40))}</text>`;
    });
  }
  return shape + text;
}

// Disk dosyasindan hafif bir onizleme: sekiller + duz baglanti cizgileri (canvas'a dokunmaz)
function previewSvg(text: string): string {
  const { graph } = parseFlow(text);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const abs = (n: FNode) => {
    let x = n.x, y = n.y;
    for (let p = n.parent ? byId.get(n.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) { x += p.x; y += p.y; }
    return { x, y };
  };
  if (!graph.nodes.length) return '';
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const pos = new Map(graph.nodes.map((n) => [n.id, abs(n)]));
  for (const n of graph.nodes) {
    const p = pos.get(n.id)!;
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + n.w); y2 = Math.max(y2, p.y + H(n));
  }
  const pad = 30;
  const groups = graph.nodes.filter((n) => n.shape === 'group');
  const rest = graph.nodes.filter((n) => n.shape !== 'group');
  const ctr = (id: string) => { const n = byId.get(id)!, p = pos.get(id)!; return { x: p.x + n.w / 2, y: p.y + H(n) / 2 }; };
  const edges = graph.edges.filter((e) => byId.has(e.from) && byId.has(e.to)).map((e) => {
    const a = ctr(e.from), b = ctr(e.to);
    const col = nodeColors(e.color).fill === 'transparent' ? '#666' : nodeColors(e.color).fill;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    // Ok ucu hedef kutunun kenarinda degil merkezine yakin kalir; kutu ustte cizildigi icin kenarda gorunur
    const tn = byId.get(e.to)!, k = Math.min(tn.w / 2 / Math.max(Math.abs(Math.cos(ang)), 1e-3), H(tn) / 2 / Math.max(Math.abs(Math.sin(ang)), 1e-3));
    const tip = e.arrow ? `<polygon points="0,0 -14,-6 -14,6" transform="translate(${b.x - Math.cos(ang) * k} ${b.y - Math.sin(ang) * k}) rotate(${(ang * 180) / Math.PI})" fill="${col}"/>` : '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="2"/>${tip}`;
  });
  // Ok uclari kutularin ustunde kalsin: once cizgiler (kutular kapatir), uc isaretleri en sonda
  const lines = edges.map((s) => s.replace(/<polygon[^>]*\/>/, '')).join('');
  const tips = edges.map((s) => s.match(/<polygon[^>]*\/>/)?.[0] ?? '').join('');
  const body = groups.map((n) => nodeSvg(n, pos.get(n.id)!)).join('') + lines + rest.map((n) => nodeSvg(n, pos.get(n.id)!)).join('') + tips;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function FilePicker() {
  const [open, setOpen] = useState(false);
  const files = useFlow((s) => s.files);
  const current = useFlow((s) => s.file);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null); // silme onayi bekleyen dosya
  const [svg, setSvg] = useState<string | null>(null); // null: yukleniyor, '': bos / okunamadi
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => !q || f.toLowerCase().includes(q));
  }, [files, query]);
  const name = shown[Math.min(sel, shown.length - 1)];

  const close = () => setOpen(false);
  const choose = async (f: string | undefined) => {
    if (!f) return;
    const s = useFlow.getState();
    if (f !== s.file) {
      if (!s.live && s.current !== s.saved && !confirm('Kaydedilmemis degisiklikler kaybolacak. Devam?')) return;
      close();
      await s.openFile(f);
    } else close();
  };

  // Son tutumu cagirmak icin guncel degerleri ref'te tut (window dinleyicisi bir kez baglanir)
  const live = useRef({ query, shown, sel, choose });
  live.current = { query, shown, sel, choose };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => {
          if (!o && useFlow.getState().file === null && !useFlow.getState().files.length) return o;
          if (!o) { cache.clear(); setQuery(''); void useFlow.getState().refreshFiles(); }
          return !o;
        });
        return;
      }
      if (!openRef.current) return;
      // Ustte baska bir pencere varsa tuslar onundur: odagi geri calma
      if ((e.target as HTMLElement | null)?.closest?.('.modal')) return;
      const L = live.current;
      const inInput = (e.target as HTMLElement | null)?.closest?.('input') === inputRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!inInput) inputRef.current?.focus();
        else if (L.query) setQuery('');
        else setOpen(false);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const n = L.shown.length;
        if (n) setSel((i) => (Math.min(i, n - 1) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      } else if (e.key === 'Delete' && (!inInput || inputRef.current!.selectionStart === inputRef.current!.value.length)) {
        // Delete: secili semayi sil (ayni onay penceresi). Arama kutusunda silinecek karakter varsa normal metin duzenlemesi kalir.
        e.preventDefault();
        e.stopPropagation();
        const f = L.shown[Math.min(L.sel, L.shown.length - 1)];
        if (f) setDeleting(f);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        void L.choose(L.shown[Math.min(L.sel, L.shown.length - 1)]);
      } else if (!inInput) {
        // Liste odaktayken yazilan harf aramaya gider; canvas kisayollari calismasin
        e.stopPropagation();
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) inputRef.current?.focus();
      }
    };
    // Yeni sema penceresi acilirken (dugme ya da Alt+N) secici kapanir
    const onNew = () => setOpen(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('flow-new', onNew);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('flow-new', onNew);
    };
  }, []);
  const openRef = useRef(false);
  openRef.current = open;

  // Acilinca: arama kutusuna odaklan, secili satir = acik sema
  useEffect(() => {
    if (!open) return;
    setSel(Math.max(0, useFlow.getState().files.indexOf(useFlow.getState().file ?? '')));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('.fp-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel, shown, open]);

  // Onizleme: secili dosyayi diskten oku (kisa gecikmeyle; yon tusuna basili tutarken her satira istek atma)
  useEffect(() => {
    if (!open || !name) { setSvg(''); return; }
    let dead = false;
    setSvg(null);
    const t = setTimeout(async () => {
      try {
        let text = cache.get(name);
        if (text === undefined) {
          const r = await fetch(`/api/file?name=${encodeURIComponent(name)}`);
          if (!r.ok) throw new Error();
          text = await r.text();
          cache.set(name, text);
        }
        if (!dead) setSvg(previewSvg(text));
      } catch {
        if (!dead) setSvg('');
      }
    }, 60);
    return () => { dead = true; clearTimeout(t); };
  }, [open, name]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      {deleting && (
        <DeleteDialog name={deleting} onClose={() => {
          cache.delete(deleting);
          setDeleting(null);
          requestAnimationFrame(() => inputRef.current?.focus());
        }} />
      )}
      <div className="fp" role="dialog" aria-modal="true" aria-label="Sema sec">
        <div className="fp-left">
          <label className="fp-search">
            <Search size={16} />
            <input ref={inputRef} value={query} placeholder="Sema ara..." spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="fp-list" ref={listRef} tabIndex={0} role="listbox">
            {shown.map((f, i) => (
              <div key={f} role="option" aria-selected={i === sel} className={`fp-item ${i === sel ? 'sel' : ''}`}
                onMouseDown={() => { setSel(i); requestAnimationFrame(() => listRef.current?.focus()); }}
                onDoubleClick={() => void choose(f)}>
                <FileText size={15} />
                <span className="fp-name">{f.replace(/\.flow$/, '')}</span>
                {f === current && <span className="fp-cur">active</span>}
              </div>
            ))}
            {!shown.length && <div className="fp-empty">Sonuc yok</div>}
          </div>
          <button className="fp-new" onClick={() => window.dispatchEvent(new Event('flow-new'))}>
            <FilePlus2 size={17} />Yeni sema <kbd>Alt+N</kbd>
          </button>
          <div className="fp-hint"><kbd>↑↓</kbd> gez <kbd>Enter</kbd> ac <kbd>Esc</kbd> geri/kapat</div>
        </div>
        <div className="fp-preview">
          {svg ? <div className="fp-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="fp-empty">{svg === null ? '...' : name ? 'Onizleme yok' : ''}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

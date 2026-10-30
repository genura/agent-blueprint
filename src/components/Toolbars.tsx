import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Circle, Database, Diamond, Frame, Hand, Link, List,
  Group, MousePointer2, Pill, Square, SquareRoundCorner, Strikethrough, SquareDashed, Table, Trash2, Type, Undo2, Ungroup, Unlink,
} from 'lucide-react';
import { selSig, useTabLabel } from '../flow/tabLabel';
import { CAPS, CAP_NAMES, DASH, FONTS, PALETTE, PALETTE_ROWS, SIZE_NAMES, WEIGHT_NAMES, colorHex, defaultFontSize, defaultWeight, nodeColors, parseTable, tableText } from '../flow/format';
import { CAP_GEOM, edgeCaps } from '../flow/caps';
import type { Align, Cap, EdgeKind, Font, Shape, Side, Size } from '../flow/format';
import { hasList, hasMark, toggleList, toggleMark } from '../flow/markup';
import type { Mark } from '../flow/markup';
import { planConnected, useFlow } from '../flow/store';
import { absPosition } from '../flow/groups';
import { NORMAL, buildPath } from '../flow/edgeGeom';
import { ViewportPortal } from '@xyflow/react';
import { ShapeGhost } from './ShapeGhost';
import type { FlowEdgeData, ShapeNode } from '../flow/store';

const SHAPE_ICON: Record<Shape, ReactNode> = {
  rect: <Square size={18} />, round: <SquareRoundCorner size={18} />, pill: <Pill size={18} />,
  circle: <Circle size={18} />, diamond: <Diamond size={18} />, db: <Database size={18} />,
  text: <Type size={18} />, group: <Frame size={18} />, table: <Table size={18} />,
};
const SHAPE_NAMES: Record<Shape, string> = {
  rect: 'Kutu (R)', round: 'Yuvarlak kutu', pill: 'Hap', circle: 'Daire (O)', diamond: 'Elmas',
  db: 'Veritabani', text: 'Yazi (T)', group: 'Section', table: 'Tablo',
};
const BASIC: Shape[] = ['rect', 'round', 'pill', 'circle', 'diamond', 'db'];

// ---------- Ortak parcalar ----------

// Secim her degistiginde (baska nesne/baglanti secildi, secime ekleme/cikarma yapildi, nesne cubugu <-> karisik cubuk)
// cubuk yatay kayarak gelir. Yon: cubuk ekranda saga gittiyse soldan, sola gittiyse sagdan girer (gidis yonunde kayar);
// yeri degismediyse oge sayisi arttiysa sagdan, azaldiysa soldan. Ilk belirmede CSS'teki dikey animasyon (tb-in) oynar.
// Cubuklar arasi gecis yeniden baglama oldugu icin son durum modul duzeyinde tutulur.
let lastBar = { sig: '', count: 0, x: 0, at: -1e9 };
let lastChangeAt = -1e9; // son secim degisikligi (animasyonlu ya da degil)
const RAPID_MS = 350; // bundan sik gelen degisiklikler "hizli" sayilir
function useBarAnim(selKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const prev = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const titles = [...el.querySelectorAll<HTMLElement>(':scope > .tb-btn, :scope > .drop > .tb-btn')].map((b) => b.title);
    const sig = selKey + '#' + titles.join('|');
    const now = performance.now();
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    // Bu cubuk yeni baglandiysa: hemen onceki cubugun yerine mi geldi (gecis), yoksa yeni mi belirdi?
    const changed = mounted.current ? sig !== prev.current : now - lastBar.at < 150 && !!lastBar.sig && lastBar.sig !== sig;
    // Secim art arda cok hizli degisiyorsa (alan secimi suruklenirken her harekette degisir) animasyon oynamaz ve
    // suren animasyon kesilir: cubuk sabit durur. Yeni baglanan cubuk da bu durumda dikey animasyonu oynamaz.
    const isChange = !mounted.current || sig !== prev.current;
    const rapid = now - lastChangeAt < RAPID_MS;
    if (isChange) lastChangeAt = now;
    if (isChange && rapid) el.style.animation = 'none';
    else if (changed) {
      const dx = x - lastBar.x;
      const dir = Math.abs(dx) > 2 ? (dx > 0 ? 'l' : 'r') : titles.length < lastBar.count ? 'l' : 'r';
      el.style.animation = 'none';
      void el.offsetWidth; // animasyonu yeniden baslat
      el.style.animation = `tb-swap-${dir} 0.3s cubic-bezier(0.22, 1, 0.36, 1)`;
    }
    mounted.current = true;
    prev.current = sig;
    lastBar = { sig, count: titles.length, x, at: now };
  });
  // Kaldirildigi ani kaydet: yerine hemen baska cubuk gelirse gecis sayilir
  useEffect(() => () => { lastBar = { ...lastBar, at: performance.now() }; }, []);
  return ref;
}

function Drop({ trigger, title, children, wide }: { trigger: ReactNode; title: string; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // Ayni anda tek menu acik kalir: baska bir menu acilinca ya da disari tiklaninca kapan.
    // Yakalama asamasi: arac cubugu mousedown'u durdurdugu icin normal asamada buraya ulasmaz.
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const other = (e: Event) => (e as CustomEvent).detail !== ref.current && setOpen(false);
    document.addEventListener('mousedown', off, true);
    window.addEventListener('tb-drop-open', other);
    window.dispatchEvent(new CustomEvent('tb-drop-open', { detail: ref.current }));
    // Acilinca odak menuye: secili secenek, yoksa ilki
    const items = menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
    (menuRef.current?.querySelector<HTMLElement>('button.on:not(:disabled)') ?? items?.[0])?.focus();
    return () => {
      document.removeEventListener('mousedown', off, true);
      window.removeEventListener('tb-drop-open', other);
    };
  }, [open]);
  // Menu icinde klavye: yon tuslari en yakin secenege gider, Enter/Bosluk secer (dugmenin kendi davranisi), Esc kapatir.
  // Tuslar tuvale ulasmaz (Enter yazi duzenlemeyi, Delete silmeyi tetiklemesin).
  const onMenuKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!dir) return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    if (cur < 0) return items[0].focus();
    const mid = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const c = mid(items[cur]);
    let best = -1, bestD = Infinity;
    items.forEach((el, i) => {
      if (i === cur) return;
      const p = mid(el);
      const along = (p.x - c.x) * dir[0] + (p.y - c.y) * dir[1];
      const across = Math.abs((p.x - c.x) * dir[1]) + Math.abs((p.y - c.y) * dir[0]);
      if (along < 1) return;
      const d = along + across * 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    // O yonde secenek yoksa sirayla devam et (basa/sona sarar)
    if (best < 0) best = (cur + (dir[0] + dir[1] > 0 ? 1 : items.length - 1)) % items.length;
    items[best].focus();
  };
  return (
    <div className="drop" ref={ref}>
      <button ref={btnRef} className={`tb-btn ${wide ? 'wide' : ''} ${open ? 'on' : ''}`} title={title} onClick={() => setOpen(!open)}>
        {trigger}
        <ChevronDown size={14} />
      </button>
      {open && <div className="drop-menu" ref={menuRef} onKeyDown={onMenuKey}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function Btn({ on, title, onClick, children }: { on?: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`tb-btn ${on ? 'on' : ''}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

const Sep = () => <span className="tb-sep" />;

function Swatch({ c, ring }: { c: string; ring?: boolean }) {
  const hex = colorHex(c);
  // ring: kenar rengi icin ici bos halka
  if (ring) return <span className={`dot ring ${hex ? '' : 'none'}`} style={{ borderColor: hex ?? '#888' }} />;
  return <span className={`dot ${hex ? '' : 'none'}`} style={{ background: hex ?? 'transparent' }} />;
}

// shown: dugmede gosterilecek renk (otomatik kenar renginde secili deger bos, gorunen renk turetilmis olandir)
function ColorDrop({ value, onPick, allowNone, ring, title = 'Renk', onAuto, shown }: {
  value: string; onPick: (c: string) => void; allowNone?: boolean; ring?: boolean; title?: string; onAuto?: () => void; shown?: string;
}) {
  return (
    <Drop title={title} trigger={<Swatch c={shown ?? value} ring={ring} />}>
      {(close) => (
        <div className="palette">
          {PALETTE_ROWS.map((row, ri) => (
            <div key={row} className="palette-row">
              {row.split('').map((c) => (
                <button key={c} title={c} className={`swatch ${value === c ? 'on' : ''}`} style={{ background: PALETTE[c] }}
                  onClick={() => { onPick(c); close(); }} />
              ))}
              {ri === 1 && (
                <label className={`swatch custom ${value.startsWith('#') ? 'on' : ''}`} title="Ozel renk">
                  <input type="color" value={value.startsWith('#') ? value : '#888888'} onChange={(e) => onPick(e.target.value.toUpperCase())} />
                </label>
              )}
            </div>
          ))}
          {(allowNone || onAuto) && (
            <div className="palette-row">
              {allowNone && (
                <button className={`none-btn ${value === '-' ? 'on' : ''}`} onClick={() => { onPick('-'); close(); }}>Dolgu yok</button>
              )}
              {onAuto && (
                <button className="none-btn" title="Dolgu rengine gore otomatik" onClick={() => { onAuto(); close(); }}>Otomatik</button>
              )}
            </div>
          )}
        </div>
      )}
    </Drop>
  );
}

// Kalinlik + duz/kesikli secimi (node kenarligi ve baglanti icin ortak)
function StrokeDrop({ weight, dash, min, def, onChange }: {
  weight: number; dash: boolean; min: number; def: number; onChange: (p: { weight?: number; dash?: boolean }) => void;
}) {
  const line = (w: number, d: boolean) => (
    <svg width="40" height="14" viewBox="0 0 40 14">
      {w > 0 ? <line x1="2" y1="7" x2="38" y2="7" stroke="currentColor" strokeWidth={[0, 1.5, 3, 5][w]} strokeDasharray={d ? DASH : undefined} />
        : <text x="2" y="11" fontSize="11" fill="currentColor">yok</text>}
    </svg>
  );
  return (
    <Drop title="Cizgi kalinligi ve tipi" trigger={line(Math.max(weight, 1), dash)}>
      {() => (
        <div className="menu-list">
          {[0, 1, 2, 3].filter((w) => w >= min).map((w) => (
            <button key={w} className={weight === w ? 'on' : ''} onClick={() => onChange({ weight: w === def ? undefined : w })}>
              {line(w, false)} {WEIGHT_NAMES[w]}
            </button>
          ))}
          <div className="menu-row">
            <button className={!dash ? 'on' : ''} onClick={() => onChange({ dash: undefined })}>{line(2, false)} Duz</button>
            <button className={dash ? 'on' : ''} onClick={() => onChange({ dash: true })}>{line(2, true)} Kesikli</button>
          </div>
        </div>
      )}
    </Drop>
  );
}

const ALIGN_ICON: Record<Align, ReactNode> = { l: <AlignLeft size={18} />, c: <AlignCenter size={18} />, r: <AlignRight size={18} /> };

// Otomatik kenar renginin hex karsiligi (tetikleyici halkada gostermek icin)
const strokeOf = (d: { color: string; shape: Shape }) => {
  const hex = nodeColors(d.color, d.shape).stroke;
  return hex.startsWith('#') ? hex.toUpperCase() : '-';
};

// ---------- Secili node'larin ustundeki cubuk ----------

// Tab ile gezerken arac cubugunun altinda secimin turu yazar; secim degisince kaybolur
export function TabChip() {
  const t = useTabLabel();
  const now = useFlow((s) => selSig(s.nodes.filter((n) => n.selected).map((n) => n.id), s.edges.filter((e) => e.selected).map((e) => e.id)));
  if (!t.label || t.sig !== now) return null;
  return <div className="tab-chip">{t.label}</div>;
}

export function NodeBar({ nodes }: { nodes: ShapeNode[] }) {
  const barRef = useBarAnim(nodes.map((n) => n.id).join(','));
  const { updateNode, setNodes } = useFlow.getState();
  const ids = nodes.map((n) => n.id);
  const first = nodes[0].data;
  const shapes = new Set(nodes.map((n) => n.data.shape));
  const only = (s: Shape) => shapes.size === 1 && shapes.has(s);
  const sec = shapes.has('group'); // Section secili: dolgu rengi ve yazi tipinden sonraki secenekler yok (yalniz Section'i kaldir + Sil)
  const hasText = !sec && !shapes.has('table');
  const allBasic = [...shapes].every((s) => BASIC.includes(s));
  const size = first.size ?? defaultFontSize(first.shape);
  const align = first.align ?? (first.shape === 'text' || first.text.includes('\n') ? 'l' : 'c');

  const mapText = (fn: (t: string) => string) =>
    setNodes((all) => all.map((n) => (ids.includes(n.id) ? { ...n, data: { ...n.data, text: fn(n.data.text) } } : n)));
  const mark = (m: Mark) => mapText((t) => toggleMark(t, m));

  const table = (fn: (cells: string[][], w: number, h: number) => [string[][], number, number]) =>
    setNodes((all) => all.map((n) => {
      if (n.id !== ids[0]) return n;
      const [cells, w, h] = fn(parseTable(n.data.text), n.width ?? 0, n.height ?? 0);
      return { ...n, width: w, height: h, data: { ...n.data, text: tableText(cells) } };
    }));

  return (
    <div className="tb" ref={barRef} data-hotbar onMouseDown={(e) => e.stopPropagation()}>
      {!sec && <ColorDrop title="Dolgu rengi" value={first.color} onPick={(c) => updateNode(ids, { color: c })} allowNone={!shapes.has('text')} />}
      {!shapes.has('text') && (
        <ColorDrop title="Kenar rengi" ring value={first.stroke ?? ''} shown={first.stroke ?? strokeOf(first)} onPick={(c) => updateNode(ids, { stroke: c })}
          onAuto={() => updateNode(ids, { stroke: undefined })} />
      )}
      {!shapes.has('text') && (
        <StrokeDrop weight={first.weight ?? defaultWeight(first.shape)} def={defaultWeight(first.shape)} dash={!!first.dash} min={0}
          onChange={(p) => updateNode(ids, p)} />
      )}
      {allBasic && (
        <>
          <Sep />
          <Drop title="Sekil" trigger={SHAPE_ICON[first.shape]}>
            {(close) => (
              <div className="menu-grid">
                {BASIC.map((s) => (
                  <Btn key={s} on={first.shape === s} title={SHAPE_NAMES[s]} onClick={() => { useFlow.getState().changeShape(ids, s); close(); }}>
                    {SHAPE_ICON[s]}
                  </Btn>
                ))}
              </div>
            )}
          </Drop>
        </>
      )}
      <Sep />
      <Drop title="Yazi tipi" trigger={<span className="tb-text" style={{ fontFamily: FONTS[first.font ?? 'G'].css }}>Aa</span>}>
        {(close) => (
          <div className="menu-list">
            {(Object.keys(FONTS) as Font[]).map((f) => (
              <button key={f} className={(first.font ?? 'G') === f ? 'on' : ''} style={{ fontFamily: FONTS[f].css, fontSize: 15 }}
                onClick={() => { updateNode(ids, { font: f === 'G' ? undefined : f }); close(); }}>
                {FONTS[f].name}
              </button>
            ))}
          </div>
        )}
      </Drop>
      {!shapes.has('group') && (
        <>
          <Sep />
          <Drop title="Yazi boyutu" wide trigger={<span className="tb-text">{SIZE_NAMES[size]}</span>}>
            {(close) => (
              <div className="menu-list">
                {(Object.keys(SIZE_NAMES) as Size[]).map((s) => (
                  <button key={s} className={size === s ? 'on' : ''} onClick={() => { updateNode(ids, { size: s === defaultFontSize(first.shape) ? undefined : s }); close(); }}>
                    {SIZE_NAMES[s]}
                  </button>
                ))}
              </div>
            )}
          </Drop>
        </>
      )}
      {hasText && (
        <>
          <Sep />
          <Btn title="Kalin (Ctrl+B)" on={hasMark(first.text, '**')} onClick={() => mark('**')}><Bold size={18} /></Btn>
          <Btn title="Ustu cizili (Ctrl+Shift+X)" on={hasMark(first.text, '~~')} onClick={() => mark('~~')}><Strikethrough size={18} /></Btn>
          <Btn title="Liste" on={hasList(first.text)} onClick={() => mapText(toggleList)}><List size={18} /></Btn>
        </>
      )}
      {!shapes.has('group') && (
        <>
          <Sep />
          <Drop title="Hizalama" trigger={ALIGN_ICON[align]}>
            {(close) => (
              <div className="menu-grid">
                {(['l', 'c', 'r'] as Align[]).map((a) => (
                  <Btn key={a} on={align === a} title={a} onClick={() => { updateNode(ids, { align: a }); close(); }}>{ALIGN_ICON[a]}</Btn>
                ))}
              </div>
            )}
          </Drop>
        </>
      )}
      {only('table') && nodes.length === 1 && (
        <>
          <Sep />
          <Btn title="Satir ekle" onClick={() => table((c, w, h) => [[...c, Array(c[0].length).fill('')], w, h + h / c.length])}>+ Satir</Btn>
          <Btn title="Sutun ekle" onClick={() => table((c, w, h) => [c.map((r) => [...r, '']), w + w / c[0].length, h])}>+ Sutun</Btn>
          <Btn title="Son satiri sil" onClick={() => table((c, w, h) => (c.length > 1 ? [c.slice(0, -1), w, h - h / c.length] : [c, w, h]))}>− Satir</Btn>
          <Btn title="Son sutunu sil" onClick={() => table((c, w, h) => (c[0].length > 1 ? [c.map((r) => r.slice(0, -1)), w - w / c[0].length, h] : [c, w, h]))}>− Sutun</Btn>
        </>
      )}
      <Sep />
      {!sec && nodes.length > 1 && <Btn title="Grupla (Ctrl+G)" onClick={() => useFlow.getState().groupSelection()}><Group size={18} /></Btn>}
      {!sec && nodes.some((n) => n.data.sets?.length) && <Btn title="Grubu dagit - en disteki katman (Ctrl+Shift+G)" onClick={() => useFlow.getState().ungroupSelection()}><Ungroup size={18} /></Btn>}
      {!sec && <Btn title="Section olustur (Ctrl+Alt+S)" onClick={() => useFlow.getState().sectionSelection()}><Frame size={18} /></Btn>}
      {sec && <Btn title="Section'i kaldir (Ctrl+Shift+S)" onClick={() => useFlow.getState().unsectionSelection()}><SquareDashed size={18} /></Btn>}
      {!sec && <LinkBtn nodes={nodes} />}
      {!sec && <UnlinkBtn ids={ids} />}
      <Btn title="Sil (Del)" onClick={() => setNodes((all) => all.filter((n) => !ids.includes(n.id) && !ids.includes(n.parentId ?? '')))}>
        <Trash2 size={18} />
      </Btn>
    </div>
  );
}

// Secili nesnelere bagli tum baglantilari kaldirir (nesneler kalir); baglanti yoksa dugme gorunmez
function UnlinkBtn({ ids }: { ids: string[] }) {
  const linked = useFlow((s) => s.edges.some((e) => ids.includes(e.source) || ids.includes(e.target)));
  if (!linked) return null;
  return (
    <Btn title="Baglantilari kaldir" onClick={() => {
      const s = useFlow.getState();
      s.onEdgesChange(s.edges.filter((e) => ids.includes(e.source) || ids.includes(e.target)).map((e) => ({ id: e.id, type: 'remove' as const })));
    }}>
      <Unlink size={18} />
    </Btn>
  );
}

// Secili nesneleri zincir halinde baglar: A>B>C... (son kullanilan baglanti stiliyle).
// Sira, secimin yayildigi eksene gore: secim enine genisse soldan saga, boyuna uzunsa yukaridan asagi (hizala/dagit araclariyla ayni mantik).
// Aralarinda zaten baglanti olan (iki yonden biri) komsu ciftler atlanir. Baska nesneyle birlikte secilen Section'lar zincire girmez.
function chainPairs(all: ShapeNode[], sel: ShapeNode[], edges: { source: string; target: string }[]): [string, string][] {
  const plain = sel.filter((n) => n.data.shape !== 'group');
  const list = plain.length >= 2 ? plain : sel;
  if (list.length < 2) return [];
  const pts = list.map((n) => {
    const p = absPosition(all, n.id);
    return { id: n.id, x: p.x + (n.width ?? n.measured?.width ?? 0) / 2, y: p.y + (n.height ?? n.measured?.height ?? 0) / 2 };
  });
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  pts.sort((a, b) => (wide ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x) || a.id.localeCompare(b.id));
  const has = (a: string, b: string) => edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < pts.length; i++) if (!has(pts[i].id, pts[i + 1].id)) pairs.push([pts[i].id, pts[i + 1].id]);
  return pairs;
}

// Kurulacak baglanti kalmadiysa (hepsi zaten bagli) ya da tek nesne seciliyse dugme gorunmez
function LinkBtn({ nodes }: { nodes: ShapeNode[] }) {
  const edges = useFlow((s) => s.edges);
  if (!chainPairs(useFlow.getState().nodes, nodes, edges).length) return null;
  return (
    <Btn title="Baglanti kur (secili nesneleri sirayla baglar)" onClick={() => {
      // Tiklama aninda guncel durumdan yeniden hesapla; hepsi tek adimda eklenir (tek geri al)
      const s = useFlow.getState();
      const ids = new Set(nodes.map((n) => n.id));
      const pairs = chainPairs(s.nodes, s.nodes.filter((n) => ids.has(n.id)), s.edges);
      if (!pairs.length) return;
      useFlow.setState({ edges: [...s.edges, ...pairs.map(([from, to]) => s.newEdge(from, to))] });
    }}>
      <Link size={18} />
    </Btn>
  );
}

// ---------- Baglanti cubugu ----------

const head = <path d="M14 4l4 3-4 3" />;
export const LINE_TYPES: { kind: EdgeKind; arrow: boolean; title: string; icon: ReactNode }[] = [
  { kind: 'step', arrow: true, title: 'Koseli', icon: <><path d="M3 18h6V7h9" />{head}</> },
  { kind: 'curve', arrow: true, title: 'Kavisli', icon: <><path d="M3 18c7 0 6-11 15-11" />{head}</> },
  { kind: 'line', arrow: true, title: 'Duz ok', icon: <><path d="M4 19L18 5" /><path d="M10 5h8v8" /></> },
  { kind: 'line', arrow: false, title: 'Duz cizgi', icon: <path d="M4 19L18 5" /> },
];
export function LineIcon({ i, size = 22 }: { i: number; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{LINE_TYPES[i].icon}</svg>;
}
// Uc bicimi (FigJam "start/end point"): yok, cizgi ok, ucgen, baklava, daire. flip: baslangic ucu (ikon sola bakar)
function CapDrop({ title, value, flip, onPick }: { title: string; value: Cap | undefined; flip?: boolean; onPick: (c: Cap | undefined) => void }) {
  const icon = (cap: Cap | undefined) => (
    <svg width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <g transform={flip ? 'translate(34 0) scale(-1 1)' : undefined}>
        <line x1="3" y1="7" x2="30" y2="7" />
        {cap && <path d={CAP_GEOM[cap].d} transform="translate(31 7) scale(0.9)" fill={CAP_GEOM[cap].fill ? 'currentColor' : 'none'} />}
      </g>
    </svg>
  );
  return (
    <Drop title={title} trigger={icon(value)}>
      {(close) => (
        <div className="menu-list">
          {([undefined, ...CAPS] as (Cap | undefined)[]).map((c) => (
            <button key={c ?? 'n'} className={value === c ? 'on' : ''} onClick={() => { onPick(c); close(); }}>
              {icon(c)} {CAP_NAMES[c ?? 'n']}
            </button>
          ))}
        </div>
      )}
    </Drop>
  );
}

const SIDE_NAMES: Record<Side | '*', string> = { '*': 'Oto', t: 'Ust', r: 'Sag', b: 'Alt', l: 'Sol' };

// ids: secili tum baglantilar (degisiklik hepsine uygulanir); data: ilkinin degerleri gosterilir
export function EdgeBar({ ids, data }: { ids: string[]; data: FlowEdgeData }) {
  const barRef = useBarAnim('e:' + ids.join(','));
  const { updateEdge, setEditing, onEdgesChange } = useFlow.getState();
  const single = ids.length === 1;
  const [capS, capE] = edgeCaps(data);
  const sides = data.sides ?? ['*', '*'];
  const setSide = (i: 0 | 1, v: Side | '*') => {
    const next: [Side | '*', Side | '*'] = [...sides];
    next[i] = v;
    updateEdge(ids, { sides: next[0] === '*' && next[1] === '*' ? undefined : next });
  };
  return (
    <div className="tb nodrag nopan" ref={barRef} data-hotbar onMouseDown={(e) => e.stopPropagation()}>
      <ColorDrop value={data.color} onPick={(c) => updateEdge(ids, { color: c })} />
      <StrokeDrop weight={data.weight ?? 2} def={2} dash={!!data.dash} min={1} onChange={(p) => updateEdge(ids, p)} />
      <Sep />
      {LINE_TYPES.map((t) => (
        <Btn key={t.title} title={t.title} on={data.kind === t.kind && data.arrow === t.arrow}
          onClick={() => updateEdge(ids, { kind: t.kind, arrow: t.arrow })}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
        </Btn>
      ))}
      <Sep />
      <CapDrop title="Baslangic ucu" flip value={capS} onPick={(c) => updateEdge(ids, { start: c })} />
      <CapDrop title="Bitis ucu" value={capE} onPick={(c) => updateEdge(ids, c ? { arrow: true, end: c === 'a' ? undefined : c } : { arrow: false })} />
      <Sep />
      <Drop title="Baglanti kenarlari" wide trigger={<span className="tb-text">{SIDE_NAMES[sides[0]]} → {SIDE_NAMES[sides[1]]}</span>}>
        {() => (
          <div className="menu-sides">
            {([0, 1] as const).map((i) => (
              <div key={i}>
                <span>{i === 0 ? 'Cikis' : 'Giris'}</span>
                {(Object.keys(SIDE_NAMES) as (Side | '*')[]).map((s) => (
                  <button key={s} className={sides[i] === s ? 'on' : ''} onClick={() => setSide(i, s)}>{SIDE_NAMES[s]}</button>
                ))}
              </div>
            ))}
          </div>
        )}
      </Drop>
      {single && <Btn title="Etiket (Enter / cift tik)" onClick={() => setEditing(`edge:${ids[0]}`)}><Type size={18} /></Btn>}
      {data.bend && (
        <Btn title="Bukumu sifirla" onClick={() => updateEdge(ids, { bend: undefined })}><Undo2 size={18} /></Btn>
      )}
      <Sep />
      <Btn title="Sil (Del)" onClick={() => onEdgesChange(ids.map((id) => ({ id, type: 'remove' as const })))}><Trash2 size={18} /></Btn>
    </div>
  );
}

// ---------- Node + baglanti birlikte secili: sadece ortak ozellikler ----------
// Ortak olan cizgi: node'un kenarligi = baglantinin cizgisi (renk, kalinlik, duz/kesikli)

export function MixedBar({ nodes, edges }: { nodes: ShapeNode[]; edges: { id: string; data?: FlowEdgeData }[] }) {
  const barRef = useBarAnim(nodes.map((n) => n.id).join(',') + '/' + edges.map((e) => e.id).join(','));
  const { updateNode, updateEdge, setNodes, onEdgesChange } = useFlow.getState();
  const nIds = nodes.map((n) => n.id);
  const lined = nodes.filter((n) => n.data.shape !== 'text').map((n) => n.id); // yazinin kenarligi yok
  const eIds = edges.map((e) => e.id);
  const d = edges[0].data!;
  return (
    <div className="tb" ref={barRef} data-hotbar onMouseDown={(e) => e.stopPropagation()}>
      <ColorDrop title="Cizgi rengi" value={d.color} onPick={(c) => { updateNode(lined, { stroke: c }); updateEdge(eIds, { color: c }); }} />
      <StrokeDrop weight={d.weight ?? 2} def={2} dash={!!d.dash} min={1}
        onChange={(p) => { updateNode(lined, p); updateEdge(eIds, p); }} />
      <Sep />
      <LinkBtn nodes={nodes} />
      <UnlinkBtn ids={nIds} />
      <Btn title="Sil (Del)" onClick={() => {
        onEdgesChange(eIds.map((id) => ({ id, type: 'remove' as const })));
        setNodes((all) => all.filter((n) => !nIds.includes(n.id) && !nIds.includes(n.parentId ?? '')));
      }}>
        <Trash2 size={18} />
      </Btn>
    </div>
  );
}

// ---------- Alttaki ana arac cubugu ----------

export function MainToolbar() {
  const tool = useFlow((s) => s.tool);
  const placing = useFlow((s) => s.placing);
  const setTool = useFlow((s) => s.setTool);
  const setPlacing = useFlow((s) => s.setPlacing);
  const arrowTool = useFlow((s) => s.arrowTool);
  const arrowKind = useFlow((s) => s.arrowKind);
  const setArrowTool = useFlow((s) => s.setArrowTool);
  return (
    <div className="main-toolbar">
      <Btn on={!placing && tool === 'select'} title="Sec (V)" onClick={() => { setPlacing(null); setTool('select'); }}><MousePointer2 size={20} /></Btn>
      <Btn on={!placing && tool === 'hand'} title="El (H)" onClick={() => { setPlacing(null); setTool('hand'); }}><Hand size={20} /></Btn>
      <Btn on={placing === 'text'} title="Yazi (T) - tikla ve yaz" onClick={() => setPlacing(placing === 'text' ? null : 'text')}><Type size={20} /></Btn>
      <Sep />
      {(['rect', 'round', 'pill', 'circle', 'diamond', 'db', 'table'] as Shape[]).map((s) => (
        <Btn key={s} on={placing === s} title={SHAPE_NAMES[s] + ' - tikla ve yerlestir, Esc iptal'} onClick={() => setPlacing(placing === s ? null : s)}>{SHAPE_ICON[s]}</Btn>
      ))}
      {/* Ok araci: en son secilen tur gorunur; yanindaki ok listeden digerleri secilir */}
      <Sep />
      <Btn on={arrowTool !== null} title={`Ok: ${LINE_TYPES[arrowKind].title} - surukleyerek ciz (nesneye birakinca kenetlenir, bosa birakinca serbest kalir). Tekerlek: tur degistir`}
        onClick={() => setArrowTool(arrowTool !== null ? null : arrowKind)}>
        <LineIcon i={arrowKind} />
      </Btn>
      <div className="arrow-drop">
        <Drop title="Ok turu" trigger={null}>
          {(close) => (
            <div className="menu-grid">
              {LINE_TYPES.map((t, i) => (
                <Btn key={t.title} on={arrowKind === i} title={t.title} onClick={() => { setArrowTool(i); close(); }}><LineIcon i={i} /></Btn>
              ))}
            </div>
          )}
        </Drop>
      </div>
      {/* Section en sonda ve ayri: baglanti kurulamayan tek arac */}
      <Sep />
      <Btn on={placing === 'group'} title={SHAPE_NAMES.group + ' - tikla ve yerlestir, Esc iptal'} onClick={() => setPlacing(placing === 'group' ? null : 'group')}>{SHAPE_ICON.group}</Btn>
    </div>
  );
}

// ---------- Bos alana birakilan baglanti: sekil menusu (FigJam) ----------

export type PendingConnect = { from: string; fromSide: Side | '*'; at: { x: number; y: number }; screen: { x: number; y: number } };
const CONNECT_SHAPES: Shape[] = ['rect', 'round', 'pill', 'circle', 'diamond', 'db', 'text', 'table'];

export function ConnectMenu({ pending, onClose }: { pending: PendingConnect; onClose: () => void }) {
  const nodes = useFlow((s) => s.nodes);
  const edgeStyle = useFlow((s) => s.edgeStyle);
  const [hover, setHover] = useState<Shape | 'same'>('same');
  const ref = useRef<HTMLDivElement>(null);
  // Klavye dinleyicisi bir kez baglanir; guncel vurguyu ve secme islevini ref'ten okur
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const pickRef = useRef<(s: Shape | 'same') => void>(() => {});
  // Menu canvas disina tasmasin: sag/alt kenara yakinsa sola/yukari acilir
  const [place, setPlace] = useState({ left: pending.screen.x + 12, top: pending.screen.y + 12 });
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null;
    if (!el || !box) return;
    const { x, y } = pending.screen;
    const W = box.clientWidth, H = box.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
    setPlace({
      left: x + 12 + w > W - 8 ? Math.max(8, x - 12 - w) : x + 12,
      top: y + 12 + h > H - 8 ? Math.max(8, y - 12 - h) : y + 12,
    });
  }, [pending.screen]);
  const src = nodes.find((n) => n.id === pending.from);

  useEffect(() => {
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    // Klavye (sahte odak = vurgulu secenek): yon tuslari 4 sutunlu izgarada ve alttaki "Aynisindan ekle"de gezer,
    // Enter / Bosluk secer, Esc kapatir. Tuslar tuvale ulasmaz.
    const order: (Shape | 'same')[] = [...CONNECT_SHAPES, 'same'];
    const last = order.length - 1;
    const esc = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = order.indexOf(hoverRef.current);
      let next = -1;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) pickRef.current(hoverRef.current);
        return;
      } else if (e.key === 'ArrowRight') next = (i + 1) % order.length;
      else if (e.key === 'ArrowLeft') next = (i + last) % order.length;
      else if (e.key === 'ArrowDown') next = i === last ? 0 : i + 4 >= last ? last : i + 4;
      else if (e.key === 'ArrowUp') next = i === last ? last - 4 : i < 4 ? last : i - 4;
      else return;
      e.preventDefault();
      e.stopPropagation();
      setHover(order[next]);
    };
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', esc, true);
    };
  }, [onClose]);

  const plan = planConnected(nodes, pending.from, hover, pending.at);
  if (!src || !plan) return null;

  // Kaynak uc noktasi: secilen kenarin ortasi (yoksa birakilan noktaya bakan kenar)
  const sp = absPosition(nodes, src.id);
  const sw = src.width ?? src.measured?.width ?? 0, sh = src.height ?? src.measured?.height ?? 0;
  const dx = pending.at.x - (sp.x + sw / 2), dy = pending.at.y - (sp.y + sh / 2);
  const side: Side = pending.fromSide !== '*' ? pending.fromSide : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'b' : 't';
  const a = { t: { x: sp.x + sw / 2, y: sp.y }, b: { x: sp.x + sw / 2, y: sp.y + sh }, l: { x: sp.x, y: sp.y + sh / 2 }, r: { x: sp.x + sw, y: sp.y + sh / 2 } }[side];
  const color = colorHex(edgeStyle.color) ?? PALETTE.g;
  // Onizleme, secili baglanti turunun seklinde cizilir (surukleme sirasindaki cizgiyle ayni); hedef kenar kaynagin karsisi
  const ts = ({ t: 'b', b: 't', l: 'r', r: 'l' } as const)[side];
  const [prevPath] = buildPath({ kind: edgeStyle.kind }, a, side, pending.at, ts);
  const [hx, hy] = edgeStyle.kind === 'line' ? [pending.at.x - a.x, pending.at.y - a.y] : [-NORMAL[ts][0], -NORMAL[ts][1]];
  const headDeg = (Math.atan2(hy, hx) * 180) / Math.PI;
  const prevCap = edgeCaps(edgeStyle)[1];

  const pick =(s: Shape | 'same') => {
    useFlow.getState().addConnected(pending.from, pending.fromSide, s, pending.at);
    onClose();
  };
  pickRef.current = pick;

  return (
    <>
      <ViewportPortal>
        <svg className="connect-preview" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
          <path d={prevPath} stroke={color} strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" fill="none" opacity={0.75} />
          {prevCap && (
            <path d={CAP_GEOM[prevCap].d} transform={`translate(${pending.at.x} ${pending.at.y}) rotate(${headDeg}) scale(1.25)`}
              stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill={CAP_GEOM[prevCap].fill ? color : 'none'} opacity={0.75} />
          )}
        </svg>
        <div className="connect-ghost" style={{ transform: `translate(${plan.pos.x}px, ${plan.pos.y}px)` }}>
          <ShapeGhost shape={plan.shape} color={plan.color ?? 'G'} stroke={plan.stroke} w={plan.w} h={plan.h} />
        </div>
      </ViewportPortal>
      <div className="connect-menu tb" ref={ref} style={place}
        onMouseLeave={() => setHover('same')}>
        <div className="connect-grid">
          {CONNECT_SHAPES.map((s) => (
            <div key={s} onMouseEnter={() => setHover(s)}>
              <Btn on={hover === s} title={SHAPE_NAMES[s]} onClick={() => pick(s)}>{SHAPE_ICON[s]}</Btn>
            </div>
          ))}
        </div>
        <button className={`connect-same ${hover === 'same' ? 'on' : ''}`} onMouseEnter={() => setHover('same')} onClick={() => pick('same')}>
          {SHAPE_ICON[src.data.shape]} Aynisindan ekle
        </button>
      </div>
    </>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { DASH, FONT_PX, NODE_STROKE, defaultFontSize, fontCss, nodeColors, parseTable, tableText } from '../flow/format';
import type { Side } from '../flow/format';
import { wrapSelection } from '../flow/markup';
import { QUICK_GAP, quickOffset, useFlow } from '../flow/store';
import type { ShapeData, ShapeNode as ShapeNodeT } from '../flow/store';
import { InlineText, RichText } from './RichText';
import { ShapeGhost } from './ShapeGhost';

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const;


function ShapeSvg({ shape, w, h, fill, stroke, sw, dash }: {
  shape: string; w: number; h: number; fill: string; stroke: string; sw: number; dash?: boolean;
}) {
  const common = { fill, stroke, strokeWidth: sw, strokeLinejoin: 'round' as const, strokeDasharray: dash ? DASH : undefined };
  sw = Math.max(sw, 1.5);
  let el = null;
  if (shape === 'circle') el = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - sw} ry={h / 2 - sw} {...common} />;
  else if (shape === 'diamond')
    el = <polygon points={`${w / 2},${sw} ${w - sw},${h / 2} ${w / 2},${h - sw} ${sw},${h / 2}`} {...common} />;
  else if (shape === 'db') {
    const ry = Math.min(h * 0.18, 18);
    const x0 = sw, x1 = w - sw, y0 = sw + ry, y1 = h - sw - ry, rx = (w - 2 * sw) / 2;
    el = (
      <>
        <path d={`M${x0},${y0} L${x0},${y1} A${rx},${ry} 0 0 0 ${x1},${y1} L${x1},${y0}`} {...common} />
        <ellipse cx={w / 2} cy={y0} rx={rx} ry={ry} {...common} />
      </>
    );
  }
  return (
    <svg className="shape-svg" width={w} height={h}>
      {el}
    </svg>
  );
}

// React Flow yeni node'u olcene kadar gizli tutar; gizli eleman odak alamaz, birkac kare tekrar dene
function useFocusSelect(ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>) {
  useEffect(() => {
    let tries = 0;
    let raf = 0;
    const go = () => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
      else if (tries++ < 20) raf = requestAnimationFrame(go);
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

const regroupLater = () => setTimeout(() => useFlow.getState().regroupAll(), 0);

// Ctrl+B kalin, Ctrl+Shift+X cizili: secili metni isaretler
function markKeys(e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, set: (v: string) => void) {
  const mod = e.ctrlKey || e.metaKey;
  const mark = mod && e.key.toLowerCase() === 'b' ? '**' : mod && e.shiftKey && e.key.toLowerCase() === 'x' ? '~~' : null;
  if (!mark) return false;
  e.preventDefault();
  const el = e.currentTarget;
  const r = wrapSelection(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0, mark);
  set(r.value);
  requestAnimationFrame(() => el.setSelectionRange(r.start, r.end));
  return true;
}

function EditBox({ text, style, autoSize, onDone }: {
  text: string; style: React.CSSProperties; autoSize?: boolean; onDone: (t: string) => void;
}) {
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Figma gibi: duzenlemeye girince tum metin secili gelir
  useFocusSelect(ref);
  const ls = draft.split('\n');
  const sizeStyle = autoSize
    ? { width: `${Math.max(2, ...ls.map((l) => l.length)) + 1}ch`, height: `${ls.length * 1.45}em` }
    : {};
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || autoSize) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, autoSize]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="nodrag nowheel nopan node-input"
      style={{ ...style, ...sizeStyle }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (markKeys(e, setDraft)) return;
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) ref.current?.blur();
      }}
    />
  );
}

// Hucre duzenleme: Enter = kaydet + alt hucre, Tab = kaydet + yandaki hucre, Esc = vazgec.
// selectAll: hucreye girilince metin secili gelir; yazmaya basliyarak girildiyse imlec sonda durur.
function CellInput({ value, selectAll = true, onCommit }: {
  value: string; selectAll?: boolean; onCommit: (v: string, move: 'next' | 'prev' | 'down' | 'done' | 'cancel') => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    let tries = 0;
    let raf = 0;
    const go = () => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (document.activeElement !== el) {
        if (tries++ < 20) raf = requestAnimationFrame(go);
        return;
      }
      if (selectAll) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [selectAll]);
  const commit = (move: 'next' | 'prev' | 'down' | 'done' | 'cancel') => {
    if (done.current) return;
    done.current = true;
    onCommit(draft, move);
  };
  return (
    <input
      ref={ref}
      className="nodrag nowheel nopan cell-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit('done')}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (markKeys(e, setDraft)) return;
        if (e.key === 'Tab') {
          e.preventDefault();
          commit(e.shiftKey ? 'prev' : 'next');
        } else if (e.key === 'Enter') commit('down');
        else if (e.key === 'Escape') commit('cancel');
      }}
    />
  );
}

function SideHandles({ id, data, w, h, quick }: { id: string; data: ShapeData; w: number; h: number; quick: boolean }) {
  const [hover, setHover] = useState<Side | null>(null);
  // FigJam: imlec nesnenin bir kenarina yaklasinca o kenardaki nokta, daha imlec ustune gelmeden beyaz zeminli ok
  // dugmesine donusur (sabit boyut). Boylece hedef buyuk ve yerinde durur; ustune gelince onizleme cikar.
  const [near, setNear] = useState<Side | null>(null);
  const probe = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = probe.current?.parentElement;
    if (!quick || !host) return setNear(null);
    const move = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.side-handle')) return; // dugmenin ustunde: durum aynen kalir
      const r = host.getBoundingClientRect();
      // Kenar bolgesi: kisa kenarin %35'i, en fazla 72 ekran pikseli. En yakin kenar secilir; ortada hicbiri.
      let best: Side | null = null, bd = Math.min(72, Math.min(r.width, r.height) * 0.35);
      const d: Record<Side, number> = { t: e.clientY - r.top, b: r.bottom - e.clientY, l: e.clientX - r.left, r: r.right - e.clientX };
      for (const k of ['t', 'r', 'b', 'l'] as Side[]) if (d[k] < bd) { bd = d[k]; best = k; }
      setNear(best);
    };
    const leave = () => setNear(null);
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseleave', leave);
    return () => {
      host.removeEventListener('mousemove', move);
      host.removeEventListener('mouseleave', leave);
    };
  }, [quick]);
  // Ctrl+Alt+Shift basili: bos yonlerin hepsinde onizleme; secili yon belirgin, digerleri silik
  const keys = useFlow((s) => (s.quickKeys?.node === id ? s.quickKeys : null));
  const g = QUICK_GAP;
  const ghostPos: Record<Side, React.CSSProperties> = {
    r: { left: w + g, top: 0 }, l: { left: -w - g, top: 0 }, b: { left: 0, top: h + g }, t: { left: 0, top: -h - g },
  };
  // Arti/eksi ile baska sekil secildiyse yalniz SECILI yondeki onizleme o seklin boyutu ve rengiyle cizilir
  return (
    <>
      <span ref={probe} hidden />
      {SIDES.map(([s, pos]) => (
        <Handle key={s} id={s} type="source" position={pos} className={`side-handle ${quick ? 'quick' : ''} ${quick && near === s ? 'near' : ''}`}
          onMouseEnter={() => { if (quick) { setHover(s); setNear(s); } }} onMouseLeave={() => setHover(null)}
          onClick={() => {
            if (!quick) return;
            setHover(null);
            useFlow.getState().quickAdd(id, s);
          }} />
      ))}
      {quick && hover && !keys && (
        <div className="quick-ghost" style={ghostPos[hover]}>
          <ShapeGhost shape={data.shape} color={data.color} stroke={data.stroke} w={w} h={h} />
        </div>
      )}
      {keys?.sides.map((s) => {
        const alt = keys.side === s ? keys.alt : undefined;
        const o = quickOffset(w, h, s, alt?.shape);
        return (
          <div key={s} className={`quick-ghost keys ${keys.side === s ? 'on' : ''}`} style={{ left: o.dx, top: o.dy }}>
            <ShapeGhost shape={alt?.shape ?? data.shape} color={alt?.color ?? data.color} stroke={alt ? alt.stroke : data.stroke} w={o.w} h={o.h} />
          </div>
        );
      })}
    </>
  );
}

// Birden cok node seciliyse tek tek tutamac gosterilmez (Figma); secim cercevesi App'te cizilir
const useMulti = () => useFlow((s) => {
  let n = 0;
  for (const x of s.nodes) if (x.selected && ++n > 1) return true;
  for (const x of s.edges) if (x.selected && ++n > 1) return true;
  return false;
});

// ---------- Tablo (FigJam): hucre modu, kare secim, klavye, kopyala/yapistir ----------
type Cell = [number, number];
type Range = { a: Cell; f: Cell }; // a: baslangic (anchor), f: uzanan uc
const rangeBox = (s: Range) => ({
  r0: Math.min(s.a[0], s.f[0]), r1: Math.max(s.a[0], s.f[0]), c0: Math.min(s.a[1], s.f[1]), c1: Math.max(s.a[1], s.f[1]),
});
const inRange = (s: Range | null, r: number, c: number) => {
  if (!s) return false;
  const b = rangeBox(s);
  return r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
};
// Panodaki metin: satirlar \n, hucreler \t (Excel / Sheets ile uyumlu)
const toTsv = (cells: string[][], s: Range) => {
  const b = rangeBox(s);
  return cells.slice(b.r0, b.r1 + 1).map((row) => row.slice(b.c0, b.c1 + 1).join('\t')).join('\n');
};
const fromTsv = (t: string) => {
  const rows = t.replace(/\r/g, '').split('\n');
  if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  return rows.map((r) => r.split('\t'));
};

function TableView({ id, data, selected, w, h }: { id: string; data: ShapeData; selected: boolean; w: number; h: number }) {
  const multi = useMulti();
  // Hucre modu: tablonun "icine girilmis" hali (editingId = tablo id)
  const mode = useFlow((s) => s.editingId === id);
  const [sel, setSel] = useState<Range | null>(null);
  const [edit, setEdit] = useState<{ r: number; c: number; init?: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cells = parseTable(data.text);
  const rows = cells.length;
  const cols = cells[0].length;
  const c = nodeColors(data.color, undefined, data.stroke);
  const bw = NODE_STROKE[data.weight ?? 1]; // tablo varsayilani ince
  const st = useRef({ cells, sel, edit, rows, cols });
  st.current = { cells, sel, edit, rows, cols };

  // Moda girilince (or. Enter) ilk hucre secili gelir; moddan cikinca secim temizlenir
  useEffect(() => {
    if (mode && !st.current.sel) setSel({ a: [0, 0], f: [0, 0] });
    if (!mode) { setSel(null); setEdit(null); }
  }, [mode]);
  // Tablo secimden cikarsa moddan da cik
  useEffect(() => {
    if (!selected && useFlow.getState().editingId === id) useFlow.getState().setEditing(null);
  }, [selected, id]);

  const write = (next: string[][], dw = 0, dh = 0) =>
    useFlow.getState().setNodes((all) =>
      all.map((n) =>
        n.id === id
          ? { ...n, width: (n.width ?? w) + dw, height: (n.height ?? h) + dh, data: { ...n.data, text: tableText(next) } }
          : n,
      ),
    );
  const enter = (cell: Cell) => {
    setSel({ a: cell, f: cell });
    useFlow.getState().setEditing(id);
  };
  const exit = () => {
    if (useFlow.getState().editingId === id) useFlow.getState().setEditing(null);
  };

  // Hucre degerlerini yaz; blok tablodan tasarsa satir/sutun eklenir (tablo buyur)
  const putBlock = (r0: number, c0: number, block: string[][]) => {
    const cur = st.current.cells;
    const needR = Math.max(cur.length, r0 + block.length);
    const needC = Math.max(cur[0].length, c0 + Math.max(...block.map((b) => b.length)));
    const next = Array.from({ length: needR }, (_, r) => Array.from({ length: needC }, (_, cc) => cur[r]?.[cc] ?? ''));
    block.forEach((row, i) => row.forEach((v, j) => { next[r0 + i][c0 + j] = v; }));
    const dw = (needC - cur[0].length) * (w / cur[0].length);
    const dh = (needR - cur.length) * (h / cur.length);
    write(next, dw, dh);
  };
  const clearRange = (s: Range) => {
    const b = rangeBox(s);
    putBlock(b.r0, b.c0, Array.from({ length: b.r1 - b.r0 + 1 }, () => Array(b.c1 - b.c0 + 1).fill('')));
  };

  const commit = (r: number, col: number, v: string, move: 'next' | 'prev' | 'down' | 'done' | 'cancel') => {
    if (move !== 'cancel' && v !== st.current.cells[r][col]) putBlock(r, col, [[v]]);
    setEdit(null);
    const { rows: R, cols: C } = st.current;
    let nr = r, nc = col;
    if (move === 'next' || move === 'prev') {
      const i = Math.min(R * C - 1, Math.max(0, r * C + col + (move === 'next' ? 1 : -1)));
      nr = Math.floor(i / C); nc = i % C;
    } else if (move === 'down') nr = Math.min(R - 1, r + 1);
    setSel({ a: [nr, nc], f: [nr, nc] });
    if (move === 'next' || move === 'prev') setEdit({ r: nr, c: nc });
  };

  // Klavye ve pano: sadece hucre modunda, duzenleme yokken. Tuval kisayollarina ulasmasin (yakalama asamasi)
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      const { sel: s, edit: ed, rows: R, cols: C } = st.current;
      if (ed || !s) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ['c', 'x', 'v', 'z', 'y'].includes(e.key.toLowerCase())) { e.stopPropagation(); return; } // pano olaylari / geri al serbest
      e.stopPropagation();
      const move = (dr: number, dc: number, extend: boolean) => {
        const base = extend ? s.f : s.a;
        const n: Cell = [Math.min(R - 1, Math.max(0, base[0] + dr)), Math.min(C - 1, Math.max(0, base[1] + dc))];
        setSel(extend ? { a: s.a, f: n } : { a: n, f: n });
      };
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); exit(); }
      else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0, e.shiftKey); }
      else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0, e.shiftKey); }
      else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1, e.shiftKey); }
      else if (k === 'ArrowRight') { e.preventDefault(); move(0, 1, e.shiftKey); }
      else if (k === 'Tab') {
        e.preventDefault();
        const i = Math.min(R * C - 1, Math.max(0, s.a[0] * C + s.a[1] + (e.shiftKey ? -1 : 1)));
        setSel({ a: [Math.floor(i / C), i % C], f: [Math.floor(i / C), i % C] });
      } else if (k === 'Enter' || k === 'F2') { e.preventDefault(); setEdit({ r: s.a[0], c: s.a[1] }); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearRange(s); }
      else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSel({ a: [0, 0], f: [R - 1, C - 1] }); }
      else if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); setEdit({ r: s.a[0], c: s.a[1], init: k }); } // yazmaya basla
    };
    const onCopy = (e: ClipboardEvent) => {
      const { sel: s, edit: ed, cells: cur } = st.current;
      if (ed || !s || !e.clipboardData) return;
      e.stopPropagation();
      e.preventDefault();
      e.clipboardData.setData('text/plain', toTsv(cur, s));
      if (e.type === 'cut') clearRange(s);
    };
    const onPaste = (e: ClipboardEvent) => {
      const { sel: s, edit: ed } = st.current;
      if (ed || !s) return;
      e.stopPropagation();
      e.preventDefault();
      const t = e.clipboardData?.getData('text/plain') ?? '';
      if (!t) return;
      const block = fromTsv(t);
      const b = rangeBox(s);
      // Tek deger + coklu secim: secimin tamami o degerle dolar; yoksa blok secimin sol ustune yazilir
      if (block.length === 1 && block[0].length === 1 && (b.r1 > b.r0 || b.c1 > b.c0))
        putBlock(b.r0, b.c0, Array.from({ length: b.r1 - b.r0 + 1 }, () => Array(b.c1 - b.c0 + 1).fill(block[0][0])));
      else {
        putBlock(b.r0, b.c0, block);
        setSel({ a: [b.r0, b.c0], f: [b.r0 + block.length - 1, b.c0 + Math.max(...block.map((x) => x.length)) - 1] });
      }
    };
    // Tablo disina tiklamak hucre modundan cikarir
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.closest('.react-flow__node')?.contains(e.target as Node)) exit();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('copy', onCopy, true);
    window.addEventListener('cut', onCopy, true);
    window.addEventListener('paste', onPaste, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('copy', onCopy, true);
      window.removeEventListener('cut', onCopy, true);
      window.removeEventListener('paste', onPaste, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Fare: tek tik = tablo nesne olarak secilir; cift tik = hucre modu. Modda: tik/surukle = hucre/kare secim, Shift+tik = genislet
  const cellAt = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cell');
    if (!el || !rootRef.current?.contains(el)) return null;
    return [Number(el.dataset.r), Number(el.dataset.c)];
  };
  const onCellDown = (e: React.PointerEvent, r: number, col: number) => {
    if (e.button !== 0 || multi) return;
    if (!mode) return; // modda degilken tik tabloyu nesne olarak secer (tasima serbest); mod cift tikla acilir
    if (edit) return;
    e.stopPropagation();
    e.preventDefault();
    const anchorCell: Cell = e.shiftKey && sel ? sel.a : [r, col];
    setSel({ a: anchorCell, f: [r, col] });
    const move = (ev: PointerEvent) => {
      const cc = cellAt(ev.clientX, ev.clientY);
      if (cc) setSel({ a: anchorCell, f: cc });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const addRow = () => write([...cells, Array(cols).fill('')], 0, h / rows);
  const addCol = () => write(cells.map((r) => [...r, '']), w / cols, 0);

  return (
    <div ref={rootRef} className={`table-node ${selected ? 'selected' : ''} ${multi ? 'multi' : ''} ${mode ? 'cell-mode' : ''}`} style={{ background: c.fill, borderColor: c.stroke, color: c.text,
      borderWidth: bw, borderStyle: data.dash ? 'dashed' : 'solid', ['--bw' as string]: `${bw}px`,
      fontSize: FONT_PX[data.size ?? 's'], fontFamily: fontCss(data.font), gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      <NodeResizer isVisible={selected && !multi && !mode} autoScale={false} onResizeEnd={regroupLater} minWidth={cols * 40} minHeight={rows * 28} />
      {cells.map((row, r) =>
        row.map((v, col) => {
          const on = mode && inRange(sel, r, col);
          const isAnchor = mode && sel && sel.a[0] === r && sel.a[1] === col;
          return (
            <div key={`${r}-${col}`} data-r={r} data-c={col}
              className={`cell align-${data.align ?? 'l'} ${mode ? 'nodrag' : ''} ${on ? 'sel' : ''} ${isAnchor ? 'anchor' : ''}`}
              onPointerDown={(e) => onCellDown(e, r, col)}
              onDoubleClick={(e) => {
                // Cift tik: once hucre modu (hucre secili); modda iken cift tik hucreyi duzenler
                e.stopPropagation();
                if (!mode) return enter([r, col]);
                setSel({ a: [r, col], f: [r, col] });
                setEdit({ r, c: col });
              }}>
              {edit && edit.r === r && edit.c === col ? (
                <CellInput key={`${r}-${col}`} value={edit.init ?? v} selectAll={edit.init === undefined} onCommit={(nv, m) => commit(r, col, nv, m)} />
              ) : (
                <InlineText text={v} />
              )}
            </div>
          );
        }),
      )}
      {selected && !mode && (
        <>
          <button className="nodrag add-bar add-col" title="Sutun ekle" onClick={addCol}><Plus size={16} /></button>
          <button className="nodrag add-bar add-row" title="Satir ekle" onClick={addRow}><Plus size={16} /></button>
        </>
      )}
      <SideHandles id={id} data={data} w={w} h={h} quick={false} />
    </div>
  );
}

export function ShapeNode({ id, data, selected, width, height }: NodeProps<ShapeNodeT>) {
  const multi = useMulti();
  const updateNode = useFlow((s) => s.updateNode);
  const editing = useFlow((s) => s.editingId === id);
  const tool = useFlow((s) => s.tool);
  const entered = useFlow((s) => s.entered === id);
  const [resizing, setResizing] = useState(false); // tutamacla boyutlandirma suruyor: kenar noktalari/oklar gizlenir
  const rootRef = useRef<HTMLDivElement>(null);
  // Icine girilen Section: disina tiklayinca ya da Esc ile cikilir
  useEffect(() => {
    if (!entered) return;
    const out = () => { if (useFlow.getState().entered === id) useFlow.getState().setEntered(null); };
    const onDown = (e: PointerEvent) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) out();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') out(); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [entered, id]);
  const w = width ?? 100;
  const h = height ?? 100;
  const { shape, color, text } = data;

  if (shape === 'table') return <TableView id={id} data={data} selected={!!selected} w={w} h={h} />;

  const c = nodeColors(color, shape, data.stroke);
  const isSvg = shape === 'circle' || shape === 'diamond' || shape === 'db';
  const align = data.align ?? (shape === 'text' || text.includes('\n') ? 'l' : 'c');
  const fontSize = FONT_PX[data.size ?? defaultFontSize(shape)];
  const sw = NODE_STROKE[data.weight ?? 2];
  const textStyle: React.CSSProperties = { color: c.text, fontSize, fontFamily: fontCss(data.font), textAlign: align === 'l' ? 'left' : align === 'r' ? 'right' : 'center' };

  const start = () => {
    if (tool === 'select') useFlow.getState().setEditing(id);
  };
  const finish = (draft: string) => {
    const s = useFlow.getState();
    if (s.editingId === id) s.setEditing(null);
    // Bos birakilan yazi node'u silinir (Figma davranisi)
    if (shape === 'text' && !draft.trim()) s.setNodes((all) => all.filter((n) => n.id !== id));
    else if (draft !== text) updateNode([id], { text: draft });
  };

  const textEl = editing ? (
    <EditBox text={text} style={textStyle} autoSize={shape === 'text' || shape === 'group'} onDone={finish} />
  ) : (
    <div className="node-text" style={textStyle}>
      <RichText text={text} />
    </div>
  );

  if (shape === 'group') {
    const gw = data.weight === undefined ? 1 : NODE_STROKE[data.weight];
    return (
      <div ref={rootRef} className={`group-node ${selected ? 'selected' : ''} ${multi ? 'multi' : ''} ${entered ? 'entered' : ''}`} style={{ background: c.fill, borderWidth: gw, ['--bw' as string]: `${gw}px`,
        borderStyle: data.dash ? 'dashed' : 'solid', borderColor: data.weight === undefined ? '#e3e3e3' : c.stroke }}
        onDoubleClick={(e) => {
          // Cift tik (baslik disinda): Section'in icine gir; icerde bos alanda surukleme kare secim yapar
          if ((e.target as HTMLElement).closest('.group-title')) return;
          e.stopPropagation();
          useFlow.setState((st) => ({ nodes: st.nodes.map((n) => (n.id === id && n.selected ? { ...n, selected: false } : n)) }));
          useFlow.getState().setEntered(id);
        }}>
        <NodeResizer isVisible={selected && !multi && !entered && !editing} autoScale={false} onResizeEnd={regroupLater} minWidth={80} minHeight={60} />
        <div className="group-title" style={{ fontFamily: fontCss(data.font) }} onDoubleClick={start}>
          {editing ? textEl : text ? <InlineText text={text} /> : 'Section'}
        </div>
      </div>
    );
  }

  const style: React.CSSProperties = isSvg || shape === 'text'
    ? {}
    : {
        background: c.fill,
        borderColor: c.stroke,
        borderWidth: sw,
        ['--bw' as string]: `${sw}px`,
        borderStyle: data.dash ? 'dashed' : 'solid',
        borderRadius: shape === 'pill' ? h / 2 : shape === 'round' ? Math.min(w, h) * 0.3 : 4,
      };

  return (
    <div className={`shape-node shape-${shape} ${selected ? 'selected' : ''} ${multi ? 'multi' : ''} ${editing ? 'editing' : ''} ${resizing ? 'resizing' : ''}`} style={style} onDoubleClick={start}>
      {shape !== 'text' && <NodeResizer isVisible={selected && !multi && !editing} autoScale={false} onResizeStart={() => setResizing(true)} onResizeEnd={() => { setResizing(false); regroupLater(); }} minWidth={24} minHeight={24} />}
      {isSvg && <ShapeSvg shape={shape} w={w} h={h} fill={c.fill} stroke={c.stroke} sw={sw} dash={data.dash} />}
      {textEl}
      <SideHandles id={id} data={data} w={w} h={h} quick={!!selected && !multi && shape !== 'text'} />
    </div>
  );
}

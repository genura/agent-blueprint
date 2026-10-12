import { useEffect, useRef, useState } from 'react';
import {
  BaseEdge, EdgeLabelRenderer, EdgeToolbar, ViewportPortal, useInternalNode,
  useReactFlow,
} from '@xyflow/react';
import type { EdgeProps, InternalNode } from '@xyflow/react';
import { DASH, EDGE_STROKE, PALETTE, colorHex } from '../flow/format';
import { anchor, autoSides, buildPath, makeBox, pointBox } from '../flow/edgeGeom';
import type { Box, Pt } from '../flow/edgeGeom';
import { CAP_GEOM, edgeCaps } from '../flow/caps';
import type { Side } from '../flow/format';
import { useFlow } from '../flow/store';
import type { FlowEdge as FlowEdgeT } from '../flow/store';
import { EdgeBar } from './Toolbars';

const SELECT = '#4C9AFF';

function box(n: InternalNode): Box {
  const { x, y } = n.internals.positionAbsolute;
  return makeBox(x, y, n.measured.width ?? n.width ?? 0, n.measured.height ?? n.height ?? 0);
}

function LabelInput({ id, value }: { id: string; value: string }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = () => {
    const s = useFlow.getState();
    if (s.editingId === `edge:${id}`) s.setEditing(null);
    if (draft !== value) s.updateEdge([id], { label: draft.trim() });
  };
  return (
    <input ref={ref} className="nodrag nopan edge-label-input" value={draft} size={Math.max(4, draft.length + 1)}
      onChange={(e) => setDraft(e.target.value)} onBlur={done}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') ref.current?.blur();
      }} />
  );
}

// Pointer ile surukleme: hareketi ekran pikseli olarak bildirir
function startDrag(e: React.PointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent) => void, onEnd: (ev: PointerEvent | null, moved: boolean) => void) {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    onMove(dx, dy, ev);
  };
  const stop = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    window.removeEventListener('flowcancel', cancel);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  const up = (ev: PointerEvent) => {
    stop();
    onEnd(ev, moved);
  };
  const cancel = () => {
    stop();
    onEnd(null, false);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  window.addEventListener('flowcancel', cancel);
}

type DragEnd = { end: 'source' | 'target'; p: Pt; snap?: { id: string; side: Side } };
const SNAP_PX = 28; // ekran pikseli: bu mesafedeki node'a uc kilitlenir

// Noktayi iceren (ya da yakinindaki) en kucuk node ve ona en yakin kenar
function snapAt(nodes: InternalNode[], p: Pt, skip: string, r: number): { id: string; side: Side } | undefined {
  let best: { id: string; side: Side; area: number; d: number } | undefined;
  for (const n of nodes) {
    if (n.id === skip) continue;
    const b = box(n);
    const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
    const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    const area = b.w * b.h;
    // Icindeyse en kucuk node; disaridaysa en yakini
    if (best && (d > best.d || (d === best.d && area >= best.area))) continue;
    const sd: [Side, number][] = [['l', Math.abs(p.x - b.x)], ['r', Math.abs(p.x - b.x - b.w)], ['t', Math.abs(p.y - b.y)], ['b', Math.abs(p.y - b.y - b.h)]];
    best = { id: n.id, side: sd.sort((u, v) => u[1] - v[1])[0][0], area, d };
  }
  return best && { id: best.id, side: best.side };
}

function selectOnly(id: string) {
  useFlow.setState((s) => ({
    nodes: s.nodes.some((n) => n.selected) ? s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) : s.nodes,
    edges: s.edges.map((e) => (e.selected !== (e.id === id) ? { ...e, selected: e.id === id } : e)),
  }));
}

export function FlowEdge({ id, source, target, data, selected }: EdgeProps<FlowEdgeT>) {
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  const rf = useReactFlow();
  const editing = useFlow((s) => s.editingId === `edge:${id}`);
  const tbHidden = useFlow((s) => s.tbHidden); // M: secim cubugu gizli
  const onlyThis = useFlow((s) => !s.nodes.some((n) => n.selected) && s.edges.filter((e) => e.selected).length === 1);
  const [dragEnd, setDragEnd] = useState<DragEnd | null>(null);
  const dragRef = useRef<DragEnd | null>(null);
  if (!sn || !tn || !data) return null;

  // Surukleme oncesi (gercek) kenarlar
  let a = box(sn);
  let b = box(tn);
  const auto0 = autoSides(a, b);
  const fixed = (i: 0 | 1) => !!data.sides && data.sides[i] !== '*';
  const side0: [Side, Side] = [fixed(0) ? (data.sides![0] as Side) : auto0[0], fixed(1) ? (data.sides![1] as Side) : auto0[1]];
  let [ss, ts] = side0;
  if (dragEnd) {
    // Tasinmayan uc yerinde kalir; tasinan uc yakindaki node'a kilitlenir, yoksa imleci izler
    const snapBox = dragEnd.snap ? rf.getInternalNode(dragEnd.snap.id) : undefined;
    const free = snapBox ? box(snapBox) : pointBox(dragEnd.p);
    if (dragEnd.end === 'source') a = free; else b = free;
    const auto = autoSides(a, b);
    if (dragEnd.end === 'source') ss = dragEnd.snap?.side ?? auto[0]; else ts = dragEnd.snap?.side ?? auto[1];
  }
  const p1 = dragEnd?.end === 'source' && !dragEnd.snap ? dragEnd.p : anchor(a, ss);
  const p2 = dragEnd?.end === 'target' && !dragEnd.snap ? dragEnd.p : anchor(b, ts);
  const [path, lx, ly] = buildPath(dragEnd ? { ...data, bend: undefined } : data, p1, ss, p2, ts);

  const color = colorHex(data.color) ?? PALETTE.g;
  const markerId = `arrow-${id}`;
  const [capS, capE] = edgeCaps(data);
  const stroke = selected ? SELECT : color;

  // Ortadaki tutamac (ya da etiket) surukleyince baglanti bukulur
  const onBendDown = (e: React.PointerEvent) => {
    if (!selected) selectOnly(id);
    const base = data.bend ?? [0, 0];
    const zoom = rf.getZoom();
    startDrag(e,
      (dx, dy) => useFlow.getState().updateEdge([id], { bend: [Math.round(base[0] + dx / zoom), Math.round(base[1] + dy / zoom)] }),
      () => {});
  };

  // Uc tutamacini baska node'a birak: baglanti oraya tasinir; bir kenar noktasina birakirsan o kenara sabitlenir
  // Uc tutamacini baska node'a birak: baglanti oraya tasinir. Imlec bir node'un uzerinde ya da yakininda
  // ise uc o node'un en yakin kenarina kilitlenir (birakmadan once gorunur). Diger uc kenarini korur.
  const onEndDown = (end: 'source' | 'target') => (e: React.PointerEvent) => {
    const other = end === 'source' ? target : source;
    const keep = end === 'source' ? side0[1] : side0[0];
    startDrag(e,
      (_dx, _dy, ev) => {
        const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const d = { end, p, snap: snapAt(rf.getNodes().map((n) => rf.getInternalNode(n.id)!).filter(Boolean), p, other, SNAP_PX / rf.getZoom()) };
        dragRef.current = d;
        setDragEnd(d);
      },
      (ev, moved) => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragEnd(null);
        if (!moved || !ev || !d?.snap) return;
        useFlow.getState().reconnect(id, end, d.snap.id, d.snap.side, keep);
      });
  };

  // Coklu secimde tutamac yok (Figma); sadece tek baglanti seciliyse
  const showHandles = selected && !editing && onlyThis;

  return (
    <>
      <defs>
        {([['s', capS], ['e', capE]] as const).map(([k, cap]) => cap && (
          <marker key={k} id={`${markerId}-${k}`} viewBox="-11 -6 12 12" refX="0" refY="0" markerWidth="12" markerHeight="12"
            markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d={CAP_GEOM[cap].d} fill={CAP_GEOM[cap].fill ? stroke : 'none'} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerStart={capS ? `url(#${markerId}-s)` : undefined}
        markerEnd={capE ? `url(#${markerId}-e)` : undefined}
        interactionWidth={20}
        style={{ stroke: selected ? SELECT : color, strokeWidth: EDGE_STROKE[data.weight ?? 2], strokeLinecap: 'round',
          strokeDasharray: data.dash ? DASH : undefined }}
      />
      <EdgeLabelRenderer>
        {(data.label || editing) && (
          <div className={`edge-label nodrag nopan ${selected ? 'selected' : ''}`} data-edge={id}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            onPointerDown={editing ? undefined : onBendDown}
            onDoubleClick={() => useFlow.getState().setEditing(`edge:${id}`)}>
            {editing ? <LabelInput id={id} value={data.label} /> : data.label}
          </div>
        )}
      </EdgeLabelRenderer>
      {/* Tutamaclar node katmaninin ustunde olmali; yoksa node kenarindaki uc tutulamaz */}
      <ViewportPortal>
        {showHandles && !data.label && (
          <div className="edge-bend nodrag nopan" title="Surukle: buk · Cift tik: etiket"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            onPointerDown={onBendDown}
            onDoubleClick={() => useFlow.getState().setEditing(`edge:${id}`)} />
        )}
        {showHandles && (
          <>
            <div className="edge-end nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${p1.x}px, ${p1.y}px)` }}
              onPointerDown={onEndDown('source')} />
            <div className="edge-end nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${p2.x}px, ${p2.y}px)` }}
              onPointerDown={onEndDown('target')} />
          </>
        )}
      </ViewportPortal>
      <EdgeToolbar edgeId={id} x={lx} y={ly - 36} alignY="bottom" isVisible={!!selected && onlyThis && !editing && !dragEnd && !tbHidden}>
        <EdgeBar ids={[id]} data={data} />
      </EdgeToolbar>
    </>
  );
}

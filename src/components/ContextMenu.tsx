import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useFlow } from '../flow/store';

// Sag tik menusu. Tiklanan seye gore bes baglam var; her baglamin kendi ogeleri olabilir (contextItems).
// Yeni oge eklemek icin: ilgili baglamin listesine { label, icon, run } ekle; { sep: true } ayrac cizer.
export type ContextKind = 'pane' | 'node' | 'edge' | 'group' | 'selection';
export type ContextTarget = { kind: ContextKind; x: number; y: number; count: number };
type Item = { sep: true } | { sep?: false; label: string; icon?: ReactNode; hint?: string; disabled?: boolean; run: () => void };

const KIND_NAMES: Record<ContextKind, string> = { pane: 'Tuval', node: 'Nesne', edge: 'Baglanti', group: 'Grup', selection: 'Secim' };

// Her yerde gorunen ogeler (en altta)
const COMMON: Item[] = [
  { label: 'About', icon: <Info size={16} />, hint: 'quanticvision.co.uk', run: () => window.open('https://quanticvision.co.uk', '_blank', 'noopener,noreferrer') },
];

// Baglama ozel ogeler: simdilik bos, ileride buraya eklenir (ortak ogelerden ayracla ayrilir)
function contextItems(kind: ContextKind): Item[] {
  const own: Record<ContextKind, Item[]> = { pane: [], node: [], edge: [], group: [], selection: [] };
  const items = own[kind];
  return items.length ? [...items, { sep: true }, ...COMMON] : COMMON;
}

// O anki secime gore baglam: tek baglanti, tek nesne, bir grup (Section ya da tam bir mantiksal grup), ya da karisik/coklu secim
export function selectionKind(): { kind: ContextKind; count: number } {
  const s = useFlow.getState();
  const ns = s.nodes.filter((n) => n.selected), es = s.edges.filter((e) => e.selected);
  const count = ns.length + es.length;
  if (!count) return { kind: 'pane', count: 0 };
  if (!ns.length && es.length === 1) return { kind: 'edge', count };
  if (!es.length && ns.length === 1) return { kind: ns[0].data.shape === 'group' ? 'group' : 'node', count };
  const key = ns[0]?.data.sets?.[0];
  if (!es.length && key && ns.every((n) => n.data.sets?.[0] === key) && s.nodes.filter((n) => n.data.sets?.[0] === key).length === ns.length)
    return { kind: 'group', count };
  return { kind: 'selection', count };
}

export function ContextMenu({ target, onClose }: { target: ContextTarget; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Menu pencere disina tasmasin: sag/alt kenara yakinsa sola/yukari acilir
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setPos({
      left: Math.max(8, target.x + w > window.innerWidth - 8 ? target.x - w : target.x),
      top: Math.max(8, target.y + h > window.innerHeight - 8 ? target.y - h : target.y),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [target]);

  useEffect(() => {
    const off = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    // Klavye: yukari/asagi gezer, Enter/Bosluk secer (dugmenin kendi davranisi), Esc kapatir. Tuslar tuvale ulasmaz.
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        return onClose();
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1) + btns.length) % btns.length].focus();
    };
    window.addEventListener('mousedown', off, true);
    window.addEventListener('wheel', off, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', off, true);
      window.removeEventListener('wheel', off, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const items = contextItems(target.kind);
  return createPortal(
    <div className="ctx-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-head">{KIND_NAMES[target.kind]}{target.count > 1 ? ` (${target.count})` : ''}</div>
      {items.map((it, i) => it.sep ? <div key={i} className="ctx-sep" /> : (
        <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { onClose(); it.run(); }}>
          <span className="ctx-icon">{it.icon}</span>
          <span className="ctx-label">{it.label}</span>
          {it.hint && <span className="ctx-hint">{it.hint}</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

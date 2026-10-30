import type { ReactNode } from 'react';
import { findAll } from '../flow/search';
import { useFlow } from '../flow/store';

// Duz metin parcasi: arama acikken sorguyla eslesen yerler <mark> rozetine sarilir (renkleri SearchBox belirler)
export function Hl({ s }: { s: string }) {
  const fq = useFlow((st) => st.searchFq);
  const r = fq ? findAll(s, fq) : [];
  if (!r.length) return s;
  const out: ReactNode[] = [];
  let at = 0;
  r.forEach(([a, b], i) => {
    if (a > at) out.push(s.slice(at, a));
    out.push(<mark key={i} className="hl">{s.slice(a, b)}</mark>);
    at = b;
  });
  if (at < s.length) out.push(s.slice(at));
  return out;
}

function inline(s: string, key = 0): ReactNode[] {
  const parts = s.split(/(\*\*.+?\*\*|~~.+?~~)/);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <b key={k}>{inline(p.slice(2, -2), i)}</b>;
    if (p.length > 4 && p.startsWith('~~') && p.endsWith('~~')) return <s key={k}>{inline(p.slice(2, -2), i)}</s>;
    return p ? <Hl key={k} s={p} /> : p;
  });
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const li = line.startsWith('- ');
        const body = li ? line.slice(2) : line;
        return (
          <div key={i} className={li ? 'li' : undefined}>
            {body ? inline(body) : ' '}
          </div>
        );
      })}
    </>
  );
}

export function InlineText({ text }: { text: string }) {
  return <>{inline(text)}</>;
}

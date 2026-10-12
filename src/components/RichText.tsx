import type { ReactNode } from 'react';

function inline(s: string, key = 0): ReactNode[] {
  const parts = s.split(/(\*\*.+?\*\*|~~.+?~~)/);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <b key={k}>{inline(p.slice(2, -2), i)}</b>;
    if (p.length > 4 && p.startsWith('~~') && p.endsWith('~~')) return <s key={k}>{inline(p.slice(2, -2), i)}</s>;
    return p;
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
            {body ? inline(body) : ' '}
          </div>
        );
      })}
    </>
  );
}

export function InlineText({ text }: { text: string }) {
  return <>{inline(text)}</>;
}

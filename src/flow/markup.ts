// Node metnindeki mini markdown: **kalin**, ~~cizili~~, "- " ile baslayan satir = liste

export type Mark = '**' | '~~';

const lines = (t: string) => t.split('\n');
const splitBullet = (l: string) => (l.startsWith('- ') ? ['- ', l.slice(2)] : ['', l]);
const wrapped = (s: string, m: Mark) => s.length > 2 * m.length && s.startsWith(m) && s.endsWith(m);

export function hasMark(text: string, m: Mark) {
  const body = lines(text).map((l) => splitBullet(l)[1]).filter((b) => b.trim());
  return body.length > 0 && body.every((b) => wrapped(b, m) || (m === '~~' && wrapped(b, '**') && wrapped(b.slice(2, -2), '~~')));
}

// Tum metni (bos olmayan her satiri) isaretle ya da isareti kaldir
export function toggleMark(text: string, m: Mark) {
  const on = hasMark(text, m);
  return lines(text)
    .map((l) => {
      const [pre, body] = splitBullet(l);
      if (!body.trim()) return l;
      if (on) {
        if (wrapped(body, m)) return pre + body.slice(m.length, -m.length);
        // **~~x~~** icinden ~~ kaldir
        return pre + '**' + body.slice(4, -4) + '**';
      }
      return pre + m + body + m;
    })
    .join('\n');
}

export const hasList = (text: string) => {
  const ls = lines(text).filter((l) => l.trim());
  return ls.length > 0 && ls.every((l) => l.startsWith('- '));
};

export function toggleList(text: string) {
  const on = hasList(text);
  return lines(text)
    .map((l) => (!l.trim() ? l : on ? l.replace(/^- /, '') : l.startsWith('- ') ? l : '- ' + l))
    .join('\n');
}

// Textarea icinde secili metni isaretle (Ctrl+B / Ctrl+Shift+X)
export function wrapSelection(value: string, start: number, end: number, m: Mark) {
  const sel = value.slice(start, end);
  if (wrapped(sel, m)) {
    const inner = sel.slice(m.length, -m.length);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  return { value: value.slice(0, start) + m + sel + m + value.slice(end), start, end: end + 2 * m.length };
}

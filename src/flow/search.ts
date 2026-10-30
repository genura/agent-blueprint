// Arama cekirdegi: arayuzden ve React'ten bagimsiz, saf fonksiyonlar.
// Uc katman:
//   1. fold / findAll: buyuk-kucuk harf ve Turkce harf farkini yok sayan eslestirme (uzunlugu korur: bulunan aralik
//      asil metinde ayni yere duser, vurgulama icin gerekli)
//   2. SearchItem: aranabilir bir oge (nesne ya da baglanti) ve metin parcalari. Kaynaga gore uretilir:
//      storeItems (acik sema, React Flow nesneleri) ya da graphItems (dosyadan okunan FGraph)
//   3. searchItems: ogeler + sorgu -> eslesenler
// Ileriye hazirlik (tum semalarda arama): searchFlowText bir .flow dosyasinin METNINI alir ve eslesenleri dondurur;
// sunucudan dosyalari okuyup bunu cagirmak yeterlidir. Ayrinti: docs/ARAMA.md
import { parseFlow, parseTable } from './format';
import type { FGraph, Shape } from './format';

const FOLD: Record<string, string> = { ı: 'i', İ: 'i', I: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u' };

// Karsilastirma icin sadelestir: kucuk harf + Turkce harflerin ASCII karsiligi. Her karakter TEK karaktere doner.
export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const m = FOLD[ch];
    if (m) { out += m; continue; }
    const l = ch.toLowerCase();
    out += l.length === 1 ? l : ch;
  }
  return out;
}

// Sorgu: bastaki/sondaki bosluk atilir; bos sorgu = arama yok
export const foldQuery = (q: string) => fold(q.trim());

// text icinde fq'nun (fold edilmis sorgu) gectigi araliklar [baslangic, bitis)
export function findAll(text: string, fq: string): [number, number][] {
  if (!fq) return [];
  const t = fold(text);
  const out: [number, number][] = [];
  for (let i = t.indexOf(fq); i !== -1; i = t.indexOf(fq, i + fq.length)) out.push([i, i + fq.length]);
  return out;
}

// Nesne metnini aranacak parcalara ayir: tablo -> hucreler, digerleri -> satirlar. Bicim isaretleri (**, ~~, "- ") atilir.
export function textSegments(text: string, shape?: Shape): string[] {
  const parts = shape === 'table' ? parseTable(text).flat() : text.split('\n').map((l) => (l.startsWith('- ') ? l.slice(2) : l));
  return parts.map((p) => p.replace(/\*\*|~~/g, '')).filter((p) => p.trim());
}

export interface SearchItem {
  key: string; // 'n:<id>' ya da 'e:<id>'
  kind: 'node' | 'edge';
  id: string;
  segs: string[];
}
export interface SearchHit {
  key: string;
  kind: 'node' | 'edge';
  id: string;
  count: number; // ogedeki eslesme sayisi
}

// Acik sema (store): React Flow nesneleri ve baglantilari
export function storeItems(
  nodes: { id: string; data: { shape: Shape; text: string } }[],
  edges: { id: string; data?: { label: string } }[],
): SearchItem[] {
  const out: SearchItem[] = [];
  for (const n of nodes) out.push({ key: `n:${n.id}`, kind: 'node', id: n.id, segs: textSegments(n.data.text, n.data.shape) });
  for (const e of edges) if (e.data?.label) out.push({ key: `e:${e.id}`, kind: 'edge', id: e.id, segs: [e.data.label] });
  return out;
}

// Dosyadan okunan sema. Baglantinin dosyada kimligi yoktur: 'from>to#sira' kullanilir.
export function graphItems(g: FGraph): SearchItem[] {
  const out: SearchItem[] = [];
  for (const n of g.nodes) out.push({ key: `n:${n.id}`, kind: 'node', id: n.id, segs: textSegments(n.text, n.shape) });
  g.edges.forEach((e, i) => {
    if (e.label) out.push({ key: `e:${e.from}>${e.to}#${i}`, kind: 'edge', id: `${e.from}>${e.to}#${i}`, segs: [e.label] });
  });
  return out;
}

export function searchItems(items: SearchItem[], query: string): SearchHit[] {
  const fq = foldQuery(query);
  if (!fq) return [];
  const out: SearchHit[] = [];
  for (const it of items) {
    let count = 0;
    for (const s of it.segs) count += findAll(s, fq).length;
    if (count) out.push({ key: it.key, kind: it.kind, id: it.id, count });
  }
  return out;
}

// Tum semalarda arama icin: bir .flow dosyasinin metninde ara (henuz arayuzde kullanilmiyor)
export const searchFlowText = (src: string, query: string): SearchHit[] => searchItems(graphItems(parseFlow(src).graph), query);

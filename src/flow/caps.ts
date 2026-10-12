import type { Cap } from './format';

// Baglanti ucu sekilleri: uc noktasi (0,0)'da, cizgi +x yonunde gelir. Uygulama (marker), onizlemeler ve SVG disa aktarim ayni yolu kullanir.
export const CAP_GEOM: Record<Cap, { d: string; fill: boolean }> = {
  a: { d: 'M-8,-5 L0,0 L-8,5', fill: false },
  t: { d: 'M-9,-5 L0,0 L-9,5 Z', fill: true },
  d: { d: 'M-10,0 L-5,-4.5 L0,0 L-5,4.5 Z', fill: true },
  c: { d: 'M0,0 A4.5,4.5 0 1 1 -9,0 A4.5,4.5 0 1 1 0,0 Z', fill: true },
};

// Bir baglantinin iki ucu: [baslangic, bitis]; uc yoksa undefined. Bitis varsayilani cizgi ok.
export const edgeCaps = (e: { arrow: boolean; start?: Cap; end?: Cap }): [Cap | undefined, Cap | undefined] =>
  [e.start, e.arrow ? e.end ?? 'a' : undefined];

// SVG metni (disa aktarim): uc (x,y) noktasinda, deg yonune bakar
export function capSvg(cap: Cap, x: number, y: number, deg: number, color: string): string {
  const g = CAP_GEOM[cap];
  const r = (v: number) => Math.round(v * 100) / 100;
  return `<path d="${g.d}" transform="translate(${r(x)} ${r(y)}) rotate(${r(deg)})" fill="${g.fill ? color : 'none'}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

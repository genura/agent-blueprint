// Gercek token sayimi: cl100k_base (Distoken ile ayni). Claude'un kendi tokenizer'i yerelde yok;
// bu tur metinlerde cl100k iyi bir yaklasimdir. Sozluk (~1 MB) ilk kullanimda ayri parca olarak yuklenir.
import type { Tiktoken } from 'js-tiktoken/lite';

let enc: Tiktoken | null = null;
let loading: Promise<Tiktoken> | null = null;

export function loadTokenizer(): Promise<Tiktoken> {
  if (enc) return Promise.resolve(enc);
  loading ??= Promise.all([import('js-tiktoken/lite'), import('js-tiktoken/ranks/cl100k_base')]).then(
    ([lite, ranks]) => (enc = new lite.Tiktoken(ranks.default)),
  );
  return loading;
}

// Sozluk henuz yuklenmediyse null
export const countTokens = (text: string): number | null => (enc ? enc.encode(text).length : null);

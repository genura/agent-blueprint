import { useEffect, useMemo, useState } from 'react';
import { useFlow } from './store';
import { countTokens, loadTokenizer } from './tokens';

// 105.5K, 952.1M gibi kisa gosterim
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compactNumber = (n: number) => compact.format(n);

// cl100k_base ile gercek sayim (Distoken ile ayni); sozluk yuklenene kadar null.
// Agent diski okur: degisiklik yoksa diskteki birebir metin, varsa kaydedilecek metin sayilir.
export function useTokens(): number | null {
  const countText = useFlow((s) => (s.current !== s.saved ? s.current : s.disk));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void loadTokenizer().then(() => setReady(true));
  }, []);
  return useMemo(() => (ready ? countTokens(countText) : null), [countText, ready]);
}

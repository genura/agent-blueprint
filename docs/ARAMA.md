# Arama

Durum (2026-10-12): yalniz ACIK semanin icinde arama var. Tum semalarda arama icin cekirdek hazir, arayuzu yok.

## Su an calisan: sema ici arama

- Ctrl+F ya da F3 arama kutusunu acar. Enter / F3 sonraki, Shift+Enter / Shift+F3 onceki, Esc kapatir.
- Aranan yerler: nesne yazilari, Section basliklari, tablo hucreleri, baglanti etiketleri. Nesne kimligi (`id`) aranmaz.
- Buyuk-kucuk harf ve Turkce harf farki yok sayilir ("sema" yazinca "Şema" da bulunur).
- Sonuc sayisi OGE sayisidir (bir nesnede kelime uc kez gecse de tek sonuc). Sira: yukaridan asagi, sonra soldan saga.
- Kutudan kapatinca (Esc / carpi) gezilen oge secili kalir.
- Arama modu tuvalde baska ise gecilince kendiliginden biter: tuvale sol tik, bir seyin secilmesi (nisangahla Enter,
  Tab), ya da hicbir sey secili degilken tuvalde Esc. Bu yollarla kapaninca gezilen oge secilmez.
- Kutu tasinabilir; yeri `localStorage` icinde `flow-search-pos` anahtarinda durur. Acilista kutunun yarisindan
  fazlasi tuvalin disindaysa varsayilan yere (sag ust) doner.

## Dosyalar

| Dosya | Gorev |
| --- | --- |
| `src/flow/search.ts` | Cekirdek. Saf fonksiyonlar; React ve arayuz bilmez |
| `src/components/SearchBox.tsx` | Kutu, kisayollar, gezinme, ekrani ogeye tasima, yer hatirlama |
| `src/components/RichText.tsx` (`Hl`) | Eslesen kelimeyi `<mark class="hl">` rozetine sarar |
| `src/flow/store.ts` | `searchOpen`, `searchQ`, `searchFq`, `searchCur` alanlari |
| `src/App.css` (sondaki "Sema ici arama" bolumu) | Kutu, rozet ve soldurma stilleri |

Gorunum nasil kuruluyor:
- Rozet rengi CSS degiskeniyle gelir (`--hl-bg`, `--hl-ring`). Varsayilan sari; `SearchBox` gezilen ogeye bu
  degiskenleri turuncu olarak yazan tek bir `<style>` kurali basar.
- Soldurma: `SearchBox` tuvale `data-search` isareti koyar; `App.css` icinde `:has(mark.hl)` olmayan ogeler solar.
  Yani hangi ogenin eslestigini ayrica isaretlemek gerekmez.

## Ileriye hazirlik: tum semalarda arama

`search.ts` uc katmandir ve ilk ikisi kaynaktan bagimsizdir:

1. `fold`, `findAll`: eslestirme.
2. `SearchItem`: aranabilir oge. `storeItems` acik semadan, `graphItems` dosyadan okunan `FGraph`'tan uretir.
3. `searchItems(items, sorgu)`: eslesenleri dondurur.

`searchFlowText(dosyaMetni, sorgu)` bu ucunu birlestirir ve su an hicbir yerden cagrilmaz; genel arama icin konuldu.

Genel aramayi eklemek icin kalan is:
1. Dosya metinlerini al: `vite-plugin-flow.ts` icindeki dosya API'si tek tek dosya okuyabiliyor. Cok dosyada yavas
   kalirsa tum dosyalari tek istekte donduren bir uc eklenir.
2. Her dosya icin `searchFlowText` cagir, sonucu "dosya -> eslesen oge sayisi" olarak listele.
3. Arayuz: en dogal yer F9 secicisi (`src/components/FilePicker.tsx`); su an yalniz dosya adina bakiyor.
4. Sonuca tiklaninca: dosyayi ac, `searchOpen: true`, `searchQ` ve `searchFq` degerlerini yaz. Sema ici arama
   kaldigi yerden devralir; ek kod gerekmez.

Dikkat: dosyadan okunan baglantinin kimligi yoktur, `graphItems` `from>to#sira` uretir. Bu anahtar acik semadaki
baglanti kimligiyle AYNI DEGILDIR; dosyalar arasi sonuctan belirli bir baglantiya atlamak gerekirse eslestirme yazilmalidir.

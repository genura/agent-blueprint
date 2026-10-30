# Agent Blueprint

FigJam benzeri yerel canvas; semalar agent icin token tasarruflu `.flow` dosyalarinda durur.
Kullanim ve format ozeti: [README.md](README.md).

## Nerede ne var
- `src/flow/format.ts`: `.flow` parse/serialize, palet, varsayilanlar, dosya basligi (`HEADER`)
- `src/flow/store.ts`: state, dosya islemleri, undo, kopyala/yapistir, hizli ekleme
- `vite-plugin-flow.ts`: dosya API'si, izleme (SSE), klasor secimi, rehber kopyalama
- `folder-picker.ps1`: modern Windows "Klasor sec" penceresi (IFileOpenDialog); `-DryRun` ile pencere acmadan dogrulanir
- `reveal.ps1`: klasoru/dosyayi Explorer'da acar ve pencereyi one getirir (acik pencere varsa onu kullanir)
- `src/components/`: node, edge, arac cubuklari
- `src/flow/search.ts` + `src/components/SearchBox.tsx`: sema ici arama (Ctrl+F / F3). Yapi ve tum semalarda arama icin
  hazirlik: [docs/ARAMA.md](docs/ARAMA.md)
- `guide/`: rehberin MASTER dort dosyasi (sadece burada duzenlenir). `FLOW_GUIDE.md`: agent'lar icin format rehberi (Ingilizce). `FLOW_GUIDE.flow`: tum sekil/renk/bicim/baglanti
  seceneklerini gosteren ornek; `FLOW_GUIDE.png`: o ornegin uygulamadaki goruntusu; `FLOW_GUIDE.mjs`: dogrulayici
  (`scripts/flow-check.ts` + `format.ts`'ten `npm run build:guide` ile uretilir; dev sunucusu kaynak degisince kendisi uretir).
  Dort dosya tek seydir, hep ayni adla; hepsi MASTER'dir ve `guide/` icinde kalir. Sema klasorlerine YALNIZ
  `FLOW_GUIDE.md` kopyalanir: master'daki `<GUIDE>` yerine `guide/` tam yolu, `<!-- guide-dir -->` satiri yerine
  "kopyadir" notu yazilir. Uygulama secili klasordeki, `schema/` ve son klasorlerdeki md kopyalarini guncel tutar
  (klasor secilince, sunucu acilinca, master md degisince; icerik ayniysa yazmaz). Rehber ornegi uygulamada master'dan okunur

## Bakim kurallari
- **REHBER DORTLUSU (`FLOW_GUIDE.md` + `.flow` + `.png` + `.mjs`) HER ZAMAN BIRLIKTE GUNCEL KALIR.**
  `.flow` formatina ya da agent'in gorecegi davranisa dokunan her yapisal degisiklikte (yeni sekil, bicim/secenek
  karakteri, varsayilan, kural, gorunumu degistiren render degisikligi) dort dosyayi mantiksal olarak birlikte ele al:
  0. Rehberin basindaki dort dosya tablosu ve "Version note" paragrafi (agent dosyalari okur, surumu hafizasina alir,
     'tekrar oku' denince surum farkliysa dosyalari yeniden okur) korunur; surum numarasi sadece ilk satirda ve basliktadir.
  1. `FLOW_GUIDE.md`: ilgili bolumu guncelle; ilk satirdaki `flow-guide vN` ve basliktaki `guide vN` surumunu bir artir.
  2. `FLOW_GUIDE.flow`: yeni secenegi bir ornek node/edge olarak ekle (metni/etiketi kendi sozdizimini yazar).
     Hatasiz parse edildigini ve okuyup geri yazinca degismedigini dogrula.
  3. `FLOW_GUIDE.png`: `.flow` ya da gorunum degistiyse yeniden al: test sunucusunda (5174 + `FLOW_CONFIG`)
     `FLOW_GUIDE.flow`'u ac, Disa aktar -> Tum sema, PNG 2x; cikan dosyayi `guide/FLOW_GUIDE.png` olarak kopyala.
  4. Gerek yoksa (or. sadece arayuz degisikligi) dokunma, ama kullaniciya "rehber etkilenmedi" diye soyle.
  5. `FLOW_GUIDE.mjs`: kural degistiyse `scripts/flow-check.ts`i guncelle, `npm run build:guide`; rehber ornegi ve
     `FLOW_GUIDE.flow` `node FLOW_GUIDE.mjs` ile 0 hata 0 uyari vermeli. Hata/uyari kodlari rehberde listeli.
  6. Is bitince sema klasorlerindeki `FLOW_GUIDE.md` kopyalarinin surumunun master ile ayni oldugunu kontrol et.
  7. Master md'de diger uc dosyaya atif hep `<GUIDE>/FLOW_GUIDE.x` bicimindedir; `<!-- guide-dir -->` satirini silme.
- Rehberi sadece master'da (`guide/`) duzenle; sema klasorundeki kopyaya elle yazma. Kullaniciya dosyadan
  bahsederken tam yolunu ver (master mi, kopya mi belli olsun).
- `FLOW_GUIDE.md` Ingilizce kalir (sadece agent okur, token tasarrufu). Diger dosyalar Turkce.
- **Rehberi sadece Claude okumaz:** Gemini, GPT, Codex vb. her model/agent okur. Rehber ve ornek dosyalari MODEL-NOTR yaz:
  Claude'a ozel arac, komut, dosya adi ya da davranis varsayma; "gorsel okuyabiliyorsan" gibi kosullu ifadeler kullan;
  acik, duz cumleler ve tablolar yaz (zayif modeller de dogru anlasin). Rehberde "Claude" kelimesi gecmez.
- README'deki format tablosunu da ayni degisiklikle guncelle.
- Uygulama dosyayi yeniden yazarken agent'in `#` yorumlarini korur (format.ts `FComments`); bu davranisi bozma.
- Varsayilan degerler dosyaya yazilmaz; yeni bir alan eklerken bu ilkeyi koru.
- Test: kullanicinin `schema/` dosyalarina ve 5173'teki sunucusuna dokunma. Ayri port + `FLOW_CONFIG`
  ortam degiskeniyle ayri ayar/klasor kullan.

# Agent Blueprint

Insan ve AI agent'in ayni semayi paylastigi yerel bir canvas. Sen semayi gorsel olarak cizersin,
agent ayni semayi `schema/*.flow` dosyasi uzerinden okur ve yazar. Dosya maksimum token tasarrufu icin
satir bazlidir; stil uygulamanin icinde sabittir, dosyada sadece degisen bilgi durur.

## Calistirma

```sh
npm install
npm run dev
```

`http://localhost:5173` adresini ac. Semalar varsayilan olarak `schema/` klasorunde durur; sol paneldeki
**Klasor sec** ile baska bir klasor (or. agent'in calistigi projede bir yer) secilebilir. Secim ve son klasorler
`flow.config.json` dosyasinda saklanir (git'e girmez).

- **Canli mod acik:** Canvas'taki her degisiklik dosyaya yazilir, dosya disaridan (agent) degisince canvas aninda guncellenir.
- **Canli mod kapali:** Elle kaydet (Ctrl+S). Dosya disaridan degisirse uyari cikar.
- Ctrl+Z / Ctrl+Y agent degisikliklerini de geri alir.
- Ctrl+C secimi `.flow` satirlari olarak panoya koyar (agent'a yapistirilabilir); agent'in verdigi `.flow`
  satirlari Ctrl+V ile canvas'a yapistirilabilir. Duz yazi yapistirilirsa yazi node'u olur.
- **Arac secili iken:** tikla = varsayilan boyutta birak; basili tutup surukle = o anda surukledigin boyutta ciz; Shift basiliyken sekil kendi oranini korur (Esc iptal).
- **Grupla** (Ctrl+G): secili nesneler birlikte secilir ve tasinir (dosyada `&a,b` satiri). Gruplar ic ice kurulabilir; Ctrl+Shift+G sadece en dis katmani dagitir (gruplanma sirasinin tersine, adim adim). Baglantilar degismez.
- **Section** (Ctrl+Alt+S olustur, Ctrl+Shift+S kaldir): secili nesnelerin etrafina gorunur bir bolum cizer (eski adi "grup nesnesi"; dosyada hala `group` sekli).
- **Tab**: nesneler arasinda gezer; hem nesne hem baglanti seciliyse sadece baglantilar -> sadece nesneler -> hepsi dongusu (arac cubugunun altinda tur yazar).
- **Disa aktar** (kirmizi dugme ya da Ctrl+Shift+E): PNG (1x-4x) ya da SVG. Secim varsa sadece secim, yoksa tum sema;
  dosya sema klasorune yazilir.

## .flow formati

```text
id[@grup] sekil[.bicim] renk x y w h metin
kaynak>hedef[/secenek] etiket
```

| Alan | Degerler |
| --- | --- |
| sekil | `rect round pill circle diamond db text group table` |
| bicim | istege bagli, sirasiz: yazi boyutu `s m l x`, hiza `< ^ >`, kenarlik `0-3`, `~` kesikli, font `M` Montserrat / `O` Orbitron / `W` Work Sans (varsayilan Google Sans yazilmaz), `=X` kenar rengi (palet kodu ya da `=#RRGGBB`; yoksa dolgudan turetilir) (ornek `rect.l3~M=k`) |
| renk | `k g r o y n t b v p w` (siyah, gri, kirmizi, turuncu, sari, yesil, turkuaz, mavi, mor, pembe, beyaz); BUYUK harf = acik ton; `-` = dolgu yok; `#RRGGBB` = ozel. `text` seklinde renk = yazi rengi |
| secenek | sirasiz: renk, `\|` koseli ya da `_` duz cizgi, `-` oksuz, `1-3` kalinlik, `~` kesikli, `:XY` cikis/giris kenari (`t r b l *`), `@dx,dy` bukum (iki ucun ortasindan kayma), `<X` baslangic ucu ve `>X` bitis ucu (`a` cizgi ok, `t` ucgen, `d` baklava, `c` daire, `n` yok; varsayilan baslangic yok, bitis cizgi ok), `^` baglanti tum nesnelerin ustunde cizilir (varsayilan: altinda) |
| metin | markdown: `**kalin**`, `~~cizili~~`, satir basinda `-` ve bosluk = liste; `\n` = yeni satir; tabloda hucreler `a\|b\nc\|d` |
| text w h | yazilmaz (`- -`); yazi kendi boyutunu alir |
| x y w h | `-` verilirse otomatik (yeni node mevcutlarin altina yerlesir) |
| `@grup` | node grubun icindedir, x y gruba gore. Gruplar ic ice olabilir. Uygulamada bir node, onu tamamen iceren en kucuk grubun uyesidir |

Ornek:

```text
g1 group w 864 -224 496 408 Shop List
n1 rect T -448 -176 176 176 normal kataloglar
s1@g1 pill r 48 48 400 48 shop #1
a1 rect v - - - - Agent ekledi
n1>s1/r| assign = yes
```

Kenar verilmeyen baglantilarda en yakin kenar otomatik secilir.

Agent icin rehber [FLOW_GUIDE.md](guide/FLOW_GUIDE.md) (Ingilizce, sadece agent okur): format ve kurallar (tum dosyayi yeniden yazma, id'leri degistirme,
konumu bilmiyorsan `-` yaz...). `guide/` klasorundeki dosyalar master'dir; uygulama secili sema klasorundeki kopyayi her zaman
master'in aynisi tutar (klasor secilince ve master degisince aninda). Yanina gorsel ornek de konur:
`FLOW_GUIDE.flow` (her secenegi kullanan sema), `FLOW_GUIDE.png` (uygulamadaki goruntusu) ve `FLOW_GUIDE.mjs` (dogrulayici: `node FLOW_GUIDE.mjs sema.flow`). Her `.flow`
dosyasinin ilk satiri ona isaret eder. Agent rehberi oturumda bir kez okur, dosyalarda tekrar eden aciklama olmaz.

## Agent'a tanitmak

Agent'in calistigi projenin talimat dosyasina (Claude: `CLAUDE.md`, Gemini: `GEMINI.md`, digerleri: `AGENTS.md` ya da kendi dosyasi) bir satir yeterli:

```text
Mimari semasi: <sema klasoru>/<ad>.flow (once ayni klasordeki FLOW_GUIDE.md'yi oku; duzenledikten sonra node FLOW_GUIDE.mjs <ad>.flow)
```

Agent baska bir projede calisiyorsa bu klasoru o projenin izinli dizinlerine ekle (`/add-dir`).

## Kod

| Dosya | Gorev |
| --- | --- |
| `src/flow/format.ts` | Format parse/serialize, palet, varsayilanlar |
| `src/flow/store.ts` | State, dosya islemleri, undo gecmisi, canli senkron |
| `vite-plugin-flow.ts` | `schema/` okuma/yazma API'si ve dosya izleme (SSE) |
| `src/components/` | Sekil node'u, otomatik kenarli edge, ozellik paneli, dosya paneli |

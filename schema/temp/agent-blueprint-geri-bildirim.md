# Agent Blueprint (.flow) icin geri bildirim

> Yazan: Claude (catApp projesinde .flow semalarini okuyup yazan agent), 2026-10-11. Okuyan: Agent Blueprint uygulamasini
> gelistiren agent. Kaynak deneyim: FLOW_GUIDE v13 ile 6 sema yazildi / okundu (en buyugu 51 dugum, 52 ok), iki baska
> modelin semasi incelendi. Bicim iyi calisiyor; asagidakiler agent tarafindaki hata ve token yukunu azaltir.

## Ne iyi calisti (koru)

- Tek satir = tek dugum / ok, duz metin: git'te satir satir fark, az token (51 dugumluk sema ~100 satir).
- Surumlu kilavuz (ilk satirda `vN`) ve "surum degismediyse tekrar okuma" kurali: gereksiz okuma yok.
- Kullanicinin `:XY` ve id'lerine dokunmama kurali: kullanici elle tasir, agent bozmaz.
- `.3` kalin cerceve gibi tek karakterlik vurgu: "degisen kutular" gibi anlam katmanlari ucuz.

## Agent'i en cok zorlayanlar (oncelik sirasiyla)

1. **Sonucu goremiyorum.** Koordinatlari ben hesapliyorum ama cizimi goremiyorum; okunaklilik, ok karmasasi ve tasan
   metin kullanici bakana kadar bilinmiyor. Oneri: komut satirindan PNG / SVG ciktisi (`flow render dosya.flow -o x.png`).
   Agent resmi okuyup kendi duzeltir.
2. **Dogrulama uygulamada, agent'ta yok.** Gecersiz satir uygulamada hata olarak cikiyor ve kullanicinin bir sonraki
   duzenlemesinde dusuyor; agent bunu kaydederken bilmiyor. Bu projede kendi denetleyicimi yazdim (`flow_check.py`, ayni
   klasorde: bicim, tekrar id, sekil / renk / fmt, Section sirasi ve tasmasi, ust uste binme, kopuk ok, grup kurallari).
   Oneri: uygulamanin kendi kuralini kullanan resmi bir CLI (`flow check`), makine okunur cikti (satir no + kod).
3. **Yerlesim yuku tamamen agent'ta.** Her kutu icin x y w h hesaplamak hem token hem hata kaynagi. `- - - -` var ama
   Section icinde ve sirali yerlesimde ne olacagi belli degil. Oneri: Section'a yerlesim kipi (ornek `group.row` /
   `group.col` + bosluk): cocuklar sirayla otomatik dizilir, agent yalniz sirayi yazar. Elle tasinan kutu sabitlenir.
4. **Metin sigiyor mu bilinmiyor.** Cok satirli metinde `h` tahmini; tasma gorunmeden kaliyor. Oneri: `h = -` iken
   genislige gore otomatik yukseklik ve dogrulayicida "metin tasiyor" uyarisi.
5. **Kullanicinin elle tasidigi kutuyu ayirt edemiyorum.** Dosyayi yeniden yazmamam gerektigini biliyorum ama hangi
   koordinatin kullanicinin oldugunu bilmiyorum. Oneri: uygulama, elle tasinan dugumu isaretlesin (ornek `fmt` icinde
   `!` = kilitli) ya da kaydederken yorum satiri biraksin.
6. **Tekrarlanan stil token yiyor.** Ayni renk / boyut / ok stili onlarca satirda tekrar ediyor. Oneri: dosya basinda
   stil tanimi (`@style data b|2`, `@size kutu 300 90`) ve satirda adla kullanim.
7. **Anlam katmani yok.** "Veri akisi" ile "panel bunu okur" oklarini renk / kesikli ile ayirdim; anlami yalniz baslik
   metninde yazdim. Oneri: ok ve kutu turu icin lejant tanimi (dosyada bir kez), uygulama otomatik lejant cizer.
8. **Sema koddan kopuyor.** "Mevcut durum" semalari zamanla eskiyor. Oneri: dosya basliginda standart meta
   (`#meta tarih=2026-10-11 durum=dogrulandi kaynak=apps/api/src/services/visibility.ts`) ve dugume dosya / satir baglantisi;
   uygulama tarihi eski olani soluk gosterebilir.

## Kucuk notlar

- Kilavuz uc dosya (md + flow + png); png her okumada pahali. Kisa bir "cheat sheet" (tek ekran) ilk okuma icin yeter.
- Uygulama kaydederken yorum satirlarini (`#`) ve satir sirasini koruyor mu, kilavuzda acikca yazsin; agent buna gore
  meta / not birakir.
- Ust duzeydeki bir kutu bir Section'in ustune kismen binerse (kullanici tasidiginda olabiliyor) uygulama hangi Section'a
  ait sayiyor? Dogrulayicida uyari olsun (bu projede `urun-gorunurlugu-mevcut-akis.flow` satir 21: `r4` boyle).

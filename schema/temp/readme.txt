Yazdigim not Agent Blueprint uygulamasini gelistiren agent icin.

Iki dosyayi sema klasorune koydum:

**1. [flow_check.py](docs/reference/notes/gemini/schema/flow_check.py)** kalici dogrulayici. Kullanim: `python flow_check.py *.flow`.
- **Neyi kontrol ediyor:** satir bicimi, tekrarlanan id, gecersiz sekil/renk/fmt, Section'in sirasi ve tasmasi, ust uste binme, kopuk ok ve grup kurallari.
- **Simdiki semalarda buldugu:** benim dort semam ve kilavuz temiz. Iki dosyada uyari var:
  - `urun-gorunurlugu-mevcut-akis.flow`: elle tasidigin `r4` kutusu Section disina cikmis ve Section'in kenarina biniyor.
  - `ccc.flow`: senin deneme dosyan, icinde 5 cakisma var.
- Ikisine de dokunmadim.

**2. [agent-blueprint-geri-bildirim.md](docs/reference/notes/gemini/schema/agent-blueprint-geri-bildirim.md)** uygulamanin agent'ina iletebilecegin not. Oncelik sirasiyla istekler:
1. **Cizimi gorme:** agent'in cizimi gorebilmesi icin komut satirindan PNG/SVG ciktisi.
2. **Resmi dogrulayici:** uygulamanin kendi kurallariyla calisan bir `flow check`.
3. **Otomatik yerlesim:** Section icinde satir/sutun duzeni; agent koordinat hesaplamak zorunda kalmasin.
4. **Metin sigdirma:** metne gore otomatik yukseklik ve tasma uyarisi.
5. **Elle tasinanlar:** kullanicinin elle tasidigi kutularin isaretlenmesi, agent bunlari ayirt edebilsin.
6. **Kisa stil tanimlari:** tekrar eden stil icin dosya basinda tanim (token tasarrufu).
7. **Lejant:** ok ve kutu turleri icin.
8. **Tarih ve kaynak:** sema koddan kopmasin diye tarih/kaynak bilgisi.

Ayrica hafizama "her semayi yazdiktan sonra bu dogrulayiciyi calistir" kuralini ekledim.
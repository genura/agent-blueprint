# PROMAN - Katalog Sistemi servis yoneticisi

Dev ortamindaki servisleri (API, Web, Mobil/Expo, ESync, WSA/Android) tek ekrandan baslatan, durduran ve izleyen
terminal arayuzu. Textual + psutil ile yazildi; sadece Windows. Tek dosya: `proman.py`.

Bu dosyanin ilk yarisi kullanim icindir. Ikinci yarisi (**Gelistirici ve agent rehberi**) PROMAN'a bir sey
ekleyecek, cikaracak ya da duzeltecek kisi / agent icindir: yapinin neden boyle oldugunu, hangi kurallarin
bozulmamasi gerektigini ve daha once yasanan hatalari anlatir. **Kodu degistirmeden once o bolumu oku.**

---

## Calistirma

- `proman.bat` (cift tik): Windows Terminal'de (155 x 42), yonetici olarak acar.
- Ya da: `python proman.py`

Eksik Python paketleri (`textual`, `psutil`, `pillow`, `qrcode`) ilk acilista `pip install` ile kurulur.

## Ekran

- **Project & Host (sol ust):** proje adi / surumu (kok `package.json`), git dali, host ve projenin sundugu /
  baglandigi tum adresler: LAN IP, API (`http://<ag adresi>:3003`), Web panel (`http://localhost:5003`; Vite sadece
  localhost'u dinler), Expo Go (`exp://<ag adresi>:8081`), Tablet API (`EXPO_PUBLIC_API_URL`), PostgreSQL
  (`host:port`), MSSQL ERP (`sunucu\instance,port`). Her satira tiklaninca deger panoya kopyalanir; aciklamasi
  uzerine gelince (tooltip) gorunur. Yeni bir servis / port eklenirse buraya da satir eklenir (`HostBox.compose` +
  `_collect_metrics` icindeki `addresses`).
- **System Utilization:** CPU (beyaz; %20 ve ustu mavi, %40 ve ustu kirmizi), RAM, surec sayisi. Altinda calisan is:
  adi, durumu (RUN / ABORTING / ABORTED / DONE / ERROR / IDLE), gecen sure ve cikti satir sayisi. Bostayken durum
  sari, is sirasinda kirmizi rozet.
- **Live Operation (iki ust kutunun altinda, tam genislik):** o anki adim / son cikti satiri. Bostayken sari
  "Sistem hazir.", is sirasinda kirmizi rozet.
- **Processlist (sol alt):** servis tablosu (port, PID, durum, CPU, RAM). Secim tum satirdir. API calisirken
  PostgreSQL kapaliysa `RUNNING (DB YOK)`. Node.js satiri: surum, acik `node.exe` sayisi ve toplam CPU / RAM.
- **Activity & Stream Log (sag):** canli log. Satira cift tiklaninca o satir secilir (tek secim) ve panoya kopyalanir;
  `Kopyala` butonu ya da `y` log'un tamamini kopyalar. Ayni log `proman.py`'nin yanindaki `log/` klasorunde
  (`proman/log/process_manager_YYYYMMDD.log`) dosyaya da yazilir; proje kokune log dosyasi dusmez.

## Tuslar

| Tus | Islem |
| :--- | :--- |
| `F9` / `?` | Komut menusu |
| `1` / `2` | Sistemi baslat (API + Web) / hepsini durdur |
| `3` `4` `5` | API / Web / Mobil ac-kapat |
| `6` | Tablet: API + hazirlik kontrolleri + WSA (Android) + uygulama |
| `7` | ESync: kapat, derle, baslat |
| `8` / `9` | DB migration / `npm install` |
| `0` | Android Release APK uret |
| `t` | Tabletin sunucu adresi: otomatik (bilgisayarin ag adresi; Mobil her baslatildiginda `.env` esitlenir) / elle |
| `e` | Expo QR kodu (Expo Go ile okutulur). Mobil `5` / menuden baslatilinca kendiliginden acilir |
| `x` | Calisan isi iptal et |
| `Esc` | Her basista tek adim: is varsa iptal; yoksa acik pencereyi (F9 menusu dahil) kapat; yoksa cikis sorusu |
| `F5` / `r` | Durumu yenile |
| `y` / `c` | Log'un tamamini kopyala / logu temizle |
| `o` | Log akis yonunu cevir (yeni ustte / yeni altta); secim kaydedilir |
| `q` | Cikis sorusu |

## F9 menusu

Alt gruplu: `Sistem ▸`, `Araclar ▸`, `Tablet (Android) ▸` (icinde `Mobil Derleme ▸`), `Token Kullanimi (Claude) ▸`,
`Kuyruk (N) ▸`, `Screenshot`, `Exit`.

- Ana menude aciklama satiri yoktur (sade kalsin diye); aciklamalar alt menulerde ve aramada gorunur.
- `Token Kullanimi (Claude)`: bu projenin Claude Code token dokumu, `Gunluk` / `Haftalik` / `Aylik` (Bolum 15.3).

- Grup secilince menu o grubun icerigiyle yeniden acilir; Esc ya da `Geri` bir ust seviyeye doner.
- F9 her zaman ana menuden acar.
- Yazinca hangi seviyede olunursa olsun tum komutlar yoluyla (`Tablet (Android) > Mobil Derleme > ...`) duz liste
  olarak gelir. Kutu silinince gruplu gorunum doner.
- Sadece rakam yazilirsa gorunen seviyedeki o numarali oge secilir.
- `Tablet (Android)`: `[1] Tablet + API + WSA Calistir` (tus `6`; API + WSA + uygulama), `[2] Expo GO Baslat`
  (yalniz tabletteki Expo Go'yu, aciksa kapatip, acar ve ana ekraninda birakir; API, WSA ve Metro'ya dokunmaz).
- `Exit` onay sormadan kapatir (`q` ve alttaki Quit butonu onay sorar).

API / Web ac-kapat, log kopyalama / temizleme ve iptal menude yok; yukaridaki tuslarla calisir.

## Davranis notlari

- Ayni anda tek is calisir; calisirken verilen yeni komutlar reddedilmez, **kuyruga** alinir ve sirayla calisir
  (Bolum 15.2). Iptal (`x` / `Esc`) sadece calisan isi durdurur; isin surec agacini oldurur.
- Servis baslatilirken o portu dinleyen surec once kapatilir (adi log'a yazilir).
- Servisler ayri konsol pencerelerinde calisir; PROMAN kapaninca acik kalirlar.
- Yeni acilan servis konsolu odagi alirsa tuslar o pencereye gider; PROMAN'a tiklayip basmak gerekir.
- Expo ayri konsolda calistigi icin QR'i PROMAN kendisi uretir: `exp://<ag adresi>:8081` (`qr_markup`, `QrModal`).
  Gelistirme derlemesinde (Expo Go degil) bu QR gecerli degildir.
- MSSQL icin sadece TCP portu yoklanir; baglanti / sorgu yapilmaz (ayrinti: rehberde "MSSQL hedefi").
- Android derlemesi: gerekirse `expo prebuild`, Gradle'in indirdigi Java 17 ve Windows yol siniri icin kisa ara
  klasor (`C:/cxx/catapp`) kullanilir.

---

# Gelistirici ve agent rehberi

Son guncelleme: 2026-10-06. Buradaki her madde ya koddan ya da basliksiz (headless) testten dogrulanmistir;
dogrulanmayanlar "Bilinen sinirlar" bolumunde ayrica isaretlidir.

## 1. Bozulmamasi gereken kurallar (ozet)

Asagidakilerin her biri gercek bir hatadan cikti. Gerekceleri ilgili bolumlerde.

1. **Motor isi sadece `_engine_task(ad, fn)` ile baslatilir.** `begin_task` tusa basildigi anda, UI thread'inde,
   eszamanli cagrilir. Eylem metotlarina `@work` konmaz. (Bolum 4)
2. **`is_task_running` bayragini sadece `begin_task` kaldirir, sadece `execute_task` indirir.** Iptal kodu bayraga
   dokunmaz. (Bolum 4, 5)
3. **Esc sirasi sabittir:** is varsa iptal > acik pencere varsa kapat > cikis sorusu. Esc baglamasi `priority=True`
   kalir; yeni pencere eklenirse `action_escape_key` icinde ele alinir. (Bolum 5)
4. **Motorda bloklayan bekleme `time.sleep` ile degil `self.cancel_event.wait(sure)` ile yapilir** ve donus degeri
   kontrol edilir. Uzun dongulerde `self.cancelled` bakilir. (Bolum 5)
5. **Disaridan gelen her metin (komut ciktisi, yol, hata mesaji, adres) log'a `escape()` ile yazilir; etiketler
   `tg('AD')` ile.** `textual.markup.escape` KULLANILMAZ. (Bolum 7)
6. **UI'ye thread'den dokunulmaz.** `log_message` ve `update_progress_ui` bunu kendisi halleder; baska her sey
   `call_from_thread` ile yapilir. (Bolum 3)
7. **`App` uzerinde `_task`, `_thread_id`, `screen`, `title`, `log` gibi Textual'in kullandigi adlarla metot / alan
   tanimlanmaz.** (Bolum 13, hata 4)
8. **Tek satirlik degisken metinler `text-wrap: nowrap` + `text-overflow: ellipsis` ile cizilir.** Yoksa sigmayan
   deger alt satira kayip gorunmez olur. (Bolum 9)
9. **ERP (MSSQL) icin sadece TCP yoklamasi yapilir.** Login, sorgu, surucu eklenmez. (Bolum 8; proje `CLAUDE.md`
   altin kurali)
10. **Uydurma gosterge eklenmez.** Yuzde, hiz, ETA gibi bilinmeyen bir sey gosterilmez; sadece olculen degerler.
    (Bolum 6)
11. Her degisiklikten sonra **Bolum 12'deki testler** calistirilir.

## 2. Kod haritasi

Tek dosya, yukaridan asagiya su sirayla:

| Bolum | Icerik |
| --- | --- |
| Bootstrap | `REQUIRED_PACKAGES`, `ensure_dependencies()` (import'lardan ONCE calisir) |
| Yardimcilar | `escape`, `plain_of`, `tg`, `copy_to_windows_clipboard`, `is_windows_admin`, `get_project_root`, port sabitleri |
| `Service` | Servis tanimi: `key, label, cwd, cmd, port, needs_db, startup_wait, process` |
| `ProcessEngine` | Motor: is sarmalayicisi, iptal, port / surec, MSSQL, servisler, tablet / Android, derleme, `_stream` |
| Bilesenler | `LogLineItem`, `StatBox`, `CopyLine`, `SysBox`, `HostBox`, `CustomUrlModal`, `PickModal`, `ExitConfirmModal` |
| F9 menusu | `PROMAN_MENU` (agac), `PromanCommandProvider`, `PromanPalette` |
| `PromanApp` | CSS, `BINDINGS`, yerlesim (`compose`), log / durum cizimi, yenileme, eylemler (`action_*`) |

Kok dizin `get_project_root()` ile bulunur: `proman.py`'nin klasorunde ya da bir ustunde `apps/` veya
`package.json` aranir. `proman/` alt klasorunde durdugu icin kok bir ust klasordur.

## 3. Mimari: motor / arayuz ayrimi ve thread modeli

`ProcessEngine` Textual'i bilmez. Arayuzle uc geri cagri uzerinden konusur:

| Geri cagri | Imza | Arayuzdeki karsiligi |
| --- | --- | --- |
| `log_cb` | `(markup: str)` | `PromanApp.log_message` |
| `prog_cb` | `(state, percent, detail, info="")` | `PromanApp.update_progress_ui` |
| `pick_cb` | `(title, [(key, label)]) -> key \| None` | `PromanApp.pick_from_thread` (bloklar) |

Thread'ler:

- **UI thread:** Textual'in olay dongusu. Tus, tiklama, menu secimi, `begin_task`.
- **Is thread'i:** `_execute_engine_task` (`@work(thread=True)`); motorun asil isi burada kosar. Ayni anda tek tane.
- **Yenileme thread'i:** `refresh_all_metrics` 2.5 sn'de bir; `_refreshing` bayragi ust uste binmeyi onler.
- **Okuyucu thread:** `_stream` icinde, alt surecin ciktisini kuyruga atar (Bolum 6).
- **Iptal thread'i:** `_abort_worker`; `taskkill` birkac saniye surebildigi icin UI'de calismaz.

`log_message` ve `update_progress_ui`, `_on_ui_thread()` ile bulundugu thread'e bakar: UI'deyse dogrudan cizer,
degilse `call_from_thread` kullanir. Bu yuzden motor ikisini de her yerden cagirabilir. Baska bir UI islemi
(pencere acma, widget guncelleme) is thread'inden yapilacaksa `self.call_from_thread(...)` sarttir.

`prog_cb`'deki `percent` artik kullanilmiyor (ilerleme cubugu kaldirildi); imza motor cagrilari bozulmasin diye duruyor.

## 4. Isin (task) yasam dongusu

```text
tus / menu  ->  action_xxx()                      UI thread
                  _engine_task(ad, fn)
                    engine.begin_task(ad)         UI thread, ESZAMANLI: kilit alinir, bayrak kalkar, "CALISIYOR"
                    _execute_engine_task(fn)      is thread'i baslar
                      engine.execute_task(fn)     fn() kosar; finally: surec temizligi, bayrak iner, kilit birakilir
                      refresh_all_metrics()
```

- `begin_task` `False` donerse (baska is calisiyor) "MESGUL" log'u yazilir ve hicbir sey baslamaz.
- `begin_task` `True` donduyse `execute_task` MUTLAKA cagrilmalidir; kilidi o birakir. Araya hata verebilecek kod
  konmaz.
- **Neden eszamanli:** onceden bayrak is thread'i basladiktan sonra kalkiyordu. Aradaki boslukta basilan Esc isi
  gormuyor, iptal yerine cikis penceresini aciyordu. Simdi tusa basildigi dongude bayrak kalkmis olur.
- **Sonucun ekranda kalmasi:** `_stream` biterken ya da is iptal / hata ile bitince `_hold_result = True` olur;
  `execute_task` bayragi indirip kilidi biraktiktan SONRA 1.5 sn bekler, hala is yoksa `IDLE` yazar. Bekleme
  kilit disinda oldugu icin bu sirada yeni is baslayabilir; `if not self.is_task_running` kontrolu yeni isin
  ekranini ezmemek icindir.
- Durum metinleri: `CALISIYOR: <ad>`, `IPTAL EDILIYOR`, `IPTAL EDILDI`, `TAMAMLANDI`, `HATA`, `IDLE`. Arayuz rengi
  bu kelimelere bakarak secer (`_render_op`); yeni durum eklenirse orasi da guncellenir.
- Cok adimli islerde ara baslik icin `self._step("...")` kullanilir (`start_system`, `start_tablet_all`).

## 5. Iptal mekanizmasi ve Esc sirasi

**Iptal nasil calisir:**

1. `x`, Abort butonu ya da Esc -> `action_abort_task` -> `_abort_worker` (thread) -> `engine.abort_active_task()`.
2. `abort_active_task`: `cancel_event` kurulur, durum `IPTAL EDILIYOR` olur, `active_subprocess` varsa `_kill_tree`
   ile oldurulur. Bayraga dokunmaz. Tekrar cagrilmasi zararsizdir (ikinci cagri log yazmaz).
3. Is thread'i iptali kendi gorur: `_stream` dongusu en gec 0.2 sn'de, `cancel_event.wait(...)` beklemeleri hemen.
4. `execute_task`'in `finally` blogu kalan sureci bir kez daha oldurur, `IPTAL EDILDI` yazar, bayragi indirir.

`_kill_tree`: once `taskkill /F /T /PID`, surec hala yasiyorsa psutil ile cocuklari ve kendisini tek tek oldurur.

**Motor kodu yazarken:**

- Bekleme: `if self.cancel_event.wait(3): return` (asla `time.sleep(3)` degil; 1 sn'lik kisa bekleme kabul edilebilir).
- Adimlar arasinda: `if self.cancelled: return`.
- Alt surec `_stream` ile calistirilir; `active_subprocess`'i o yonetir. Elle `Popen` + `communicate` yapilirsa iptal
  o sureci goremez.
- Kullanicidan secim: `self.pick(...)`. Iptal edilirse `None` doner; `None`'i "vazgecildi" say.

**Esc sirasi (`action_escape_key`), her basista tek adim:**

1. `engine.is_task_running` ise -> iptal. F9 menusu ya da baska pencere acik olsa bile; pencere yerinde kalir.
2. Degilse ustteki ekran bir pencereyse -> kapanir: F9 menusu (alt menudeyse bir ust seviyeye doner),
   `ExitConfirmModal`, `CustomUrlModal`, diger `ModalScreen`'ler.
3. Degilse -> cikis sorusu.

Esc baglamasi `Binding("escape", "escape_key", priority=True)` oldugu icin odak nerede olursa olsun (arama kutusu,
tablo, pencere) once `PromanApp`'e gelir. Pencerelerin kendi `escape` baglamalari bu yuzden calismaz; kapanma
mantigi tek yerde, `action_escape_key` icindedir. **Yeni bir pencere tipi eklenirse ve `dismiss(None)` ona uygun
degilse buraya bir dal eklenir.**

Is iptal olurken (bayrak inene kadar, ~0.1-0.4 sn) basilan ikinci Esc yine 1. adima duser ve bir sey acmaz. Bu
istenen davranistir.

## 6. Komut akisi: `_stream`

`_stream(cmd, cwd, tag, count_word="") -> bool`: komutu calistirir, ciktiyi satir satir log'a akitir, basariliysa
`True` doner.

- Cikti **ayri bir okuyucu thread'de** okunup kuyruga atilir; ana dongu kuyrugu 0.2 sn zaman asimiyla dinler.
  Sebep: `for line in process.stdout` bloklar. Komut hic cikti vermezse ya da surec bitse bile boruyu bir torun
  surec (gradle daemon gibi) acik tutarsa dongu sonsuza kadar bekler; iptal de goremez.
- Surec bittiyse ama boru kapanmadiysa 1 sn daha kalan cikti beklenir, sonra birakilir.
- `stdin=subprocess.DEVNULL`: komut girdi beklerse takilmasin.
- Durum guncellemesi 0.2 sn'de bir yapilir (her satirda degil); gradle / cargo binlerce satir basar.
- Gosterilen sayilar gercektir: gecen sure, cikti satir sayisi, `count_word` verildiyse o kelimeyi iceren satir sayisi
  (cargo icin `Compiling`).
- **Yuzde yok, bilerek.** Ilk surumde hiz (`MB/s`), boyut ve ETA satir uzunlugundan uyduruluyordu. Cargo da ciktisi
  boruya gidince `(n/m)` sayacini yazmaz; yuzde hesaplamanin dogru bir yolu yok.
- `finally` icinde `return` YAZMA. Ilk surumde `finally: ... return False` basarili sonucu eziyordu: ESync derlenip
  hic baslamiyor, APK uretilip "hazir" denmiyordu.

## 7. Log ve markup kurallari

Log satirlari Textual markup'i ile cizilir. Kritik nokta: **Textual, koseli parantez icindeki her seyi stil etiketi
sayar ve tanimadigini sessizce siler.** `[API]`, `[NPM]`, `[INFO]`, `[ERROR]` ekranda kaybolur; kapanmayan / yanlis
kapanan bir etiket (`[/bar]`) ise `MarkupError` firlatir.

- `tg('API')` -> `\[API]`: log etiketleri hep bununla yazilir.
- `escape(metin)`: metindeki HER `[` karakterini kacirir. Dosyanin kendi fonksiyonudur.
  `textual.markup.escape` kullanilmaz: o sadece kucuk harfle baslayanlari kacirir, `[INFO]` yine silinir.
- Kacirilmasi gerekenler: komut ciktisi, dosya yollari, hata mesajlari (`str(e)`), adresler, surec adlari, cihaz
  adlari, proje adi. Kisacasi senin yazmadigin her metin.
- `log_message` gelen markup'i once `Content.from_markup` ile dener; gecersizse satiri kaybetmek yerine tamamini
  kacirip yazar.
- `plain_of(markup)` ekranda gorunen duz metni verir. Disk logu ve kopyalama bunu kullanir; regex ile etiket
  silinmez (eski `TAG_RE` `[NPM]` gibi gercek metni de siliyordu).
- Buton etiketlerinde de ayni kural gecerli: `"Kaydet [Enter]"` yazilirsa `[Enter]` silinir; `(Enter)` kullan.
- Log listesi en fazla 600 satir tutar; fazlasi bastan silinir.
- Emoji seciminde VS16 (U+FE0F) gerektirmeyenler tercih edilir; digerleri terminalde hizayi bozar.

Ornek:

```python
self.log(f"[red]❌ {tg(tag)} Dizin bulunamadi: {escape(svc.cwd)}[/red]")
self.log(f"[dim]  {tg(tag)} {escape(clean)}[/dim]")
```

## 8. Durum yenileme ve olcumler

`refresh_all_metrics` (2.5 sn) -> `_collect_metrics` thread'de veri toplar, sonunda tek `_update()` ile cizer.

- **Portlar:** `listening_pids([...])` tek `psutil.net_connections("tcp")` cagrisiyla tum portlari okur (IPv4 + IPv6).
  Eski `netstat -p tcp | findstr` her port icin ayri kabuk aciyordu ve sadece IPv4'e bakiyordu. psutil hata verirse
  `_netstat_pids` yedegine duser.
- **CPU:** `psutil.Process` nesneleri `engine._procs` icinde PID'e gore saklanir. `cpu_percent(interval=None)` ayni
  nesnede ikinci cagridan itibaren anlamli deger verir; her seferinde yeni nesne olusturulursa hep `0.0` doner (ilk
  surumdeki hata). Ilk olcumde `...` gosterilir. Deger cekirdek sayisina bolunur (Gorev Yoneticisi gibi).
  `forget_pids(live)` olu PID'leri temizler.
- **"Calisiyor" tanimi:** port dinleniyor. PostgreSQL kontrolu sadece baslatma oncesinde yapilir
  (`Service.needs_db`). Eskiden DB dusunce API "kapali" sayiliyor, toggle calisan API'yi oldurup baslatmayi
  reddediyordu. Simdi tablo `RUNNING (DB YOK)` gosterir.
- **Tablo:** satirlar `on_mount`'ta bir kez eklenir (`TABLE_ROWS` anahtarlari), sonra `update_cell` ile yerinde
  guncellenir. `clear()` + `add_row` kullanilmaz: titretir ve imleci sifirlar. `cursor_type = "row"`.
- **Node.js satiri:** surum acilista bir kez okunur (`detect_node`); surec sayisi ve toplamlar `scan_processes`'ten.
  ESync PID'i de ayni tek gecisten gelir.
- **Proje bilgisi:** ad / surum `_read_project_info` (kok `package.json`, yoksa klasor adi), dal `git_branch`
  (`.git/HEAD`). Ad, konsol pencere basliginda kullanildigi icin harf / rakam / `-_.` disindakiler temizlenir.

### MSSQL hedefi

`mssql_status() -> (durum, port_metni, aciklama)`; `durum` `True` / `False` / `None` (hedef tanimli degil).

- Hedef sirayla aranir (`_mssql_candidates`): kokteki `proman.json` -> ESync ayari
  (`%APPDATA%\ESync\config.json` ya da `ESYNC_HOME`, `erp` alani) -> eski `agent/.env`.
- `proman.json` bicimi: `{"mssql": {"server": "...", "instance": "", "port": 1433, "database": "..."}}`.
- Dosyalarin degisme zamani imza olarak tutulur; degismediyse yeniden okunmaz, degisince kendiliginden okunur.
- **Hedef bulunamazsa yoklama yapilmaz, satir `N/A` gosterir.** Eski kod `agent/.env` yokken `127.0.0.1:1433`'e
  bakip "ONLINE" diyordu; gercek ayar `localhost\SQLEXPRESS` idi.
- Adlandirilmis instance varsa port SQL Browser'a (UDP 1434, `0x04` + instance adi) sorulur, 30 sn saklanir. Yanit
  gelmezse ayardaki port denenir ve aciklamaya not dusulur.
- Yapilan tek sey TCP `connect`. Parola alani okunmaz (DPAPI ile sifreli, zaten gerekmiyor).

## 9. Arayuz yerlesimi

- Sol kolon %48: ustte `HostBox` (`#box-status`, `3fr`) ve `SysBox` (`#box-sys`, `2fr`), altta servis tablosu.
  Sag kolon: log. Altta komut cubugu.
- **Genislik butcesi:** `proman.bat` 155 x 42 acar. Bu boyutta `HostBox` ic genisligi 38, `SysBox` 24 karakterdir;
  140 sutunda 33 / 22, 120 sutunda 27 / 18. `HostBox` satirlari `Etiket: ` (8) + deger olarak cizilir; en uzun deger
  `http://192.168.1.192:3003` (25) 140 sutunda tam sigar (33), 120'de sonu kisalir. Etiket genisligi 6 bu yuzden
  secildi; uzatilirsa dar pencerede adresler kesilir.
- `CopyLine` ve `.op-line` tek satirdir: `height: 1; text-wrap: nowrap; text-overflow: ellipsis` (`.op-line` icin
  ayrica `width: 100%`, yoksa kisaltma calismaz). Bu ayarlar olmadan sigmayan deger alt satira kayar ve satir
  yuksekligi 1 oldugu icin tamamen kaybolur ("adres bazen yaziyor bazen yazmiyor" hatasi).
- `CopyLine.set_value` deger degismediyse yeniden cizmez. `(` ile baslayan degerler (`(yok)`) kopyalanmaz.
- Is durumu `SysBox` icindeki dort etikettir: `#op-task`, `#op-state`, `#op-info`, `#op-detail`. `_render_op`
  hem her `prog_cb` bildiriminde hem saniyede bir (gecen sure icin) cizer. Ayri bir "Active Task" kutusu ve ilerleme
  cubugu yoktur; kaldirildi.
- CPU rengi esikleri `_collect_metrics` icinde: `< 20` beyaz, `>= 20` mavi, `>= 40` kirmizi.
- Log satiri secimi: cift tiklama (`event.chain >= 2`) -> `select_log_line`: `.-selected-line` sinifi tek satirda
  kalir, satir kopyalanir, bildirim (`notify`) cikar. Tek tik sadece ListView imlecini oynatir.
- Kopyalama `copy_to_windows_clipboard` (`clip`, UTF-16LE) ile yapilir; her kopyalamada `notify` ile bildirim verilir.
- `PromanPalette._fit_to_log_box` menuyu sag paneldeki log kutusunun tam ustune oturtur (`#log-box` bolgesinden
  olcer). `#log-box` kimligi degisirse menu yerini bulamaz.

## 10. F9 menusu (ayrintili)

Bu bolum en cok degisecek ve en kolay bozulacak yerdir. Menu Textual'in hazir komut paletinin (`CommandPalette`)
ustune kuruludur; palet alt menu, gruplama ya da "seviye" kavramini bilmez. Hepsi bizim tarafimizda, dort parcayla
yapilir. Bir seyi degistirmeden once hangi parcaya ait oldugunu bul.

### 10.1 Parcalar

| Parca | Yer | Gorevi |
| --- | --- | --- |
| `PROMAN_MENU` | modul seviyesi liste | Menunun TEK veri kaynagi (agac). Sira, gruplar, metinler burada. |
| `PromanCommandProvider` | `Provider` alt sinifi | Agaci palete "sonuc" olarak verir: `_entries`, `discover`, `_all_commands`, `search`. |
| `PromanPalette` | `CommandPalette` alt sinifi | Gorunum: baslik, renkler, log kutusunun ustune oturma. Mantik icermez. |
| Menu durumu | `PromanApp` | `menu_path`, `menu_level()`, `menu_title()`, `_open_palette()`, `_reopen_palette()`, `action_command_palette()`, `open_submenu()`, `action_menu_back()`. |
| Esc | `PromanApp.action_escape_key` | Alt menuden ust seviyeye donus ve kapanma (Bolum 5). |

`PromanApp.COMMANDS = {PromanCommandProvider}`: palet sadece bizim saglayiciyi kullanir. Textual'in sistem komutlari
(tema, tuslar, cikis ...) bilerek eklenmemistir; eklenirse menuye yabanci satirlar girer.

### 10.2 Veri modeli: `PROMAN_MENU`

```python
PROMAN_MENU = [
    ("🚀", "Sistem", "Baslat / durdur ...", [            # hedef LISTE ise: grup (alt menu)
        ("🚀", "System Baslat (API + Web)", "API ve Web servislerini baslatir", "action_quick_start"),
        ...
    ]),
    ("📸", "Screenshot", "...", "action_take_screenshot"),  # hedef METIN ise: PromanApp'teki eylem metodunun adi
    ("🚪", "Exit", "PROMAN kapatilir", "action_quit"),
]
```

Dugum her zaman 4'ludur: `(emoji, metin, yardim, hedef)`.

- **Siralama = listedeki sira.** Bir ogeyi tasimak icin satirini tasimak yeterlidir.
- **Numaralar otomatiktir** (`[1]`, `[2]` ...): her seviyede `enumerate` ile verilir, veriye yazilmaz.
- **Gruplar ic ice olabilir**, derinlik siniri yoktur (`Tablet (Android) > Mobil Derleme` iki seviyedir).
- **Ayni eylem birden fazla dugumde olabilir** (`action_ios_info` iki kez kullaniliyor).
- **Hedef metodu yoksa dugum sessizce atlanir** (`getattr(app, hedef, None)`); hata vermez ama numara sirasinda
  bosluk olusur (indeks sayilmaya devam eder). Yeni dugum gorunmuyorsa once metot adini kontrol et.
- Metinde markup kullanilmaz; etiketler duz metin olarak cizilir (10.6).
- Emoji secimi: VS16 (U+FE0F) gerektirmeyen, terminalde 2 hucre kaplayanlar. Digerleri hizayi bozar.

### 10.3 Textual paletinin bilinmesi gereken davranisi

Textual 8.2.8 ile yazildi ve denendi. Palet soyle calisir:

1. Arama kutusu **bosken** saglayicinin `discover()` metodu cagrilir; verdigi `DiscoveryHit`'ler oldugu sirayla
   listelenir.
2. Kutuya **bir sey yazilinca** `search(query)` cagrilir; verdigi `Hit`'ler `score`'a gore siralanir (yuksek ustte).
3. Bir sonuc secilince (Enter ya da tik) palet **once kendini kapatir**, sonra sonucun `command` geri cagrisini
   `app.call_later(...)` ile calistirir. Yani geri cagri calisirken palet kapanmakta / kapanmistir.
4. Kutuda yazi varken liste yeniden hesaplanir; yazi silinince tekrar `discover()` gelir.

Sonuc nesnelerinin alanlari:

| Alan | `DiscoveryHit` | `Hit` | Anlami |
| --- | --- | --- | --- |
| gorunen metin | `display` | `match_display` | Listede cizilen sey (`Content`) |
| siralama | yok (verilis sirasi) | `score` | 0'dan buyuk; yuksek olan ustte |
| `command` | var | var | Secilince calisacak, arguman almayan fonksiyon |
| `text` | var | var | Secilince arama kutusuna yazilan duz metin |
| `help` | var | var | Ikinci satirdaki aciklama |

Bu davranistan cikan sonuclar:

- **Paletin "alt menusu" yoktur ve acik kalmasi saglanamaz.** Alt menu = palet kapanir, biz yenisini acariz.
- Geri cagri arguman almaz; hangi grubun secildigini `functools.partial(app.open_submenu, index)` ile bagliyoruz.
- `CommandPalette.is_open(app)` ustteki ekranin palet olup olmadigini soyler; kapanma bir cizim dongusu surer.
- Kullandigimiz ozel (belgelenmemis) parcalar: `_action_escape()`, kimlikler `#--container`, `#--input`,
  `#--results`, `CommandList` sinifi ve palet ekraninin `--command-palette` kimligi. **Textual yukseltilirse menu
  ilk kontrol edilecek yerdir.**

### 10.4 Durum makinesi

Tek durum degiskeni vardir: `app.menu_path`, kokten itibaren secilen grup indekslerinin listesi (`[]` = ana menu,
`[2]` = ucuncu grup, `[2, 4]` = onun besinci ogesi olan alt grup). Baska yerde menu durumu tutulmaz.

| Olay | Kosul | Yapilan | Sonraki durum |
| --- | --- | --- | --- |
| `F9` / `?` / Menu butonu | palet kapali | `menu_path = []`, `_open_palette()` | ana menu acik |
| `F9` | palet acik | hicbir sey (yok sayilir) | ayni |
| Grup secildi | - | palet kapanir -> `open_submenu(i)`: yol uzar, `_reopen_palette()` | alt menu acik |
| `↩ Geri` secildi | alt menude | palet kapanir -> `action_menu_back()`: yol kisalir, `_reopen_palette()` | ust seviye acik |
| `Esc` | is calisiyor | sadece iptal (Bolum 5) | menu ayni yerde |
| `Esc` | alt menude, is yok | `_action_escape()` + `action_menu_back()` | ust seviye acik |
| `Esc` | ana menude, is yok | `_action_escape()` | kapali |
| Komut (yaprak) secildi | - | palet kapanir -> eylem calisir | kapali (`menu_path` eski degerinde kalir) |
| Yazi yazildi / silindi | - | `search()` / `discover()` | ayni seviye |

Dikkat edilecekler:

- **Yaprak secildikten sonra `menu_path` sifirlanmaz**; sonraki `F9` sifirlar. `menu_path`'e "menu acik mi" diye
  bakma; onun icin `CommandPalette.is_open(self)` var.
- **`_open_palette()` yolu degistirmez**, sadece o anki `menu_path` ile palet acar. Kokten acmak
  `action_command_palette`'in isidir. Ikisini karistirma: alt menuyu `action_command_palette` ile acarsan yol
  sifirlanir.
- **`_reopen_palette()` gecikmelidir ve tekrar dener.** Eski palet kapanmasini bitirmeden yenisi itilirse ya ust uste
  biner ya da `_open_palette`'teki `is_open` kontrolu yuzunden hic acilmaz (menu "kayboldu" gorunur). Bu yuzden 0.05 sn
  arayla, palet kapanana kadar (en fazla ~1 sn) denenir. Bu mekanizmayi `push_screen`'i dogrudan cagirarak atlama.
- `menu_path` her degisiklikte **yeni liste** olarak atanir (`self.menu_path + [i]`, `self.menu_path[:-1]`); yerinde
  degistirilmez. Boylece `partial` ile baglanmis eski bir geri cagri yolu bozamaz.
- `open_submenu(i)` indeksi **o anki seviyeye gore** alir. Bu yuzden sadece `_entries()` (o anki seviye) icinden
  baglanir. Agacin baska bir yerindeki gruba dogrudan atlamak icin yeni bir metot gerekir (10.8, "aramada gruplar").

### 10.5 Iki gorunum: gruplu ve duz

Menude iki ayri liste uretici vardir; hangi gorunumun nerede cikacagi sadece bu ikisinin nerede cagrildigina baglidir.

| Uretici | Verdigi | Etiket bicimi | Su an nerede kullaniliyor |
| --- | --- | --- | --- |
| `_entries()` | O anki seviyenin ogeleri: gruplar (`▸`) + komutlar + alt menudeyse sonda `↩ Geri` | `🚀 [1]  Metin` | `discover()` (kutu bos) ve rakam aramasi |
| `_all_commands(level=None, path="")` | Verilen seviyenin altindaki TUM yaprak komutlar, ozyinelemeli; gruplar yok | `🚀  Grup > Alt grup > Metin` | `search()` (yazi yazilinca) |

**Bugunku davranis (koddaki hali):**

- Kutu bos: **gruplu** gorunum, bulunulan seviye.
- Yazi yazilinca: **duz** liste, **tum agac** taranir (hangi seviyede olunursa olsun); yol kokten yazilir.
- Sadece rakam yazilinca (`query.isdigit()`): bulunulan seviyede `[n]` numarali oge (grup da olabilir).
- Kutu silinince ya da `F9` yeniden acilinca gruplu gorunum doner.

`_all_commands` parametreleri iki ayari belirler:

- `level`: nereden baslayacagi. `None` = `PROMAN_MENU` (tum agac). `self.app.menu_level()` verilirse arama bulunulan
  grupla sinirlanir.
- `path`: etiketin basina eklenen yol. Ozyinelemede `f"{path}{text} > "` ile buyur. Baslangicta bos oldugu icin yol,
  verilen seviyeden itibaren yazilir (grup icinden aranirsa `Mobil Derleme > ...`).

### 10.6 Etiket bicimi ve hizalama

Yardim satiri etiketin metniyle ayni sutundan baslasin diye girinti elle hesaplanir. Emoji 2 hucredir.

| Gorunum | Etiket | Metnin basladigi hucre | Yardim girintisi |
| --- | --- | --- | --- |
| Gruplu | `🚀 [1]  Metin` = emoji(2) + bosluk(1) + `[1]`(3) + bosluk(2) | 8 | `HELP_INDENT` = 8 bosluk |
| Gruplu, grup | ayni + sonda `  ▸` | 8 | 8 |
| Geri | `↩` (1 hucre) + 7 bosluk + `Geri` | 8 | 8 |
| Duz (arama) | `🚀  Yol > Metin` = emoji(2) + bosluk(2) | 4 | 4 bosluk (`search` icinde sabit) |

- Etiket bicimini degistirirsen girintiyi de degistir; ikisi ayri yerlerde yazili.
- Bir seviyede 9'dan fazla oge olursa `[10]` dort hucre kaplar ve o satirlarin hizasi bir kayar. Bugun en kalabalik
  seviye 7 oge.
- Etiketler palete `Content(label)` ile **duz metin** olarak verilir. Bu yuzden `[1]` burada guvenlidir (log'daki gibi
  kacirmak gerekmez) ama renk / kalin gibi markup da calismaz. `matcher.highlight(label)` eslesen harfleri kendisi
  vurgular.
- `text=label`: secilince arama kutusuna yazilan metindir. Ayni seviyede iki ogenin etiketi ayni olmamali.
- Baslik `PromanPalette.on_mount`'ta `menu_title()` ile yazilir: `*Komut Menusu > Grup > Alt grup [ F9 / Esc ]`.

### 10.7 Arama ayrintilari

- Eslestirme Textual'in **bulanik** aramasidir (`self.matcher(query)`): harfler sirayla geciyorsa eslesir. `apk`
  yazinca `Bagimliliklari (NPM) Kur / Guncelle` de (a-p-k sirayla gectigi icin) dusuk puanla listenin altinda cikar.
  En iyi eslesme hep ustte gelir.
- Arama **etiketin tamaminda** yapilir; duz gorunumde yol da etikete dahil oldugu icin grup adi yazilarak da
  bulunur (`tablet` yazinca Tablet grubunun tum komutlari).
- Yardim metninde arama yapilmaz.
- **Rakam kisayolu** `f"[{query}]" in label` ile calisir, sadece `_entries()` uzerinde (bulunulan seviye, gruplu
  etiketler). Yan etkisi: sadece rakamdan olusan bir sorguyla metin aranamaz. Coklu rakam (`12`) ancak o numarada oge
  varsa sonuc verir.
- Enter, vurgulanan ilk sonucu hemen calistirir. Bu yuzden `Geri` listenin SONUNDADIR: alt menu acilinca ilk komut
  secili gelir, refleksle basilan Enter geri dondurmez.
- Arama sonuclarinda **gruplar listelenmez**, sadece calistirilabilir komutlar.

### 10.8 Sik istenebilecek degisiklikler

Her biri icin dokunulacak TEK yer yazilidir. Baska yere dokunma ihtiyaci dogarsa once 10.4'u tekrar oku.

| Istek | Dokunulacak yer | Nasil |
| --- | --- | --- |
| Oge ekle / cikar / sirasini degistir | `PROMAN_MENU` | Satiri ekle, sil ya da tasi. Numaralar kendiliginden duzelir. |
| Yeni grup / alt grup | `PROMAN_MENU` | Hedef olarak liste ver. Baska kod gerekmez. |
| Grubu dagit (ogeleri ana menuye al) | `PROMAN_MENU` | Alt listeyi ust listeye ac. |
| Arama sadece bulunulan grupta olsun | `search()` | `self._all_commands()` -> `self._all_commands(self.app.menu_level())`. Ana menude yine tum agac taranir. |
| Arama her zaman tum agacta olsun | `search()` | `self._all_commands()` (bugunku hali). |
| Ana menu de duz liste olsun (grupsuz) | `discover()` | `self._entries()` yerine `self._all_commands()` uzerinden `DiscoveryHit` uret; yardim girintisi 4 olur. Alt menu, `Geri` ve rakam kisayolu anlamsizlasir (asagidaki nota bak). |
| Gruplu / duz arasinda gecis tusu | `PromanApp` + `discover()` | App'e `menu_flat: bool` alani ekle, `discover()` buna gore `_entries()` ya da `_all_commands()` kullansin; gecisten sonra `_reopen_palette()` ile yeniden ciz. |
| Arama birebir olsun (bulanik degil) | `search()` | `matcher` yerine `query.lower() in label.lower()`; `Hit(1.0, Content(label), ...)`. Vurgulama kaybolur. |
| Aramada gruplar da ciksin | `_all_commands()` + `PromanApp` | Grup icin de satir uret; hedefi `open_submenu(i)` OLAMAZ (indeks o anki seviyeye goredir). App'e `open_menu_path(path: list[int])` gibi yolu dogrudan atayip `_reopen_palette()` cagiran bir metot ekle ve `partial` ile tam yolu bagla. |
| Arama sonucunda yol gorunmesin | `_all_commands()` | Etiketten `{path}`'i cikar. Ayni adli komutlar (iki `iOS`) ayirt edilemez olur. |
| `Exit` onay sorsun | `PROMAN_MENU` | Hedefi `"action_quit"` yerine `"action_confirm_quit"` yap. |
| Etikette kisayol tusu gorunsun | `PROMAN_MENU` metni | Metne `(1)` gibi yaz. Tuslar `BINDINGS`'ten otomatik gelmez; elle esitlenir. |
| Menu baska yerde / boyutta acilsin | `PromanPalette._fit_to_log_box` | Bugun `#log-box` bolgesini olcup ustune oturur. |
| Menu renkleri / kenarligi | `PromanPalette.DEFAULT_CSS` | Sadece stil; mantiga dokunma. |

Not (tam duz menu): `_entries()`'i devreden cikarirsan rakam kisayolunu da (`query.isdigit()` dali) kaldir ya da
duz listeye gore yeniden yaz; yoksa var olmayan numaralari arar. `menu_path` hep `[]` kalir, Esc dogrudan kapatir;
ek degisiklik gerekmez.

### 10.9 Esc ile iliski

Esc mantigi menude degil, `PromanApp.action_escape_key` icindedir (Bolum 5). Menuyle ilgili kismi:

```python
if isinstance(screen, CommandPalette):
    screen._action_escape()        # paleti duzgun kapatir (Closed mesaji + dismiss)
    if self.menu_path:
        self.action_menu_back()    # alt menudeysek bir ust seviyeyi yeniden ac
```

- Is calisiyorsa bu dala hic gelinmez; Esc isi iptal eder, menu acik ve ayni seviyede kalir.
- Paletin kendi Esc baglamasi calismaz (App'teki baglama `priority=True`). Paleti kapatmanin tek yolu burasidir.
- Arama kutusunda yazi varken Esc yaziyi silmez; dogrudan bir ust seviyeye doner / kapatir.

### 10.10 Konum ve stil

- `PromanPalette._fit_to_log_box`: alttaki ekrandan (`app.screen_stack[-2]`) `#log-box` bolgesini okur ve paletin
  kabini (`#--container`) ayni konum ve boyuta getirir. `on_mount` ve `on_resize`'da cagrilir.
- Varsayim: palet ana ekranin ustunde acilir. Baska bir pencerenin ustunde acilirsa `#log-box` bulunamaz, `except`
  sessizce gecer ve palet Textual'in varsayilan yerinde (ustte ortada) gorunur.
- `#log-box` kimligi ya da sag panelin yapisi degisirse menu yerini kaybeder.
- `PromanPalette #--results { overlay: none; height: 1fr }` listeyi kutunun icine sabitler; kaldirilirsa liste
  kutudan tasan bir acilir katman olur.

### 10.11 Menu icin test

`run_test` ile menu durumunu okumak icin:

```python
from textual.command import CommandList

def menu_state(app):
    s = app.screen
    if not isinstance(s, proman.CommandPalette):
        return type(s).__name__                      # palet kapali: ustteki ekranin adi
    opts = s.query_one(CommandList)
    labels = [str(opts.get_option_at_index(i).hit.text) for i in range(opts.option_count)]
    return s.query_one("#--container").border_title, labels
```

Kurallar:

- **Menuden komut secen her testte once sunlari sahtele**, yoksa gercek eylem calisir:
  `app.engine.begin_task = lambda name: False` (hicbir is baslamaz) ve
  `app.action_take_screenshot = lambda: None` (ekran goruntusu alinmaz). Bu yapilmadigi icin bir test, menu sirasi
  degistikten sonra yanlislikla `Screenshot`'i secip Downloads'a dosya kaydetti.
- **Ogeleri sirayla (`down`, `down`, `enter`) degil numarayla sec** (`"3"`, bekle, `"enter"`). Sira degisince
  ok tuslu testler sessizce baska komutu calistirir.
- Her adimdan sonra bekle: yazidan sonra ~0.6 sn (arama zaman uyumsuz), secimden sonra ~0.8 sn (kapan + yeniden ac).
- Denenecekler: ana menu listesi; her grubun acilmasi ve basligi; ic ice grup; `Geri`; Esc ile seviye seviye cikis
  (alt-alt -> alt -> ana -> kapali -> cikis sorusu); yaprak secince paletin kapanmasi ve dogru eylemin cagrilmasi;
  `F9`'un tekrar kokten acmasi; ana menude ve bir grubun icinde yaziyla arama; rakamla secim; is calisirken Esc
  (menu yerinde kalmali, is iptal olmali).

## 11. Tarifler

**Menuye komut eklemek**

1. `PromanApp`'e `action_xxx` metodu yaz.
2. `PROMAN_MENU`'de dogru gruba `("emoji", "Metin", "Yardim", "action_xxx")` satiri ekle.
3. Tus da istiyorsan `BINDINGS`'e ekle; bos tuslari kontrol et (rakamlarin hepsi dolu). Bu dosyadaki tus tablosunu
   guncelle.

**Uzun suren yeni bir is eklemek**

```python
# motor
def run_lint(self) -> None:
    self.log(f"[bold cyan]🔎 {tg('LINT')} npm run lint baslatiliyor...[/bold cyan]")
    self._stream("npm run lint", self.root_dir, "LINT")

# arayuz (dekorator YOK)
def action_run_lint(self) -> None:
    self._engine_task("Lint", self.engine.run_lint)
```

Birden fazla adim varsa adimlar arasinda `if self.cancelled: return`, beklemelerde `self.cancel_event.wait(...)`.

**Motor disi, anlik bir eylem eklemek** (pencere acma, log yazma): duz metot yeter, `_engine_task` gerekmez
(`action_modal_ip`, `action_ios_info` ornek). Bloklayan bir sey yapacaksa `@work(thread=True)` ile ayri metoda al
(`_capture_window_png` ornek).

**Tabloya satir eklemek:** `TABLE_ROWS`'a anahtar ekle, `_collect_metrics` icinde `rows["anahtar"] = (7 hucre)`
doldur. Hucre sayisi `TABLE_COLUMNS` ile ayni olmalidir. Hucreler Rich markup'i olarak cizilir; degisken metni
`escape` et.

**Yeni servis eklemek:** `ProcessEngine.__init__`'te `Service(...)` tanimla, `listening_pids` listesine portunu ve
`_collect_metrics`'teki servis dongusune satirini ekle, `stop_system` sirasina koy. Servisler `CREATE_NEW_CONSOLE`
ile ayri pencerede calisir; PROMAN ciktilarini okumaz, sadece portu izler.

**Kopyalanabilir satir eklemek:** `HostBox.compose`'a `CopyLine("Etiket", "#renk", id="copy-xxx")` ekle,
`_collect_metrics._update` icinde `set_value(...)` cagir. Etiket en fazla 6 karakter; kutu yuksekligine
(`#top-stats-row`, 13 satir) sigdigini kontrol et.

**Yeni pencere (modal) eklemek:** `ModalScreen[T]` tureterek yaz, ortalamak icin `CustomUrlModal`'in
`DEFAULT_CSS`'indeki secicilere ekle, Esc ile kapanirken donecek deger `None` degilse `action_escape_key`'e dal ekle,
`on_button_pressed` icinde `event.stop()` cagir (yoksa olay `PromanApp.on_button_pressed`'e de gider). Is
thread'inden acilacaksa `pick_from_thread` desenini kullan: `call_from_thread` ile ac, `Event` ile bekle, beklerken
`engine.cancelled` kontrol et.

## 12. Dogrulama

Gercek terminali acmadan, Textual'in test surucusuyle (`run_test`) cogu davranis denenebilir. Kok dizinden:

```python
import asyncio, sys
sys.path.insert(0, "proman")
import proman

async def main():
    app = proman.PromanApp()
    app.engine.write_disk_log = lambda m: None           # disk loguna yazma
    proman.copy_to_windows_clipboard = lambda t: True    # kullanicinin panosunu bozma
    async with app.run_test(size=(155, 42)) as pilot:    # proman.bat'in actigi boyut
        await pilot.pause(1.0)
        app._engine_task("Deneme", lambda: app.engine._stream("ping -n 30 127.0.0.1", ".", "PING"))
        assert app.engine.is_task_running                 # isaret eszamanli konmali
        await pilot.press("f9"); await pilot.pause(0.5)
        await pilot.press("escape"); await pilot.pause(1.0)   # 1. Esc: iptal, menu acik kalir
        assert not app.engine.is_task_running and isinstance(app.screen, proman.CommandPalette)
        await pilot.press("escape"); await pilot.pause(0.5)   # 2. Esc: menu kapanir
        assert not isinstance(app.screen, proman.CommandPalette)
        print("OK")

asyncio.run(main())
```

Test yazarken:

- **Gercek servisleri baslatan / durduran eylemleri cagirma.** `start_service`, `stop_service`, `free_port` o portu
  dinleyen sureci oldurur; gelistiricinin acik API / Web / Expo'su kapanir. Is baslatmayi denemek icin zararsiz komut
  (`ping`, `python -c ...`) ile `_stream` kullan ya da `app.engine.begin_task`'i sahtesiyle degistir.
- **Menuden komut secen testlerde `action_take_screenshot` de sahtelenir** (Bolum 10.11); yoksa gercek ekran
  goruntusu Downloads'a kaydedilir.
- Ekrana cizilen metni okumak icin: `"".join(seg.text for seg in widget.render_line(0))`.
- Tabloyu okumak icin: `table.get_row("api")`; menu ogeleri icin `screen.query_one(CommandList)`.
- Islem bitince `proman/__pycache__` klasorunu sil.

Degisiklige gore denenmesi gerekenler:

| Dokunulan yer | Denenecek |
| --- | --- |
| Is / iptal / Esc | Is baslar baslamaz Esc; F9 acikken dort Esc (iptal, menu, cikis sorusu, kapat); cikti vermeyen komutta `x`; alt sureci olmayan beklemede Esc; pes pese cift Esc; secim penceresi acikken Esc; torun surecin boruyu tuttugu komut; geride surec kalmadigi |
| `_stream` | Basarili komut `True`, hatali komut `False`; `[INFO] x [1/2] [/bar]` iceren cikti ekranda ve disk logunda aynen |
| Yerlesim | 155 (varsayilan), 140 ve 120 sutunda `HostBox` / `SysBox` satirlari; adresler 155'te tam gorunmeli (140'ta sonu kisalir, kopyalama tam degeri verir) |
| Menu | Bolum 10.11'deki liste |
| Log paneli | Tek tik secmez; cift tik secer + kopyalar; ikinci cift tik oncekini kaldirir; Kopyala / `y` tum satirlar |

Basliksiz test rengi, hizayi ve gercek terminal davranisini (odak, pencere boyutu, emoji genisligi) gostermez. Son
kontrol `proman.bat` ile elle yapilir.

## 13. Yasanan hatalar (belirti -> sebep -> cozum)

| # | Belirti | Sebep | Cozum |
| --- | --- | --- | --- |
| 1 | Derleme bitiyor ama ESync baslamiyor, "APK hazir" cikmiyor | `finally` icinde `return False` basarili sonucu eziyor | `finally`'de `return` yok |
| 2 | CPU kolonu hep `0.0%` | Her olcumde yeni `psutil.Process` | Nesneler `_procs`'ta saklanir |
| 3 | Esc iptal etmiyor, cikis penceresi aciyor | Bayrak is thread'inde, gecikmeli kalkiyor | `begin_task` UI'de eszamanli; Esc `priority=True` |
| 4 | `TypeError: '_asyncio.Task' object is not callable` | `App._task` Textual'in kendi alani; ayni adla metot yazildi | Ad `_engine_task` |
| 5 | Iptalden sonra ikinci is birincinin ustune basliyor; UI 1-6 sn donuyor | Iptal bayragi kendisi indiriyor, `sleep` ve `taskkill` UI thread'inde | Bayragi sadece `execute_task` indirir; iptal ayri thread'de |
| 6 | Log'da `[API]`, `[NPM]`, `[INFO]` gorunmuyor | Textual koseli parantezi stil etiketi sanip siliyor | `tg()` ve dosyanin kendi `escape()`'i |
| 7 | Bazi cikti satirlari hic gorunmuyor | Gecersiz markup `MarkupError`, `except` yutuyor | Cikti kacirilir; `log_message` gecersiz markup'i kacirip yazar |
| 8 | Kopyalanan log'da etiketler eksik | `TAG_RE` regex'i gercek metni de siliyor | `plain_of()` |
| 9 | Adres satiri bos; "bazen yaziyor bazen yazmiyor" | Sigmayan deger alt satira kayiyor, satir yuksekligi 1 | `nowrap` + `ellipsis`, kutu `3fr`, etiket 6 karakter |
| 10 | Iptal edilen ya da biten derleme "mesgul" kalabilir | `for line in stdout` bloklar; torun surec boruyu tutuyor | Okuyucu thread + kuyruk + zaman asimi |
| 11 | API calisirken DB dusunce toggle API'yi oldurup baslatmiyor | `is_running` DB kapaliyken `False` donuyordu | "Calisiyor" = port dinleniyor |
| 12 | MSSQL "ONLINE" ama hedef yanlis | Ayar dosyasi yokken varsayilan adres yoklaniyor | Kaynak zinciri; yoksa `N/A`; instance icin SQL Browser |
| 13 | Adres penceresinde Esc cikis sorusunu aciyor | Pencerenin Esc baglamasi yok, olay App'e dusuyor | Esc mantigi tek yerde, `action_escape_key` |
| 14 | Butonda `[Enter]` yazisi gorunmuyor | Buton etiketi de markup | `(Enter)` |
| 15 | IPv6'da dinleyen servis "STOPPED" gorunebilir | `netstat -p tcp` sadece IPv4 | `psutil.net_connections("tcp")` |
| 16 | Hiz / ETA / yuzde anlamsiz | Satir uzunlugundan uydurulmus degerler | Kaldirildi; sadece olculenler |
| 17 | Eski kopya `npm install`'i yanlis klasorde calistirdi | Kok dizin `__file__` klasoru saniliyordu | `get_project_root()` |
| 18 | Test, Downloads'a ekran goruntusu kaydetti | Menu sirasi degisti; ok tuslariyla secim yapan test `Screenshot`'a denk geldi | Testte numarayla sec, eylemleri sahtele (10.11) |
| 19 | Grup secince menu kapanip acilmayabilir | Yeni palet, eskisi kapanmadan itiliyor / `is_open` kontrolune takiliyor | `_reopen_palette` gecikmeli ve tekrar denemeli |

10, 15 ve 19 kod okunarak bulunan risklerdir (gercekte yasanmadi); 10'un cozumu benzetimle test edildi.

## 14. Bilinen sinirlar ve acik konular

- **Gercek akislar bu calismada denenmedi** (gelistiricinin acik servislerine dokunmamak icin): `1` / `2` / `3-5`
  ile servis baslat-durdur, `7` ESync derleme, `6` tablet, WSA ac / kapat, APK ve cihaza kurma, screenshot.
  Cihaz secim penceresi sadece sahte veriyle denendi. Bunlar eski `process_manager.py` mantiginin tasinmis halidir.
- **Projeye ozel sabitler kodda:** servis listesi ve komutlari (API / Web / Mobil), `WEB_PORT`, `EXPO_PORT`,
  `ANDROID_PACKAGE`, `WSA_DIR` / `WSA_ADB` / `WSA_START_URI` (WSA yolu ve ADB adresi bu makineye ozel), ESync yollari, `SHORT_PATH_MARK`, `C:/cxx/catapp`. Baska projede kullanmak icin bunlarin
  `proman.json`'a tasinmasi gerekir; bugun sadece MSSQL hedefi, proje adi ve kok dizin projeden bagimsizdir.
- **Eski arac duruyor:** kokteki `process_manager.py` ve `PS-MAN.bat` yenisi gercek kullanimda dogrulaninca
  silinecek (`docs/reference/notes/klasor-yapisi.md`). O dosyaya dokunulmaz; menu yapisinin kaynagi odur.
- **Odak:** servis baslatinca acilan konsol odagi alabilir; o anda basilan Esc PROMAN'a ulasmaz. Kod tarafinda
  cozumu yok.
- **Yonetici olarak calisir** (`proman.bat` -> `-Verb RunAs`); proje sahibinin karari. Baslatilan servisler de
  yonetici yetkisiyle calisir.
- **Port temizligi serttir:** servis baslatirken o portu dinleyen surec, adina bakilmadan oldurulur (adi log'a
  yazilir). Portlar baska bir uygulamayla cakisiyorsa o uygulama kapanir.
- **Log dosyasi** (2026-10-08): `proman/log/process_manager_YYYYMMDD.log` (`.gitignore`'da: `*.log`). Eskiden proje
  kokundeydi. `ProcessEngine.write_disk_log`: `log_dir` (`__file__`'in yanindaki `log/`) yoksa olusturulur; dosya adi
  her yazmada o gunun tarihinden uretilir (gece yarisindan sonra yeni dosya; eskiden acilis gununde kaliyordu).
  Klasor acilamaz ya da dosyaya yazilamazsa program durmaz: `❌ [LOG] Log dosyasina yazilamiyor ...` ekrana BIR kez
  yazilir (`_disk_log_failed`), ekran logu devam eder; yazma duzelince kayit kendiliginden surer, yeni hata yine
  bildirilir. Eski dosyalar otomatik silinmez. Testlerde diske yazmamak icin `write_disk_log` sahtelenir (Bolum 12).
- **Klavyeyle log satiri secme yok**; sadece cift tiklama. Bilerek kaldirildi (tek tik + Enter cift tiklamayla
  karisiyordu).
- **Menu aramasi bulaniktir**; uzak eslesmeler listenin altinda cikabilir (Bolum 10.7).
- **Menu aramasi su an tum agaci tarar.** "Bir grubun icindeyken sadece o grupta ara" davranisi 2026-10-06'da
  yazilip denendi, ama `proman.py`'de su an yok (dosya disaridan onceki haline donmus). Geri getirmek tek satir:
  Bolum 10.8.
- **Sadece Windows:** `taskkill`, `clip`, `CREATE_NEW_CONSOLE`, `ctypes.windll`, `winreg`.
- **Bagimlilik kurulumu** eksik paketi sormadan, calisan Python'a `pip install` ile kurar.

## 15. Son degisiklikler (2026-10-08)

> [!NOTE]
> Bu bolum Gemini tarafindan yazildi (log yonu + satir numarasi ve komut kuyrugu). Kod: `proman.py`.

### 15.1 Log akis yonu ve satir numarasi rozeti

- **Varsayilan yon: en yeni log en ustte.** Yeni satir `ListView.insert(0, ...)` ile eklenir, liste en uste kayar.
  `Yeni ustte / Yeni altta` butonu (log basliginda) ya da `o` tusu yonu cevirir; loglar silinmez, `_log_entries`
  listesinden yeniden siralanip cizilir. Cift tikla secilen satir yon degisince secili kalir.
- **Kalicilik:** yon `proman/proman_ui.json` icine (`log_newest_top`) yazilir ve acilista okunur
  (`_load_ui_pref` / `_save_ui_pref`). Dosya yoksa varsayilan (yeni ustte).
- **Satir numarasi rozeti:** her satirin basinda `0001` gibi mavi rozet (`_num_badge`). Numara loga bagli sabittir
  (`_log_counter`), yon degisince degismez; 600 satir sinirinda eski satirlar silinse de sayac devam eder;
  `Temizle` sayaci sifirlar. Rozet ileride baska rozetler (seviye, etiket) eklemeye uygun tutuldu.
- `LogLineItem` artik `num` tasir. `Kopyala` ve cift tikla kopyalama numarasiz ve hep eskiden yeniye sirali
  yazar. Diskteki `process_manager_*.log` degismedi.

### 15.2 Komut kuyrugu

- **Davranis:** is calisirken verilen komut artik "MESGUL" ile reddedilmez; `_engine_task` onu kuyruga alir
  (`📥 KUYRUK ... siraya alindi (#N)`). Is bitince (basari, hata, iptal) siradaki otomatik baslar ve kuyruktan silinir.
  Ayni komut zaten kuyruktaysa ikinci kez eklenmez (toggle komutlari iki kez basilinca ac-kapat olmasin diye).
  Kuyruga girmeyen aninda komutlar: QR, adres secimi, screenshot, Refresh, iOS bilgisi.
- **Veri:** `PromanApp._queue` (`{id, name, fn}`, en yeni sonda) + `_queue_lock`. `_execute_engine_task` kuyruk
  bosalana kadar ayni is thread'inde doner; baska is kilidi kaparsa o isin worker'i kuyrugu bosaltir.
- **Motor degisikligi:** `begin_task(name, quiet=False, notify=True)`; `quiet` MESGUL uyarisini susturur, `notify=False`
  "CALISIYOR" bildirimini ertler (`notify_started()` ile kilit disinda gonderilir). `execute_task(fn, has_pending)`:
  kuyrukta is varsa 1.5 sn sonuc beklemesi ve `IDLE` atlanir.
- **F9 > `Kuyruk (N)`** (`Screenshot`'un ustunde): ustte `Calisan: ...` bilgisi, altinda bekleyenler **en son eklenen en
  ustte**, en altta `Kuyrugu Temizle`. Bir bekleyene Enter = sadece o iptal; menu ayni yerde yeniden acilir.
  Dugum `PROMAN_MENU`'de hedef olarak `"@queue"`; `menu_level()` bunu `_queue_level()` ile canli uretir.
  Dinamik hedefler: `@cancel:<id>`, `@clearq`, `action_queue_noop`.
- **Iptal kurallari:** `x` / `Esc` / Abort sadece calisan isi iptal eder, kuyruk devam eder (siradaki baslar).
  Kuyruk iptali sadece Kuyruk menusunden. `q` / `Exit` kuyrugu once temizler (cikarken yeni is baslamasin).
  `op-box` bilgi satirinda `Queue: +N` gorunur.
- **Yasanan hata (cozuldu):** kuyruk kilidi tutulurken `begin_task` -> `prog` -> `call_from_thread` UI thread'ini
  bekliyordu; UI de ayni kilidi bekleyince **kilitlenme** oldu. Cozum: bildirimi kilit disina almak (`notify=False`).
- **Test:** headless (`run_test`) ile sahte islerle: sira, ayni komut tekrari, tek iptal, toplu iptal, otomatik
  siradakine gecis dogrulandi. Gercek servis / derleme ile ve gorsel olarak denenmedi.

### 15.3 Token kullanimi (Claude) ve sade ana menu

- **Ana menu aciklamasiz:** `_entries()` `menu_path` bosken yardim metnini bosaltir; `discover` / rakam aramasi bos
  yardimi `help=None` olarak verir. `PROMAN_MENU`'deki ana seviye yardim metinleri duruyor (yaziyla aramada kullanilmaz
  ama dugum 4'lu kalmali).
- **Kaynak:** `npx --yes ccusage@latest claude daily --json --instances --offline` (`ProcessEngine._ccusage_daily`).
  Sadece Claude Code oturumlari; npx icin ag gerekir. `--project` filtresi ccusage'da sadece `daily`'de var,
  bu yuzden gunluk veri alinip hafta (Pazartesi baslar) ve ay toplamlari `print_token_usage` icinde hesaplanir.
- **Fiyat / maliyet yok (proje sahibi karari, 2026-10-08):** tabloda, JSON'da ve log'da hicbir asamada gosterilmez;
  ccusage'in maliyet alanlari okunmaz, `--offline` ile fiyat tablosu da indirilmez. Geri eklenmez.
- **Proje eslesmesi:** kok dizin (`root_dir`) Claude'un klasor adina cevrilir (harf / rakam disi her karakter `-`),
  buyuk-kucuk harf ayirmadan aranir. Alt klasorlerde acilan oturumlar da (`<slug>-...`) sayilir; birden fazla klasor
  eslesirse adlari tablonun altina yazilir. Yan etki: adi ayni onekle baslayan kardes klasor (`catApp-eski`) de eslesir.
- **Cikti:** tablo TEK log kaydi olarak yazilir (satirlar `\n` ile), boylece log yonu ne olursa olsun bozulmaz.
  Sutunlar: Girdi, Cikti, Cache (yazma + okuma), Toplam. Sayilar kisaltilir (`950`, `12.3K`, `481M`, `2.92B`);
  tam basamakli gosterim denendi, proje sahibi begenmedi (2026-10-08). Tam sayilar JSON ciktisinda durur.
  Tablo 40 karakter genisliginde.
  Gosterilen: son 14 gun / 12 hafta / 12 ay; `TOPLAM` sadece gosterilen satirlarin toplamidir.
- **Temiz ekran:** `Gunluk` / `Haftalik` / `Aylik` tabloyu basmadan once log ekranini temizler
  (`_token_table_task` -> `_clear_log_view`); temizlik is gercekten basladiginda yapilir, kuyrukta beklerken degil.
  Diskteki log dosyasi silinmez. JSON secenekleri ekrani temizlemez.
- **JSON ciktisi:** menude `Gunluk / Haftalik / Aylik → JSON dosyasi`. Tablo yazilmaz; TUM donemler (sinir yok)
  Downloads klasorune `proman_tokens_<period>_YYYYMMDD_HHMMSS.json` olarak kaydedilir, yol log'a yazilir.
  Alanlar: `project`, `agent`, `period`, `generatedAt`, `claudeProjects`, `rows` (cache yazma / okuma ayri), `totals`.
- **Iptal:** `_stream` kullanilmaz (JSON yakalanmali); surec `active_subprocess`'e yazilir ve `cancel_event.wait(0.2)`
  ile beklenir, cikti gecici dosyaya gider.
- **Test:** headless olarak gercek ccusage ile uc rapor, uc JSON dosyasi ve menu (ana menude yardim yok, alt menude var) dogrulandi
  (2026-10-08). Gercek terminalde gorsel olarak denenmedi.

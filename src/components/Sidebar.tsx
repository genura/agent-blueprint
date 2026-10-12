import { useEffect, useState } from 'react';
import { FilePlus2, FolderOpen, ImageDown, Save, Trash2, X } from 'lucide-react';
import { GUIDE_FILE, useFlow } from '../flow/store';
import { compactNumber, useTokens } from '../flow/useTokens';
import { Modal } from './Modal';
import { exportImage } from '../flow/exportImage';
import type { ExportFormat } from '../flow/exportImage';

const NAME_OK = /^[\w\-. ]+$/;

function NewSchemaDialog({ files, onClose }: { files: string[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const n = name.trim();
  const error = !n ? '' : !NAME_OK.test(n) ? 'Sadece harf, rakam, bosluk ve - _ . kullanilabilir'
    : files.includes(n.endsWith('.flow') ? n : n + '.flow') ? 'Bu adda bir sema zaten var' : '';
  const ok = !!n && !error && !busy;
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    await useFlow.getState().newFile(n);
    onClose();
  };
  return (
    <Modal title="Yeni sema" icon={<FilePlus2 size={20} />} onClose={onClose}
      footer={<>
        <button className="mbtn" onClick={onClose}>Vazgec</button>
        <button className="mbtn primary" disabled={!ok} onClick={submit}>Olustur</button>
      </>}>
      <label className="mfield">
        <span>Sema adi</span>
        <input autoFocus value={name} placeholder="or. odeme-akisi" maxLength={80}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </label>
      <div className={`mhint ${error ? 'err' : ''}`}>
        {error || (n ? <>Dosya: <code>{n.endsWith('.flow') ? n : n + '.flow'}</code></> : 'Sema klasorunde yeni bir .flow dosyasi olusturulur.')}
      </div>
    </Modal>
  );
}

export function DeleteDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmDelete = async () => {
    setBusy(true);
    const err = await useFlow.getState().deleteFile(name);
    if (err) {
      setError(err);
      setBusy(false);
    } else onClose();
  };
  return (
    <Modal title="Sema silinsin mi?" icon={<Trash2 size={20} />} onClose={onClose} danger
      footer={<>
        <button className="mbtn" onClick={onClose}>Vazgec</button>
        <button className="mbtn danger" autoFocus disabled={busy} onClick={confirmDelete}>{busy ? 'Siliniyor...' : 'Sil'}</button>
      </>}>
      <p className="mtext"><b>{name.replace(/\.flow$/, '')}</b> semasi silinecek.</p>
      <div className={`mhint ${error ? 'err' : ''}`}>{error || 'Dosya Geri Donusum Kutusu\'na tasinir; gerekirse oradan geri alinabilir.'}</div>
    </Modal>
  );
}

// PNG / SVG disa aktarma: secim varsa varsayilan olarak sadece secim; dosya sema klasorune yazilir
function ExportDialog({ file, onClose }: { file: string; onClose: () => void }) {
  const hasSel = useFlow((s) => s.nodes.some((n) => n.selected) || s.edges.some((e) => e.selected));
  const base = file.replace(/\.flow$/, '');
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState(2);
  const [onlySel, setOnlySel] = useState(hasSel);
  const [embed, setEmbed] = useState(true);
  const [name, setName] = useState(base + (hasSel ? '-secim' : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const n = name.trim();
  const nameErr = !n ? 'Dosya adi gerekli' : !NAME_OK.test(n) ? 'Sadece harf, rakam, bosluk ve - _ . kullanilabilir' : '';
  const scope = (sel: boolean) => {
    setOnlySel(sel);
    // Ad elle degistirilmediyse kapsamla birlikte guncellensin
    if (name === base || name === base + '-secim') setName(base + (sel ? '-secim' : ''));
  };
  const run = async () => {
    if (busy || nameErr) return;
    setBusy(true);
    setError('');
    try {
      setDone(await exportImage(format, scale, onlySel, n, embed));
    } catch (e) {
      setError(String((e as Error).message));
    }
    setBusy(false);
  };
  const reveal = () => fetch(`/api/reveal?name=${encodeURIComponent(done)}`, { method: 'POST' });

  if (done)
    return (
      <Modal title="Disa aktarildi" icon={<ImageDown size={20} />} onClose={onClose}
        footer={<>
          <button className="mbtn" onClick={() => void reveal()}>Explorer'da goster</button>
          <button className="mbtn primary" autoFocus onClick={onClose}>Tamam</button>
        </>}>
        <p className="mtext"><b>{done}</b> sema klasorune kaydedildi.</p>
      </Modal>
    );

  return (
    <Modal title="Disa aktar" icon={<ImageDown size={20} />} onClose={onClose}
      footer={<>
        <button className="mbtn" onClick={onClose}>Vazgec</button>
        <button className="mbtn primary" disabled={busy || !!nameErr} onClick={() => void run()}>{busy ? 'Hazirlaniyor...' : 'Disa aktar'}</button>
      </>}>
      <div className="mfield">
        <span>Bicim</span>
        <div className="mseg">
          <button className={format === 'png' ? 'on' : ''} onClick={() => setFormat('png')}>PNG<small>resim</small></button>
          <button className={format === 'svg' ? 'on' : ''} onClick={() => setFormat('svg')}>SVG<small>olceklenir</small></button>
        </div>
      </div>
      {format === 'png' && (
        <div className="mfield">
          <span>Cozunurluk</span>
          <div className="mseg">
            {[1, 2, 3, 4].map((s) => (
              <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>{s}x{s === 2 && <small>onerilen</small>}</button>
            ))}
          </div>
        </div>
      )}
      {format === 'svg' && (
        <label className="mcheck">
          <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} />
          <span>Fontlari dosyaya gom <small>(tarayicida birebir gorunur; dosya ~1-3 MB buyur. Figma/Illustrator yuklu fontu kullanir)</small></span>
        </label>
      )}
      <div className="mfield">
        <span>Kapsam</span>
        <div className="mseg">
          <button className={onlySel ? 'on' : ''} disabled={!hasSel} onClick={() => scope(true)}>Secim{!hasSel && <small>secim yok</small>}</button>
          <button className={!onlySel ? 'on' : ''} onClick={() => scope(false)}>Tum sema</button>
        </div>
      </div>
      <label className="mfield">
        <span>Dosya adi</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
      </label>
      <div className={`mhint ${error || nameErr ? 'err' : ''}`}>
        {error || nameErr || <>Sema klasorune <code>{n}.{format}</code> olarak yazilir (ayni adli dosyanin ustune yazar).</>}
      </div>
    </Modal>
  );
}

export function Sidebar() {
  const { files, file, dir, recent, live, errors, current, saved, externalChange, barHidden, showGuide } = useFlow();
  const { openFile, save, setLive, onExternalChange, changeDir } = useFlow.getState();
  const shortDir = dir.replace(/\\/g, '/');
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'delete'; name: string } | { kind: 'export' } | null>(null);
  // Ctrl+Shift+E (Figma) canvas'tan bu olayi yollar
  useEffect(() => {
    const open = () => useFlow.getState().file && setDialog({ kind: 'export' });
    window.addEventListener('flow-export', open);
    return () => window.removeEventListener('flow-export', open);
  }, []);

  // Alt+N: yeni sema. Tek yol 'flow-new' olayi: F9 secicisi ayni olayi dinleyip kendini kapatir (iki pencere ust uste kalmaz)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        window.dispatchEvent(new Event('flow-new'));
      }
    };
    const onNew = () => setDialog({ kind: 'new' });
    window.addEventListener('keydown', onKey);
    window.addEventListener('flow-new', onNew);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('flow-new', onNew);
    };
  }, []);

  // Once Windows klasor penceresi; acilamazsa yolu elle sor
  const pickDir = async () => {
    let err = await changeDir({ pick: true });
    if (err === 'klasor penceresi acilamadi') {
      const typed = prompt('Sema klasorunun tam yolu (or. C:\\Projeler\\catApp\\docs\\sema)', dir);
      if (!typed?.trim()) return;
      err = await changeDir({ dir: typed.trim() });
    }
    if (err) alert(err);
  };
  const dirty = current !== saved;
  const tokens = useTokens();

  const open = async (name: string) => {
    if (!live && dirty && !confirm('Kaydedilmemis degisiklikler kaybolacak. Devam?')) return;
    await openFile(name);
  };

  return (
    <aside className={`sidebar ${barHidden ? 'hidden' : ''}`}>
      <h1>Agent <span>Blueprint</span></h1>
      <div className="dir-box">
        <div className="dir-label">Klasor</div>
        <div className="dir-row">
          <div className="dir-path" title={shortDir}>{shortDir}</div>
          <button className="dir-reveal" title="Klasor sec" onClick={pickDir}>
            <Save size={15} />
          </button>
          <button className="dir-reveal" title="Explorer'da goster"
            onClick={() => fetch(`/api/reveal${file ? `?name=${encodeURIComponent(file)}` : ''}`, { method: 'POST' })}>
            <FolderOpen size={15} />
          </button>
        </div>
        {recent.filter((d) => d !== dir).length > 0 && (
          <div className="dir-actions">
            <select className="btn" value="" onChange={(e) => e.target.value && changeDir({ dir: e.target.value }).then((x) => x && alert(x))}>
              <option value="">Son klasorler</option>
              {recent.filter((d) => d !== dir).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
      </div>
      <button className="btn primary" onClick={() => setDialog({ kind: 'new' })}><FilePlus2 size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Yeni sema <kbd className="btn-kbd">Alt+N</kbd></button>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f} className={f === file ? 'on' : ''} onClick={() => open(f)}>
            <span className="file-name">{f.replace(/\.flow$/, '')}</span>
            {f !== GUIDE_FILE && (
              <button className="file-del" title="Semayi sil"
                onClick={(e) => { e.stopPropagation(); setDialog({ kind: 'delete', name: f }); }}>
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {file && (
        <div className="file-box">
          <label className="live">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Canli mod
          </label>
          {!live && (
            <button className="btn" disabled={!dirty} onClick={() => save()}>
              Kaydet {dirty ? '*' : ''}
            </button>
          )}
          {externalChange && (
            <div className="warn">
              Dosya disaridan degisti.
              <button className="btn" onClick={() => { useFlow.setState({ saved: current }); void onExternalChange(file); }}>
                Diskten yukle
              </button>
            </div>
          )}
          <div className="meta" title={`${tokens?.toLocaleString('tr-TR') ?? '…'} token · cl100k_base tokenizer ile sayildi (Distoken ile ayni). Claude'un kendi sayisi buna yakindir.`}>
            {tokens === null ? '… token' : `${compactNumber(tokens)} token`}
          </div>
          <button className="export-btn" title="PNG / SVG olarak disa aktar (Ctrl+Shift+E)" onClick={() => setDialog({ kind: 'export' })}>
            <ImageDown size={16} /> Disa aktar
          </button>
          <label className="live" title="Rehberin ornek semasini (FLOW_GUIDE.flow) listede gosterir. Salt okunur: burada yaptigin degisiklik diske yazilmaz, silinemez.">
            <input type="checkbox" checked={showGuide} onChange={(e) => useFlow.getState().setShowGuide(e.target.checked)} />
            Rehber semasini goster
          </label>
          <div className="path" title="Agent'a bu yolu ver">{dir.replace(/\\/g, '/')}/{file}</div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="errors">
          <b>Okunamayan satirlar</b>
          {errors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}

      <div className="help">
        V: sec · H: el · T: yazi · R: son sekil (ilk seferde kutu) · O: daire · F: paneli gizle/goster · M: secim menusunu gizle/goster<br />
        Arac sec, tikla: yerlestir · basili tutup surukle: boyutlu ciz (Shift: oran sabit) · Tab: sonraki arac · R: rastgele renk · tekerlek: renk degistir · Esc: iptal<br />
        Tab / Shift+Tab: nesneler arasi gez · Coklu secimde Tab: baglantilar → nesneler → hepsi<br />
        Kenar noktasi +: ayni sekli ekle ve bagla · Super onizleme (Ctrl+Alt+Shift basili): bos yonlerde baglantili kopya onizlemesi, ok tuslari yon secer, + / - secili yondeki sekli degistirir (her seferinde yeni renk), Enter ekler<br />
        Ctrl+C / X / V · Ctrl+D: cogalt · Alt+surukle: kopyala<br />
        Space+surukle: kaydir · secim yokken yon tuslari: kaydir (Shift: buyuk adim), ortada nisangah cikar · Enter: nisangahtaki ogeyi sec<br />
        Tekerlek: kaydir · Ctrl+tekerlek: zoom · Ctrl + / - ya da Ctrl+Yukari / Asagi: yakinlas / uzaklas (basili tut: akici, cift bas-tut: ivmeli) · Ctrl+0: %100<br />
        Shift+1: tumu · Shift+2: secime zoom · Shift+0: %100<br />
        Cift tik / Enter / F2: metin · Esc: bitir<br />
        Alt: secim cubugu odagi (Sol/Sag gez, Enter calistir, Esc birak) · Alt basili: kisayol rozetleri · Alt+0, 2-9, T Y U I O P [ ]: o dugme/menu · menude yon tuslari + Enter<br />
        Ctrl+yon tuslari: boyutlandir (Shift: buyuk adim)<br />
        F9: sema secici · Alt+N: yeni sema<br />
        Baglanti cizerken Tab: baglanti turu · Shift+surukle: baglantisiz nesneyi baglantinin arasina ekle<br />
        Gruptaki nesneye cift tik: grubun icine gir · bosa tik / Esc: cik<br />
        ] en one · [ en arkaya · Ctrl+] / Ctrl+[: bir adim · baglantida ] nesnelerin ustune, [ altina<br />
        Kenardaki noktadan surukle: bagla<br />
        Baglanti: uclari tasi, ortadan / etiketten tutup buk<br />
        Ctrl+B kalin · Ctrl+Shift+X cizili<br />
        Tablo: cift tik = hucre modu · surukle/Shift = coklu hucre · cift tik hucre = duzenle · Ctrl+C/X/V · Del · Enter/yaz = duzenle · Esc cik<br />
        Tasirken Esc: oldugu yerde birak<br />
        Section'a tamamen giren nesne section'a dahil olur · cift tik = icine gir (kare secim), Esc cik<br />
        Ctrl+G: grupla · Ctrl+Shift+G: grubu dagit (bir katman)<br />
        Ctrl+Alt+S: section olustur · Ctrl+Shift+S: section'i kaldir<br />
        Baglantilar gruplayinca degismez, eski nesnelere bagli kalir<br />
        Del: sil · Ctrl+Z / Ctrl+Y · Ctrl+S<br />
        Ctrl+Shift+E: PNG / SVG disa aktar (secim varsa sadece secim)
      </div>
      {dialog?.kind === 'new' && <NewSchemaDialog files={files} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteDialog name={dialog.name} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'export' && file && <ExportDialog file={file} onClose={() => setDialog(null)} />}
    </aside>
  );
}

// Sema klasorundeki .flow dosyalarini okur, yazar ve izler.
// Agent dosyayi degistirince tarayiciya SSE ile haber verir (canli mod).
// Klasor arayuzden secilebilir; secim flow.config.json'da saklanir.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const NAME_RE = /^[\w\-. ]+\.flow$/;
// Disa aktarilan gorseller (sema klasorune yazilir)
// Rehberin gorsel ornegi: sema degil, listede gosterilmez (sadece ada gore)
const HIDDEN = new Set(['FLOW_GUIDE.flow']);
const EXPORT_RE = /^[\w\-. ]+\.(png|svg)$/;

type Config = { dir: string; recent: string[] };

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });

// Modern Windows "Klasor sec" penceresi (Explorer tarzi; bkz. folder-picker.ps1). Yerel sunucu oldugu icin acilabilir.
function pickFolder(root: string, current: string): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.reject(new Error('desteklenmiyor'));
  const script = path.join(root, 'folder-picker.ps1');
  const args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-Start', current];
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', args, { windowsHide: true }, (err, out) => {
      if (err) return reject(err);
      resolve(out.trim() || null);
    });
  });
}

// Windows'ta Geri Donusum Kutusu'na tasir (yanlislikla silinen sema geri alinabilsin); digerlerinde siler
function removeFile(full: string): Promise<void> {
  if (process.platform !== 'win32') return fs.promises.unlink(full);
  // Yol tek tirnak icinde; icindeki ' ikilenerek kacirilir
  const script =
    'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
    `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${full.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

export function flowFiles(defaultDir = 'schema'): Plugin {
  return {
    name: 'flow-files',
    configureServer(server) {
      const root = server.config.root;
      // FLOW_CONFIG: testte ayri ayar dosyasi kullanmak icin
      const cfgPath = process.env.FLOW_CONFIG ?? path.join(root, 'flow.config.json');
      let cfg: Config = { dir: path.resolve(root, defaultDir), recent: [] };
      try {
        cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) };
      } catch {
        // ayar dosyasi yoksa varsayilan klasor
      }

      // Agent rehberi: master'lar projedeki guide/ klasorunde (dort dosya: .md, .flow, .png, .mjs). Sema klasorune
      // sadece FLOW_GUIDE.md yazilir: master'daki `<GUIDE>` yerine guide/ klasorunun tam yolu konur, diger uc dosya
      // master'dan kullanilir. Klasor secilince ve master md degisince aninda yazilir. Rehberi sadece master'da duzenle.
      const guideDir = path.join(root, 'guide');
      const guideMd = path.join(guideDir, 'FLOW_GUIDE.md');
      // Kopyadaki yol: ileri egik cizgili (node komutlari her kabukta calissin)
      const guideCopy = () => fs.readFileSync(guideMd, 'utf8')
        .replace(/^.*<!-- guide-dir -->.*$/m, 'This file is a copy written by the app; do not edit it (the master is `<GUIDE>/FLOW_GUIDE.md`).')
        .replaceAll('<GUIDE>', guideDir.split(path.sep).join('/'));
      // Secili klasor, varsayilan klasor (schema/) ve son klasorlerin hepsi guncel kalir: hangisine donulse kopya eski olmasin.
      // Sadece icerik farkliysa yazilir; artik olmayan son klasorler atlanir (yeniden olusturulmaz).
      const homeDir = path.resolve(root, defaultDir);
      const installGuide = () => {
        if (!fs.existsSync(guideMd)) return;
        const text = guideCopy();
        for (const dir of new Set([cfg.dir, homeDir, ...cfg.recent].map((d) => path.resolve(d)))) {
          if (dir === path.resolve(guideDir)) continue;
          if (dir === cfg.dir || dir === homeDir) fs.mkdirSync(dir, { recursive: true });
          else if (!fs.existsSync(dir)) continue;
          const dst = path.join(dir, 'FLOW_GUIDE.md');
          if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== text) fs.writeFileSync(dst, text, 'utf8');
        }
      };
      fs.watchFile(guideMd, { interval: 500 }, () => installGuide());
      // Rehber ornegi (.flow) master'dan okunur; degisince acik olan uygulama yeniden yuklesin
      fs.watchFile(path.join(guideDir, 'FLOW_GUIDE.flow'), { interval: 500 }, () => broadcast({ file: 'FLOW_GUIDE.flow', deleted: false }));

      // Dogrulayici (FLOW_GUIDE.mjs) uygulamanin okuyucusundan uretilir: kaynak degisince kendiliginden yeniden derlenir
      const checkSrcs = ['src/flow/format.ts', 'scripts/flow-check.ts'].map((p) => path.join(root, p));
      const rebuildCheck = async () => {
        try {
          const out = path.join(guideDir, 'FLOW_GUIDE.mjs');
          const built = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
          if (!checkSrcs.some((s) => fs.statSync(s).mtimeMs > built)) return;
          const m = await import(pathToFileURL(path.join(root, 'scripts/build-guide.mjs')).href);
          await m.buildGuideCheck();
        } catch (e) {
          server.config.logger.warn('FLOW_GUIDE.mjs uretilemedi: ' + String(e));
        }
      };
      void rebuildCheck();
      for (const s of checkSrcs) fs.watchFile(s, { interval: 1000 }, () => void rebuildCheck());

      const lastWritten = new Map<string, string>();
      const clients = new Set<ServerResponse>();
      const timers = new Map<string, NodeJS.Timeout>();
      let watcher: fs.FSWatcher | null = null;
      const broadcast = (msg: object) => {
        for (const c of clients) c.write(`data: ${JSON.stringify(msg)}\n\n`);
      };

      // Kendi yazdigimiz icerikle ayni olan degisiklikleri yayinlama
      const watch = () => {
        watcher?.close();
        fs.mkdirSync(cfg.dir, { recursive: true });
        installGuide();
        lastWritten.clear();
        watcher = fs.watch(cfg.dir, (_event, file) => {
          if (!file || !NAME_RE.test(file)) return;
          clearTimeout(timers.get(file));
          timers.set(file, setTimeout(() => {
            const full = path.join(cfg.dir, file);
            const content = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
            if (content !== null && content === lastWritten.get(file)) return;
            broadcast({ file, deleted: content === null });
          }, 120));
        });
      };

      const setDir = (dir: string) => {
        const prev = cfg.dir;
        cfg.dir = path.resolve(dir);
        // Onceki klasor de listede kalsin (ilk kullanimda varsayilan klasor dahil)
        cfg.recent = [cfg.dir, prev, ...cfg.recent].filter((d, i, arr) => arr.indexOf(d) === i).slice(0, 8);
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
        watch();
        broadcast({ dirChanged: cfg.dir });
      };

      watch();

      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const send = (code: number, body: string, type = 'text/plain; charset=utf-8') => {
          res.statusCode = code;
          res.setHeader('Content-Type', type);
          res.end(body);
        };
        const json = (code: number, body: object) => send(code, JSON.stringify(body), 'application/json; charset=utf-8');

        if (url.pathname === '/events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          res.write(': ok\n\n');
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }

        if (url.pathname === '/files') {
          // Olusturulma sirasina gore, en yeni ustte; ayni anda olusanlar ada gore
          const born = (f: string) => {
            try { return fs.statSync(path.join(cfg.dir, f)).birthtimeMs; } catch { return 0; }
          };
          const files = fs.existsSync(cfg.dir)
            ? fs.readdirSync(cfg.dir).filter((f) => NAME_RE.test(f) && !HIDDEN.has(f)).map((f) => ({ f, t: born(f) }))
              .sort((a, b) => b.t - a.t || a.f.localeCompare(b.f)).map((x) => x.f)
            : [];
          // guide: rehber ornegi master'da var mi (listede gizli; arayuzdeki kutu isaretlenince gosterilir)
          const guide = fs.existsSync(path.join(guideDir, 'FLOW_GUIDE.flow'));
          return json(200, { dir: cfg.dir, files, recent: cfg.recent, guide });
        }

        // Klasor degistir: { dir } ya da { pick: true } (Windows klasor penceresi)
        if (url.pathname === '/dir' && req.method === 'POST') {
          let body: { dir?: string; pick?: boolean } = {};
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            return json(400, { error: 'gecersiz istek' });
          }
          let dir = body.dir;
          if (body.pick) {
            try {
              dir = (await pickFolder(root, cfg.dir)) ?? undefined;
            } catch {
              return json(501, { error: 'klasor penceresi acilamadi' });
            }
            if (!dir) return json(200, { cancelled: true });
          }
          if (!dir || !path.isAbsolute(dir)) return json(400, { error: 'tam klasor yolu gerekli (or. C:\\Projeler\\x)' });
          try {
            setDir(dir);
          } catch (e) {
            return json(400, { error: String((e as Error).message) });
          }
          return json(200, { dir: cfg.dir });
        }

        // Sema klasorunu Explorer'da ac; ad verilirse o dosyayi secili getir
        if (url.pathname === '/reveal' && req.method === 'POST') {
          const name = url.searchParams.get('name') ?? '';
          const full = NAME_RE.test(name) || EXPORT_RE.test(name) ? path.join(cfg.dir, name) : '';
          const target = full && fs.existsSync(full) ? full : cfg.dir;
          if (process.platform === 'win32') {
            // Explorer'i acip one getirir (bkz. reveal.ps1); sonucu beklemeye gerek yok
            const args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'reveal.ps1'), '-Folder', cfg.dir];
            if (target !== cfg.dir) args.push('-File', target);
            execFile('powershell.exe', args, { windowsHide: true }, () => {});
          } else if (process.platform === 'darwin') {
            execFile('open', target === cfg.dir ? [cfg.dir] : ['-R', target], () => {});
          } else {
            execFile('xdg-open', [cfg.dir], () => {});
          }
          return json(200, { ok: true });
        }

        // PNG (data URL) ya da SVG (metin) olarak gelen goruntuyu sema klasorune yazar
        if (url.pathname === '/export' && req.method === 'PUT') {
          const name = url.searchParams.get('name') ?? '';
          if (!EXPORT_RE.test(name)) return send(400, 'gecersiz dosya adi');
          const body = await readBody(req);
          const full = path.join(cfg.dir, name);
          if (name.endsWith('.png')) {
            const m = /^data:image\/png;base64,(.+)$/.exec(body);
            if (!m) return send(400, 'png verisi okunamadi');
            fs.writeFileSync(full, Buffer.from(m[1], 'base64'));
          } else {
            const svg = body.startsWith('data:') ? decodeURIComponent(body.slice(body.indexOf(',') + 1)) : body;
            fs.writeFileSync(full, svg, 'utf8');
          }
          return send(200, full);
        }

        if (url.pathname === '/file') {
          const name = url.searchParams.get('name') ?? '';
          if (!NAME_RE.test(name)) return send(400, 'gecersiz dosya adi');
          // Rehber ornegi salt okunur ve sadece master'dan okunur
          const isGuide = HIDDEN.has(name);
          if (isGuide && req.method !== 'GET') return send(403, 'rehber dosyasi salt okunur');
          const full = path.join(isGuide ? guideDir : cfg.dir, name);
          if (req.method === 'GET') {
            if (!fs.existsSync(full)) return send(404, 'yok');
            return send(200, fs.readFileSync(full, 'utf8'));
          }
          if (req.method === 'PUT') {
            const body = await readBody(req);
            lastWritten.set(name, body);
            fs.writeFileSync(full, body, 'utf8');
            return send(200, 'ok');
          }
          if (req.method === 'DELETE') {
            if (!fs.existsSync(full)) return send(404, 'yok');
            try {
              await removeFile(full);
            } catch (e) {
              return send(500, String((e as Error).message));
            }
            lastWritten.delete(name);
            return send(200, 'ok');
          }
        }
        send(404, 'yok');
      });
    },
  };
}

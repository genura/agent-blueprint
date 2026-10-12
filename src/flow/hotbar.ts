// Secim arac cubuguna klavyeden erisim.
// - Alt basili tutulunca her ogenin ustunde kisayol rozeti gorunur (CSS sayaci, body.alt-hints).
// - Alt + tus o ogeyi calistirir: acilir menuyse acar, dugmeyse dogrudan basar.
// - Alt'a her basista cubuk "sahte odak" alir (gercek DOM odagi degil, data-hot-focus isareti) ve ilk ogeye doner:
//   Sol/Sag ogeler arasinda gezer, Enter / Bosluk / Asagi calistirir, Esc ya da fare tiklamasi odagi birakir.
//   Acilan menunun icindeyken tuslar menunundur (Toolbars.tsx Drop); menu kapaninca sahte odak ayni ogede surer.

// Kisayol tuslari, sirayla: 0, 2-9 (1 yok), sonra T Y U I O P [ ] (fiziksel tus konumu).
// Rozet yazilari App.css'teki @counter-style hotkeys ile AYNI sirada olmali.
const KEYS = ['0', '2', '3', '4', '5', '6', '7', '8', '9', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];

// Rozet numaralariyla ayni sira: CSS sayaci da ayni ogeleri belge sirasiyla sayar
const ITEMS = ':scope > .tb-btn, :scope > .drop > .tb-btn';
const FOCUS = 'data-hot-focus';

function items(): HTMLElement[] {
  if (document.querySelector('.modal-backdrop')) return [];
  const bar = [...document.querySelectorAll<HTMLElement>('[data-hotbar]')].find((b) => b.offsetParent !== null);
  return bar ? [...bar.querySelectorAll<HTMLElement>(ITEMS)] : [];
}

// Sahte odak birakilinca gercek odak tuvale doner: secili nesne (yoksa secili baglanti). Odak cubuktaki bir dugmede
// ya da hicbir yerde kalirsa ok tuslari / kisayollar nesneye ulasmaz.
function restoreFocus(field: HTMLElement | null) {
  // Alt'a yazi alanindayken basildiysa ve alan hala duruyorsa yaziya geri don
  if (field?.isConnected) return field.focus({ preventScroll: true });
  const target = document.querySelector<HTMLElement>('.react-flow__node.selected') ?? document.querySelector<HTMLElement>('.react-flow__edge.selected');
  const active = document.activeElement as HTMLElement | null;
  if (target) target.focus({ preventScroll: true });
  if (document.activeElement !== target && active?.closest('[data-hotbar]')) active.blur();
}

export function initHotbar(): () => void {
  let idx = -1; // sahte odaktaki oge; -1 = odak yok
  let field: HTMLElement | null = null; // Alt'a basildiginda odaktaki yazi alani (Esc ile oraya donulur)
  const hints = (on: boolean) => document.body.classList.toggle('alt-hints', on);
  const inField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  const inMenu = () => !!document.activeElement?.closest('.drop-menu');

  // Isareti guncel cubuga uygula (cubuk yeniden cizilmis ya da secim degismis olabilir)
  const apply = () => {
    document.querySelectorAll(`[${FOCUS}]`).forEach((el) => el.removeAttribute(FOCUS));
    if (idx < 0) return;
    const list = items();
    if (!list.length) { idx = -1; return; }
    idx = Math.min(idx, list.length - 1);
    list[idx].setAttribute(FOCUS, '');
  };
  // React yeniden cizdikten sonra da dogru kalsin
  const sync = () => { apply(); requestAnimationFrame(apply); setTimeout(apply, 80); };
  const stop = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); };
  // Ogeyi calistir. Yazi duzenleniyorsa once alandan cik (taslak kaydedilir), sonra bas: fareyle tiklamakla ayni sira.
  // Aksi halde dugme kayitli metni degistirir ama duzenleme bitince eski taslak ustune yazilir ve islem kaybolur.
  const fire = (i: number) => {
    const active = document.activeElement as HTMLElement | null;
    if (!inField(active)) return void items()[i]?.click();
    active!.blur();
    field = null;
    setTimeout(() => { items()[i]?.click(); sync(); }, 0);
  };

  const onDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      if (e.ctrlKey || e.metaKey) return; // AltGr (Ctrl+Alt) yazi karakteri uretir: karisma
      e.preventDefault(); // tek basina Alt tarayici menusune odaklanmasin (yazi alaninda da)
      if (e.repeat || !items().length) return;
      hints(true);
      idx = 0; // her Alt basisi sahte odagi sifirlar
      field = inField(e.target) ? (document.activeElement as HTMLElement) : null;
      sync();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      // Ctrl'lu bir kombinasyon (or. Ctrl+Alt+Shift hizli ekleme): rozetleri ve sahte odagi birak
      if (idx >= 0 || document.body.classList.contains('alt-hints')) { hints(false); idx = -1; sync(); }
      return;
    }
    if (e.altKey) {
      const i = KEYS.indexOf(/^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1] ?? e.code);
      if (i < 0) { hints(false); idx = -1; sync(); return; } // Alt+N gibi baska bir kisayol
      const list = items();
      if (!list.length) return;
      stop(e);
      if (e.repeat || !list[i]) return;
      idx = i;
      fire(i);
      sync();
      return;
    }
    // Sahte odak: cubukta gezinme (acik menunun icindeyken karisma). Yazi alaninda da calisir.
    if (idx < 0 || inMenu()) return;
    const list = items();
    if (!list.length) { idx = -1; sync(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      stop(e);
      idx = (Math.min(idx, list.length - 1) + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
      sync();
    } else if (e.key === 'Enter' || e.key === 'ArrowDown' || (e.key === ' ' && !inField(e.target))) {
      stop(e);
      if (!e.repeat) fire(Math.min(idx, list.length - 1));
      sync();
    } else if (e.key === 'ArrowUp') {
      stop(e); // nesneyi tasimasin
    } else if (e.key === 'Escape') {
      stop(e);
      idx = -1;
      sync();
      restoreFocus(field);
    } else if (inField(e.target) && e.key.length === 1) {
      // Yazi alaninda yazmaya devam edildi: sahte odagi birak, tus yaziya gitsin
      idx = -1;
      sync();
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (e.key !== 'Alt') return;
    e.preventDefault(); // tek basina Alt tarayici menusune odaklanmasin
    hints(false);
  };
  // Fareyle bir yere tiklamak sahte odagi birakir
  const onMouse = () => { if (idx >= 0) { idx = -1; apply(); } };
  const off = () => hints(false);

  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  window.addEventListener('mousedown', onMouse, true);
  window.addEventListener('blur', off);
  return () => {
    window.removeEventListener('keydown', onDown, true);
    window.removeEventListener('keyup', onUp, true);
    window.removeEventListener('mousedown', onMouse, true);
    window.removeEventListener('blur', off);
    off();
    idx = -1;
    apply();
  };
}

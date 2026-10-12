// Nisangah (klavyeyle kaydirma modu): ekranin ortasina denk gelen nesne ya da baglanti "on secim" olarak isaretlenir.
// Isaret DOM'da data-aim ozelligidir (React'in yonettigi className'e dokunulmaz); gorunumu App.css'te fareyle
// uzerine gelmekle ayni kurallardan gelir.
export type AimTarget = { kind: 'node' | 'edge'; id: string };

let target: AimTarget | null = null;
let el: Element | null = null;

export const aimTarget = () => target;

export function aimClear() {
  el?.removeAttribute('data-aim');
  document.querySelectorAll('[data-aim]').forEach((x) => x.removeAttribute('data-aim'));
  target = null;
  el = null;
}

// Tuvalin tam ortasindaki en ustteki nesne/baglanti. Nisangahin kendisi tiklamayi gecirdigi icin sonuca girmez.
export function aimUpdate(canvas: HTMLElement | null) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  let found: Element | null = null;
  for (const hit of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
    if (!canvas.contains(hit)) continue;
    found = hit.closest('.react-flow__node, .react-flow__edge');
    if (found) break;
    if (hit.classList.contains('react-flow__pane')) break; // bos tuvale ulasildi
  }
  if (found === el) return;
  el?.removeAttribute('data-aim');
  el = found;
  const id = (found as HTMLElement | null)?.dataset.id;
  target = found && id ? { kind: found.classList.contains('react-flow__edge') ? 'edge' : 'node', id } : null;
  if (target) found!.setAttribute('data-aim', '');
  else el = null;
  // Nisangah yeni bir ogeye carpti: kisa, esnek bir sallanma (sinif cikarilip yeniden eklenerek animasyon bastan oynar)
  const cross = canvas.querySelector<HTMLElement>('.aim-cross');
  if (cross) {
    cross.classList.remove('hit');
    cross.toggleAttribute('data-on', !!target);
    if (target) {
      void cross.offsetWidth;
      cross.classList.add('hit');
    }
  }
}

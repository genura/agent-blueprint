"""
.flow dogrulayici (FLOW_GUIDE v13 kurallari). Kullanim:  python flow_check.py dosya.flow [dosya2.flow ...]
Kontroller: satir bicimi, tekrarlanan id, bilinmeyen sekil / renk / fmt, Section'in cocuktan once gelmesi, cocugun
Section icinde kalmasi, ayni duzeydeki kutularin ust uste binmesi, kopuk ok, grup satirlari (var olan id, kismi
cakisma, tekrar). Cikis kodu: hata varsa 1. Yalniz okur, dosyayi degistirmez.
"""
import re
import sys
from itertools import combinations

SHAPES = {'rect', 'round', 'pill', 'circle', 'diamond', 'db', 'text', 'group', 'table'}
COLORS = set('kgroyntbvpwKGROYNTBVP') | {'-'}
FMT = re.compile(r'^([smlx<^>0123~MOW]|=[kgroyntbvpwKGROYNTBVP])*$')
EDGE = re.compile(r'^([A-Za-z0-9_]+)>([A-Za-z0-9_]+)(/\S*)?(\s.*)?$')


def color_ok(c):
    return c in COLORS or re.fullmatch(r'#[0-9A-Fa-f]{6}', c) is not None


def check(path):
    errors, nodes, edges, groups = [], {}, [], []
    lines = open(path, encoding='utf-8').read().splitlines()
    for no, line in enumerate(lines, 1):
        if not line.strip() or line.startswith('#'):
            continue
        if line.startswith('&'):
            groups.append((no, line[1:].split(',')))
            continue
        head = line.split(' ', 1)[0]
        if '>' in head:
            m = EDGE.match(line)
            if not m:
                errors.append(f'{no}: ok bicimi bozuk')
            else:
                edges.append((no, m.group(1), m.group(2)))
            continue
        parts = line.split(' ', 7)
        if len(parts) < 7:
            errors.append(f'{no}: dugum alanlari eksik')
            continue
        ident, shape, color, x, y, w, h = parts[:7]
        nid, _, section = ident.partition('@')
        base, _, fmt = shape.partition('.')
        if nid in nodes:
            errors.append(f'{no}: tekrarlanan id {nid}')
        if base not in SHAPES:
            errors.append(f'{no}: bilinmeyen sekil {base}')
        if fmt and not FMT.match(fmt):
            errors.append(f'{no}: gecersiz fmt {fmt}')
        if not color_ok(color):
            errors.append(f'{no}: gecersiz renk {color}')
        if section and section not in nodes:
            errors.append(f'{no}: Section {section} once tanimlanmali')
        elif section and nodes[section]['shape'] != 'group':
            errors.append(f'{no}: {section} bir Section (group) degil')
        try:
            box = None if '-' in (x, y, w, h) else tuple(int(v) for v in (x, y, w, h))
        except ValueError:
            errors.append(f'{no}: x y w h sayi ya da - olmali')
            box = None
        nodes[nid] = {'no': no, 'shape': base, 'section': section or None, 'box': box}

    # Section tasmasi (cocuk koordinatlari Section'a goreli).
    for nid, n in nodes.items():
        sec = n['section']
        if sec and n['box'] and nodes.get(sec, {}).get('box'):
            x, y, w, h = n['box']
            _, _, sw, sh = nodes[sec]['box']
            if x < 0 or y < 0 or x + w > sw or y + h > sh:
                errors.append(f"{n['no']}: {nid} Section {sec} disina tasiyor")

    # Ayni duzeyde (ayni Section ya da ust duzey) ust uste binme; serbest metin haric.
    for a, b in combinations([k for k, n in nodes.items() if n['box'] and n['shape'] != 'text'], 2):
        A, B = nodes[a], nodes[b]
        if A['section'] != B['section']:
            continue
        ax, ay, aw, ah = A['box']
        bx, by, bw, bh = B['box']
        if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
            errors.append(f"{B['no']}: {a} ile {b} ust uste biniyor")

    for no, a, b in edges:
        for end in (a, b):
            if end not in nodes:
                errors.append(f'{no}: ok ucu yok: {end}')

    seen = []
    for no, ids in groups:
        s = set(ids)
        if len(ids) < 2:
            errors.append(f'{no}: grup en az 2 id ister')
        for i in ids:
            if i not in nodes:
                errors.append(f'{no}: grupta olmayan id {i}')
        for prev_no, p in seen:
            if s == p:
                errors.append(f'{no}: tekrarlanan grup (satir {prev_no})')
            elif s & p and not (s <= p or p <= s):
                errors.append(f'{no}: grup satir {prev_no} ile kismi cakisiyor')
        seen.append((no, s))

    return len(nodes), len(edges), errors


if __name__ == '__main__':
    failed = False
    for f in sys.argv[1:]:
        n, e, errs = check(f)
        print(f"{f}: {n} dugum, {e} ok, {'HATA: yok' if not errs else f'{len(errs)} hata'}")
        for err in errs:
            print('  ' + err)
        failed |= bool(errs)
    sys.exit(1 if failed else 0)

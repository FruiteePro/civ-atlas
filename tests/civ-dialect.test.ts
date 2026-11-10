/**
 * 分化出来的民族仍用母族语感,但地名、人名按这一支的方言起:
 * 同一套写法,通名、词尾和一批独有词根会偏一点;再分一支时叠在母族方言上。
 */
import { describe, expect, it } from 'vitest';
import { createNamer, createPersonNamer } from '../src/gen/names';
import { cultureDialect } from '../src/gen/civ/naming';
import type { Culture } from '../src/gen/civ/types';

function cu(partial: Partial<Culture> & Pick<Culture, 'id' | 'style'>): Culture {
  return {
    name: '',
    kind: 'farm',
    hearth: 0,
    born: 0,
    expansionism: 1,
    color: [0, 0, 0],
    ...partial,
  };
}

function line(style: string): Culture[] {
  const root = cu({ id: 0, name: '居兰', style, hearth: 11, born: 0 });
  const child = cu({ id: 1, name: '北居兰', style, hearth: 22, born: 400, parent: 0, branch: '北' });
  const grand = cu({ id: 2, name: '西居兰', style, hearth: 33, born: 800, parent: 1, branch: '西' });
  const pioneer = cu({ id: 3, name: '开拓', style, hearth: 44, born: 100, pioneer: 0 });
  return [root, child, grand, pioneer];
}

const STYLES = ['kingdom', 'imperial', 'nordic', 'desert', 'central', 'xianxia', 'yamato', 'haedong'] as const;
const KINDS = ['city', 'region', 'state'] as const;

function placeNames(style: string, dialect: number, seed = 7, n = 8) {
  const nm = createNamer(seed, style, dialect || undefined);
  const out: string[] = [];
  for (const kind of KINDS) {
    for (let i = 0; i < n; i++) out.push(nm.keyed(kind, 1000 + i, 0)().zh);
  }
  return { namer: nm, names: out };
}

function personNames(style: string, dialect: number, seed = 7, n = 16) {
  const nm = createPersonNamer(seed, style, dialect || undefined);
  const given = Array.from({ length: n }, (_, i) => nm.given(2000, i));
  const female = Array.from({ length: n }, (_, i) => nm.femaleGiven(2000, i));
  const surname = Array.from({ length: n }, (_, i) => nm.surname(2000, i));
  return { namer: nm, given, female, surname, all: [...given, ...female] };
}

function differ(a: string[], b: string[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

describe('分化出来的民族的方言', () => {
  it('沿用母族语感 id;开拓民族、始祖没有方言盐', () => {
    const cultures = line('kingdom');
    const [root, child, grand, pioneer] = cultures;
    expect(child.style).toBe(root.style);
    expect(grand.style).toBe(root.style);
    expect(cultureDialect(root, cultures)).toBe(0);
    expect(cultureDialect(pioneer, cultures)).toBe(0);
    expect(cultureDialect(child, cultures)).not.toBe(0);
    expect(cultureDialect(grand, cultures)).not.toBe(0);
    expect(cultureDialect(grand, cultures)).not.toBe(cultureDialect(child, cultures));
  });

  it('同样的种子 + 民族两次方言盐、起名都一样', () => {
    const a = line('kingdom');
    const b = line('kingdom');
    expect(cultureDialect(a[1], a)).toBe(cultureDialect(b[1], b));
    expect(cultureDialect(a[2], a)).toBe(cultureDialect(b[2], b));
    const salt = cultureDialect(a[1], a);
    expect(placeNames('kingdom', salt).names).toEqual(placeNames('kingdom', salt).names);
    expect(personNames('central', salt).all).toEqual(personNames('central', salt).all);
    expect(personNames('kingdom', salt).all).toEqual(personNames('kingdom', salt).all);
  });

  it('西幻、东方:地名和人名听得出差别,但仍是同一门语感', () => {
    for (const style of STYLES) {
      const cultures = line(style);
      const childSalt = cultureDialect(cultures[1], cultures);
      const parentP = placeNames(style, 0);
      const childP = placeNames(style, childSalt);
      expect(childP.namer.style.id, style).toBe(style);
      expect(childP.namer.style.id).toBe(parentP.namer.style.id);
      expect(childP.namer.style.family).toBe(parentP.namer.style.family);
      const d = differ(parentP.names, childP.names);
      expect(d, `${style} place names should audibly differ (${d}/${parentP.names.length})`).toBeGreaterThanOrEqual(Math.ceil(parentP.names.length * 0.4));
      if (parentP.namer.style.family === 'western') {
        const p = createNamer(7, style);
        const c = createNamer(7, style, childSalt);
        expect(p.keyed('city', 42)().latin).toBeTruthy();
        expect(c.keyed('city', 42)().latin).toBeTruthy();
      } else {
        const p = createNamer(7, style).keyed('city', 42)();
        const c = createNamer(7, style, childSalt).keyed('city', 42)();
        expect(p.latin).toBeUndefined();
        expect(c.latin).toBeUndefined();
        expect(c.zh).toMatch(/[一-鿿]/);
      }
      const parentPe = personNames(style, 0);
      const childPe = personNames(style, childSalt);
      expect(childPe.namer.style).toBe(style);
      expect(childPe.namer.family).toBe(parentPe.namer.family);
      expect(childPe.namer.surnamed).toBe(parentPe.namer.surnamed);
      const pd = differ(parentPe.all, childPe.all);
      expect(pd, `${style} person names should audibly differ (${pd}/${parentPe.all.length})`).toBeGreaterThanOrEqual(Math.ceil(parentPe.all.length * 0.35));
    }
  });

  it('再分一支叠在母族方言上,和始祖、母族都不一样', () => {
    for (const style of ['kingdom', 'central'] as const) {
      const cultures = line(style);
      const childSalt = cultureDialect(cultures[1], cultures);
      const grandSalt = cultureDialect(cultures[2], cultures);
      const root = placeNames(style, 0).names;
      const child = placeNames(style, childSalt).names;
      const grand = placeNames(style, grandSalt).names;
      expect(differ(grand, root)).toBeGreaterThanOrEqual(Math.ceil(root.length * 0.4));
      expect(differ(grand, child)).toBeGreaterThanOrEqual(Math.ceil(root.length * 0.35));
      const r = personNames(style, 0).all;
      const c = personNames(style, childSalt).all;
      const g = personNames(style, grandSalt).all;
      expect(differ(g, r)).toBeGreaterThanOrEqual(Math.ceil(r.length * 0.35));
      expect(differ(g, c)).toBeGreaterThanOrEqual(Math.ceil(r.length * 0.3));
    }
  });

  it('给分化支做方言不会改掉母族词库(母族起名和原来一样)', () => {
    const cultures = line('kingdom');
    const salt = cultureDialect(cultures[1], cultures);
    const before = placeNames('kingdom', 0).names;
    placeNames('kingdom', salt);
    personNames('kingdom', salt);
    const after = placeNames('kingdom', 0).names;
    expect(after).toEqual(before);
    const pb = personNames('central', 0).all;
    personNames('central', salt);
    expect(personNames('central', 0).all).toEqual(pb);
  });
});

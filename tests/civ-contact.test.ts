/**
 * 同一书写系统里,外族统治够久以后,被统治民族后来的地名、国号、人名走接触语:
 * 短统治或不同书写系统不触发;接触年以前的名字不动;国号都城比州名更偏上层;两次起名一样。
 */
import { describe, expect, it } from 'vitest';
import { createNamer, createPersonNamer } from '../src/gen/names';
import {
  CONTACT_MAJORITY_FLOOR,
  CONTACT_MIN_REGIONS,
  CONTACT_RULE_YEARS,
  contactAt,
  contactSalt,
  contactSizeGate,
  detectContacts,
  type CultureContact,
} from '../src/gen/civ/contact';
import { namingContact } from '../src/gen/civ/naming';
import { Layer, type ChangeLog, type Culture, type Polity } from '../src/gen/civ/types';

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

function po(id: number, culture: number, founded = 0): Polity {
  return { id, name: '', culture, capital: 0, founded, kind: 'farm', expansionism: 1, color: [0, 0, 0] };
}

function logOf(entries: { year: number; region: number; layer: Layer; value: number }[]): ChangeLog {
  const n = entries.length;
  const year = new Float32Array(n);
  const region = new Int32Array(n);
  const layer = new Uint8Array(n);
  const value = new Int16Array(n);
  const cause = new Uint8Array(n);
  entries.forEach((e, i) => {
    year[i] = e.year;
    region[i] = e.region;
    layer[i] = e.layer;
    value[i] = e.value;
  });
  return { size: n, year, region, layer, value, cause };
}

/** 民族 0 住满 regions 州,从 year0 起由国家(民族 1)统治到 end */
function ruledLog(regions: number, year0: number, end: number, extra?: { year: number; region: number; layer: Layer; value: number }[]): ChangeLog {
  const es: { year: number; region: number; layer: Layer; value: number }[] = [];
  for (let r = 0; r < regions; r++) {
    es.push({ year: 0, region: r, layer: Layer.Culture, value: 0 });
    es.push({ year: year0, region: r, layer: Layer.Polity, value: 0 });
  }
  if (extra) es.push(...extra);
  es.sort((a, b) => a.year - b.year || a.region - b.region || a.layer - b.layer);
  void end;
  return logOf(es);
}

const KINDS = ['city', 'region', 'state'] as const;

function placeNames(style: string, contact?: { style: string; salt: number; official?: boolean }, seed = 7, n = 8) {
  const nm = createNamer(seed, style, undefined, contact);
  const out: string[] = [];
  for (const kind of KINDS) {
    for (let i = 0; i < n; i++) out.push(nm.keyed(kind, 1000 + i, 0)().zh);
  }
  return { namer: nm, names: out, byKind: Object.fromEntries(KINDS.map((k) => [k, Array.from({ length: n }, (_, i) => nm.keyed(k, 2000 + i, 0)().zh)])) as Record<(typeof KINDS)[number], string[]> };
}

function personNames(style: string, contact?: { style: string; salt: number }, seed = 7, n = 16) {
  const nm = createPersonNamer(seed, style, undefined, contact);
  const given = Array.from({ length: n }, (_, i) => nm.given(2000, i));
  const female = Array.from({ length: n }, (_, i) => nm.femaleGiven(2000, i));
  return { namer: nm, given, female, all: [...given, ...female] };
}

function differ(a: string[], b: string[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

describe('接触语的触发', () => {
  it('同一书写系统里,外族统治够久可以产生接触语;短统治或不同书写系统不会', () => {
    const cultures = [cu({ id: 0, name: '居兰', style: 'kingdom', hearth: 1 }), cu({ id: 1, name: '奥列', style: 'imperial', hearth: 2 })];
    const polities = [po(0, 1, 100)];
    const long = detectContacts(cultures, polities, ruledLog(10, 100, 400), 10, 400);
    expect(long).toEqual([{ culture: 0, style: 'imperial', year: 100 + CONTACT_RULE_YEARS }]);
    expect(contactAt(long, 0, 100 + CONTACT_RULE_YEARS - 1)).toBeUndefined();
    expect(contactAt(long, 0, 100 + CONTACT_RULE_YEARS)?.style).toBe('imperial');

    const short = detectContacts(cultures, polities, ruledLog(10, 100, 200), 10, 200);
    expect(short).toEqual([]);

    const tiny = detectContacts(cultures, polities, ruledLog(2, 100, 400), 2, 400);
    expect(tiny).toEqual([]);
    expect(contactSizeGate(2, 2)).toBe(false);
    expect(contactSizeGate(CONTACT_MAJORITY_FLOOR, 6)).toBe(true);
    expect(contactSizeGate(CONTACT_MIN_REGIONS, 40)).toBe(true);

    const cross = [cu({ id: 0, name: '居兰', style: 'kingdom', hearth: 1 }), cu({ id: 1, name: '淮', style: 'central', hearth: 2 })];
    expect(detectContacts(cross, [po(0, 1, 100)], ruledLog(10, 100, 400), 10, 400)).toEqual([]);
  });

  it('同一语感(含方言支)不算接触;统治结束以后接触语仍在', () => {
    const same = [cu({ id: 0, name: '居兰', style: 'kingdom', hearth: 1 }), cu({ id: 1, name: '北居兰', style: 'kingdom', hearth: 2, parent: 0, branch: '北' })];
    expect(detectContacts(same, [po(0, 1, 100)], ruledLog(10, 100, 400), 10, 400)).toEqual([]);

    const cultures = [cu({ id: 0, name: '居兰', style: 'kingdom', hearth: 1 }), cu({ id: 1, name: '奥列', style: 'imperial', hearth: 2 })];
    const es: { year: number; region: number; layer: Layer; value: number }[] = [];
    for (let r = 0; r < 10; r++) {
      es.push({ year: 0, region: r, layer: Layer.Culture, value: 0 });
      es.push({ year: 50, region: r, layer: Layer.Polity, value: 0 });
      es.push({ year: 400, region: r, layer: Layer.Polity, value: -1 });
    }
    const after = detectContacts(cultures, [po(0, 1, 50)], logOf(es.sort((a, b) => a.year - b.year || a.region - b.region)), 10, 800);
    expect(after[0]).toEqual({ culture: 0, style: 'imperial', year: 50 + CONTACT_RULE_YEARS });
    expect(contactAt(after, 0, 700)?.style).toBe('imperial');
  });

  it('同样的种子 + 民族两次检测、起名都一样', () => {
    const cultures = [cu({ id: 0, name: '居兰', style: 'slavic', hearth: 11 }), cu({ id: 1, name: '奥列', style: 'kingdom', hearth: 22 })];
    const polities = [po(0, 1, 80)];
    const log = ruledLog(12, 80, 400);
    const a = detectContacts(cultures, polities, log, 12, 400);
    const b = detectContacts(cultures, polities, log, 12, 400);
    expect(a).toEqual(b);
    const salt = contactSalt(cultures[0], 'kingdom');
    expect(contactSalt(cultures[0], 'kingdom')).toBe(salt);
    const ct = { style: 'kingdom', salt };
    expect(placeNames('slavic', ct).names).toEqual(placeNames('slavic', ct).names);
    expect(personNames('slavic', ct).all).toEqual(personNames('slavic', ct).all);
    expect(placeNames('central', { style: 'xianxia', salt }).names).toEqual(placeNames('central', { style: 'xianxia', salt }).names);
  });
});

describe('接触语的起名', () => {
  it('接触年以前用底层或方言;这以后才走接触语', () => {
    const cu0 = cu({ id: 0, name: '居兰', style: 'kingdom', hearth: 1 });
    const contacts: CultureContact[] = [{ culture: 0, style: 'imperial', year: 400 }];
    expect(namingContact(cu0, contacts, 399)).toBeUndefined();
    const after = namingContact(cu0, contacts, 400, true);
    expect(after).toEqual({ style: 'imperial', salt: contactSalt(cu0, 'imperial'), official: true });
    const before = createNamer(7, 'kingdom').keyed('region', 42)().zh;
    const still = createNamer(7, 'kingdom', undefined, undefined).keyed('region', 42)().zh;
    expect(still).toBe(before);
  });

  it('西幻、东方:父族和接触语听得出是混成的一门语言;国号比州名更偏上层', () => {
    const pairs: Array<[string, string]> = [
      ['kingdom', 'imperial'],
      ['slavic', 'nordic'],
      ['desert', 'persian'],
      ['central', 'xianxia'],
      ['yamato', 'haedong'],
    ];
    for (const [sub, sup] of pairs) {
      const salt = 0x51edbeef;
      const parent = placeNames(sub);
      const mixed = placeNames(sub, { style: sup, salt });
      const official = placeNames(sub, { style: sup, salt, official: true });
      expect(mixed.namer.style.id, `${sub}+${sup}`).toBe(sub);
      expect(mixed.namer.style.family).toBe(parent.namer.style.family);
      const d = differ(parent.names, mixed.names);
      expect(d, `${sub}+${sup} places should mix (${d}/${parent.names.length})`).toBeGreaterThanOrEqual(Math.ceil(parent.names.length * 0.35));
      const regions = mixed.byKind.region;
      const states = official.byKind.state;
      const parentR = parent.byKind.region;
      const parentS = parent.byKind.state;
      // 国号改走官方比例以后,和纯底层国号的差别不应小于日常州名和底层州名的差别太多;至少两边都混了
      expect(differ(states, parentS), `${sub}+${sup} official states`).toBeGreaterThanOrEqual(1);
      expect(differ(regions, parentR), `${sub}+${sup} regions`).toBeGreaterThanOrEqual(1);
      if (parent.namer.style.family === 'western') {
        expect(createNamer(7, sub, undefined, { style: sup, salt }).keyed('city', 42)().latin).toBeTruthy();
      } else {
        const c = createNamer(7, sub, undefined, { style: sup, salt }).keyed('city', 42)();
        expect(c.latin).toBeUndefined();
        expect(c.zh).toMatch(/[一-鿿]/);
      }
      const parentPe = personNames(sub);
      const mixedPe = personNames(sub, { style: sup, salt });
      expect(mixedPe.namer.style).toBe(sub);
      expect(mixedPe.namer.family).toBe(parentPe.namer.family);
      expect(mixedPe.namer.surnamed).toBe(parentPe.namer.surnamed);
      const pd = differ(parentPe.all, mixedPe.all);
      expect(pd, `${sub}+${sup} people should mix (${pd}/${parentPe.all.length})`).toBeGreaterThanOrEqual(Math.ceil(parentPe.all.length * 0.3));
    }
  });

  it('做接触语不会改掉纯底层词库(底层起名和原来一样)', () => {
    const salt = 99;
    const before = placeNames('kingdom').names;
    placeNames('kingdom', { style: 'imperial', salt });
    personNames('kingdom', { style: 'imperial', salt });
    expect(placeNames('kingdom').names).toEqual(before);
    const pb = personNames('central').all;
    personNames('central', { style: 'xianxia', salt });
    expect(personNames('central').all).toEqual(pb);
  });
});

/**
 * 神权作为单独一种政体(GENERATOR_VERSION 68):
 * 和君主、共和、军政府并列;教职称号按语感;按教职终身继任;国教既盛时可立、日后可废或复辟。
 */
import { describe, expect, it } from 'vitest';
import type { Civ } from '../src/gen/civ';
import { REFORM_LAICIZE, REFORM_THEOCRACY } from '../src/gen/civ/councilRules';
import { lineageAt, opensSeg, regimeAt, royalSeg, titleSeg, type Regime } from '../src/gen/civ/regime';
import { OFFICIAL_KNOBS } from '../src/gen/civ/engine/knobs';
import { RULERS_KNOBS, reignBook, type ReignPolity } from '../src/gen/civ/rulers';
import { formDims, formName } from '../src/gen/civ/story/polityForm';
import { clericTitle, isConsul, isTheocrat, officeWord } from '../src/gen/civ/story/peopleText';
import type { Annal, Person, Polity } from '../src/gen/civ/types';

const regimes: Regime[] = ['crown', 'republic', 'junta', 'theocracy'];

function culture(style: string, id = 0) {
  return { id, name: `C${id}`, style, kind: 'river' as const, hearth: 0, born: 0, expansionism: 0, color: [0, 0, 0] as [number, number, number] };
}

function polity(o: Partial<Polity> & { regime?: Polity['dynasties'] extends (infer D)[] | undefined ? D extends { regime?: infer R } ? R : never : never } = {}): Polity {
  const founded = o.founded ?? 100;
  const regime = 'regime' in o ? o.regime : undefined;
  const dynasties = o.dynasties ?? [
    { year: founded, name: '大昌', seat: 0 },
    ...(regime ? [{ year: 1400, name: '', seat: 0, regime }] : []),
  ];
  return {
    id: o.id ?? 0,
    name: o.name ?? '大昌',
    culture: o.culture ?? 0,
    capital: 0,
    founded,
    kind: 'river',
    expansionism: 0,
    color: [0, 0, 0],
    lineage: o.lineage ?? 'realm',
    eastern: o.eastern ?? true,
    dynasties,
    ...o,
  };
}

function civOf(p: Polity, style = 'central'): Civ {
  return { polities: [p], cultures: [culture(style)], people: [], annals: [] } as unknown as Civ;
}

function ruler(p: Polity, dynasty = 1): Person {
  return { id: 0, role: 'ruler', polity: p.id, name: '李昭', born: 1360, from: 1400, dynasty };
}

describe('神权政体', () => {
  it('是第四种 Regime,titleSeg 像军政府那样沿用前一段国号', () => {
    expect(regimes).toContain('theocracy');
    const p = polity({ regime: 'theocracy' });
    expect(regimeAt(p, 1200)).toBe('crown');
    expect(regimeAt(p, 1400)).toBe('theocracy');
    expect(lineageAt(p, 1400)).toBe('republic');
    expect(royalSeg(p, 1)).toBe(false);
    expect(titleSeg(p, 1)).toBe(0);
    expect(opensSeg({ kind: 'reform', a: 0, year: 1400, n: REFORM_THEOCRACY } as Annal)).toBe(true);
    expect(opensSeg({ kind: 'reform', a: 0, year: 1500, n: REFORM_LAICIZE } as Annal)).toBe(true);
  });

  it('称号按语感:中原、仙侠、边塞、海东为国师,西土帝制、王国、斯拉夫为教宗,其余为大祭司', () => {
    expect(clericTitle('central')).toBe('国师');
    expect(clericTitle('xianxia')).toBe('国师');
    expect(clericTitle('frontier')).toBe('国师');
    expect(clericTitle('haedong')).toBe('国师');
    expect(clericTitle('imperial')).toBe('教宗');
    expect(clericTitle('kingdom')).toBe('教宗');
    expect(clericTitle('slavic')).toBe('教宗');
    expect(clericTitle('yamato')).toBe('大祭司');
    expect(clericTitle('indic')).toBe('大祭司');
    expect(clericTitle('persian')).toBe('大祭司');
    expect(clericTitle('nusantara')).toBe('大祭司');
    expect(clericTitle('sahel')).toBe('大祭司');
    const east = polity({ regime: 'theocracy', culture: 0 });
    const civ = civOf(east, 'central');
    civ.people = [ruler(east)];
    expect(isTheocrat(civ, civ.people[0])).toBe(true);
    expect(isConsul(civ, civ.people[0])).toBe(false);
    expect(officeWord(civ, east, 1500)).toBe('国师');
    const west = polity({ id: 0, regime: 'theocracy', culture: 0, eastern: false });
    const w = civOf(west, 'imperial');
    expect(officeWord(w, west, 1500)).toBe('教宗');
  });

  it('神权国的政体名是神权国,继任按推举,不是短任期', () => {
    const facts = { lineage: 'realm' as const, tier: 2, tax: 1, army: 0, office: 0, fief: false, regions: 12, lords: 0, regime: 'theocracy' as const, reformed: true, charter: 1, franchise: 0 };
    expect(formDims(facts).succession).toBe(2);
    expect(formName(facts)).toBe('神权国');
  });

  it('教职终身继任,在位比共和执政的任期长', () => {
    const { TERM } = OFFICIAL_KNOBS.get(RULERS_KNOBS);
    const base = { founded: 100, kind: 'river' as const, lineage: 'realm' as const };
    const republic: ReignPolity = {
      ...base,
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 1000, name: '', seat: 0, regime: 'republic' },
      ],
    };
    const theocracy: ReignPolity = {
      ...base,
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 1000, name: '', seat: 0, regime: 'theocracy' },
      ],
    };
    const a = reignBook(OFFICIAL_KNOBS, 1, 1, republic, 1800);
    const b = reignBook(OFFICIAL_KNOBS, 1, 1, theocracy, 1800);
    const lens = (book: ReturnType<typeof reignBook>, d: number) => book.filter((r) => r.dynasty === d).map((r) => r.natural - r.from);
    const rep = lens(a, 1);
    const theo = lens(b, 1);
    expect(rep.length).toBeGreaterThan(0);
    expect(theo.length).toBeGreaterThan(0);
    expect(Math.max(...rep)).toBeLessThanOrEqual(TERM[1] + 1e-6);
    expect(Math.max(...theo)).toBeGreaterThan(TERM[1]);
    expect(theo.length).toBeLessThan(rep.length);
  });
});


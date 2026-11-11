/**
 * 世界概览人物页「君主 / 执政」档的名字(src/ui/WorldOverviewPeople.tsx 的 rulersTabName):
 * 按那年的政体,不按立国时的一系。君主国后来改成共和的写"执政";神权按语感写"国师" / "教宗" / "大祭司";
 * 全部国家那年有君主国也有共和国,写"君主、执政";有神权国的一并写上。
 */
import { describe, expect, it } from 'vitest';
import type { Civ, Polity } from '../src/gen/civ/types';
import { rulersTabName, rulersTabTitle } from '../src/ui/WorldOverviewPeople';

function p(
  id: number,
  o: {
    lineage?: Polity['lineage'];
    founded?: number;
    ended?: number;
    culture?: number;
    dynasties?: Polity['dynasties'];
  } = {},
): Polity {
  return {
    id,
    name: `P${id}`,
    culture: o.culture ?? 0,
    capital: 0,
    founded: o.founded ?? 100,
    kind: 'river',
    expansionism: 0,
    color: [0, 0, 0],
    lineage: o.lineage ?? 'realm',
    ended: o.ended,
    dynasties: o.dynasties ?? [{ year: o.founded ?? 100, name: '', seat: 0 }],
  };
}

function civ(ps: Polity[], endYear = 3000, styles: string[] = ['central']): Pick<Civ, 'polities' | 'endYear' | 'cultures'> {
  const polities: Polity[] = [];
  for (const x of ps) polities[x.id] = x;
  const cultures = styles.map((style, id) => ({ id, name: `C${id}`, style, kind: 'river' as const, hearth: 0, born: 0, expansionism: 0, color: [0, 0, 0] as [number, number, number] }));
  return { polities, endYear, cultures: cultures as Civ['cultures'] };
}

describe('概览人物页的君主档名', () => {
  it('只看一国:按那年的政体,不按立国时的一系', () => {
    const crown = p(0);
    expect(rulersTabName(civ([crown]), 0, 1500)).toBe('君主');
    expect(rulersTabTitle('君主')).toBe('历代君主,按朝代分组');

    const sea = p(1, { lineage: 'republic' });
    expect(rulersTabName(civ([sea]), 1, 1500)).toBe('执政');
    expect(rulersTabTitle('执政')).toBe('历任执政,按朝代分组');

    const later = p(2, {
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 1200, name: '', seat: 0, regime: 'republic' },
      ],
    });
    expect(rulersTabName(civ([later]), 2, 1100)).toBe('君主');
    expect(rulersTabName(civ([later]), 2, 1500)).toBe('执政');

    const junta = p(3, {
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 800, name: '', seat: 0, regime: 'junta' },
      ],
    });
    expect(rulersTabName(civ([junta]), 3, 900)).toBe('执政');

    const restored = p(4, {
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 800, name: '', seat: 0, regime: 'republic' },
        { year: 1100, name: '', seat: 0 },
      ],
    });
    expect(rulersTabName(civ([restored]), 4, 900)).toBe('执政');
    expect(rulersTabName(civ([restored]), 4, 1200)).toBe('君主');

    // 已亡:按亡国前那年
    const ended = p(5, {
      ended: 1300,
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 1200, name: '', seat: 0, regime: 'republic' },
      ],
    });
    expect(rulersTabName(civ([ended]), 5, 2000)).toBe('执政');
  });

  it('全部国家:那年还在的全是共和国写"执政",有君主国也有共和国写"君主、执政"', () => {
    const a = p(0);
    const b = p(1, { lineage: 'republic' });
    const c = p(2, {
      dynasties: [
        { year: 100, name: '', seat: 0 },
        { year: 1400, name: '', seat: 0, regime: 'republic' },
      ],
    });
    expect(rulersTabName(civ([a, p(3, { lineage: 'khanate' })]), null, 1500)).toBe('君主');
    expect(rulersTabName(civ([b, p(4, { lineage: 'republic', founded: 200 })]), null, 1500)).toBe('执政');
    expect(rulersTabName(civ([a, b]), null, 1500)).toBe('君主、执政');
    expect(rulersTabTitle('君主、执政')).toBe('历代君主、执政,按朝代分组');
    // 后来才改成共和的,改之前仍算君主国
    expect(rulersTabName(civ([a, c]), null, 1300)).toBe('君主');
    expect(rulersTabName(civ([a, c]), null, 1500)).toBe('君主、执政');
    // 已亡的共和国不进"那年还在"的账
    const dead = p(6, { lineage: 'republic', founded: 100, ended: 800 });
    expect(rulersTabName(civ([a, dead]), null, 1500)).toBe('君主');
  });

  it('神权按那年的语感写国师、教宗或大祭司,全部国家时和君主、执政并列', () => {
    const theo = (id: number, culture: number) =>
      p(id, { culture, dynasties: [{ year: 100, name: '', seat: 0 }, { year: 1400, name: '', seat: 0, regime: 'theocracy' }] });
    const east = theo(6, 0);
    east.culture = 0;
    const west = theo(7, 1);
    west.culture = 1;
    const styles = ['central', 'imperial'];
    expect(rulersTabName(civ([east], 3000, styles), 6, 1200)).toBe('君主');
    expect(rulersTabName(civ([east], 3000, styles), 6, 1500)).toBe('国师');
    expect(rulersTabTitle('国师')).toBe('历任国师,按朝代分组');
    expect(rulersTabName(civ([west], 3000, styles), 7, 1500)).toBe('教宗');
    expect(rulersTabTitle('教宗')).toBe('历任教宗,按朝代分组');
    const crown = p(8, { lineage: 'realm' });
    expect(rulersTabName(civ([crown, east], 3000, styles), null, 1500)).toBe('君主、国师');
    expect(rulersTabTitle('君主、国师')).toBe('历代君主、国师,按朝代分组');
    const sea = p(9, { lineage: 'republic', founded: 200 });
    expect(rulersTabName(civ([crown, sea, east], 3000, styles), null, 1500)).toBe('君主、执政、国师');
  });
});

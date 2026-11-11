/**
 * 外交UI数据提取测试
 */
import { describe, expect, it } from 'vitest';
import { generateWorld, DEFAULT_PARAMS } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import type { Annal, Civ, Polity } from '../src/gen/civ/types';
import { extractDiplomacy, groupVassalages } from '../src/ui/WorldOverviewDiplomacy';

function polity(id: number, founded = 0, ended?: number): Polity {
  return { id, founded, ended, capital: 0, names: [{ year: founded, title: `P${id}` }] } as any;
}

function annal(partial: Partial<Annal> & Pick<Annal, 'year' | 'kind' | 'a' | 'b'>): Annal {
  return {
    region: -1,
    settlement: -1,
    war: -1,
    ...partial,
  } as Annal;
}

function mockCiv(annals: Annal[], polities: Polity[]): Civ {
  return {
    seed: 1,
    viable: true,
    endYear: 3000,
    polities,
    settlements: [],
    places: [],
    annals,
  } as any;
}

describe('extractDiplomacy', () => {
  it('自立(defect)后不再显示宗藩；顺序对齐 relationsAt', () => {
    const civ = mockCiv(
      [
        annal({ year: 100, kind: 'submit', a: 1, b: 0 }), // 1 臣服于 0
        annal({ year: 150, kind: 'defect', a: 1, b: 0 }), // 1 自立
      ],
      [polity(0), polity(1)],
    );
    expect(extractDiplomacy(civ, 120).vassalages).toEqual([{ lord: 0, vassal: 1, since: 100 }]);
    expect(extractDiplomacy(civ, 160).vassalages).toEqual([]);
  });

  it('结→断→再结：再结盟后应显示最新盟约', () => {
    const civ = mockCiv(
      [
        annal({ year: 100, kind: 'alliance', a: 0, b: 1, foe: -1 }),
        annal({ year: 150, kind: 'unally', a: 0, b: 1 }),
        annal({ year: 200, kind: 'alliance', a: 0, b: 1, foe: 2 }),
      ],
      [polity(0), polity(1), polity(2)],
    );
    expect(extractDiplomacy(civ, 120).alliances).toEqual([{ a: 0, b: 1, since: 100, foe: -1 }]);
    expect(extractDiplomacy(civ, 160).alliances).toEqual([]);
    expect(extractDiplomacy(civ, 210).alliances).toEqual([{ a: 0, b: 1, since: 200, foe: 2 }]);
  });
});

  it('议和(peace)后战争不再显示', () => {
    const civ = mockCiv(
      [
        annal({ year: 100, kind: 'war', a: 0, b: 1, war: 7 }),
        annal({ year: 120, kind: 'peace', a: 0, b: 1, war: 7 }),
      ],
      [polity(0), polity(1)],
    );
    expect(extractDiplomacy(civ, 110).wars).toEqual([{ id: 7, parties: [0, 1], start: 100 }]);
    expect(extractDiplomacy(civ, 130).wars).toEqual([]);
  });

  it('亡国(fall)后对应战争不再显示', () => {
    const civ = mockCiv(
      [
        annal({ year: 100, kind: 'war', a: 0, b: 1, war: 9 }),
        annal({ year: 140, kind: 'fall', a: 1, b: 0, war: 9 }),
      ],
      [polity(0), polity(1, 0, 140)],
    );
    expect(extractDiplomacy(civ, 110).wars.map((w) => w.id)).toEqual([9]);
    expect(extractDiplomacy(civ, 150).wars).toEqual([]);
  });

describe('外交页面数据提取（生成世界冒烟）', () => {
  it('应该正确提取联盟关系', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
    const civ = generateCiv(w);
    const alliances = civ.annals.filter((e) => e.kind === 'alliance');
    expect(alliances.length).toBeGreaterThan(0);
    for (const a of alliances) {
      expect(a.a).toBeGreaterThanOrEqual(0);
      expect(a.b).toBeGreaterThanOrEqual(0);
      expect(a.a).not.toBe(a.b);
    }
  });

  it('应该区分结盟和断盟', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const civ = generateCiv(w);
    const alliances = civ.annals.filter((e) => e.kind === 'alliance');
    const unalliances = civ.annals.filter((e) => e.kind === 'unally');
    expect(alliances.length).toBeGreaterThan(0);
    if (unalliances.length > 0) {
      const firstUnally = unalliances[0];
      const matchingAlliance = alliances.find(
        (a) =>
          (a.a === firstUnally.a && a.b === firstUnally.b) || (a.a === firstUnally.b && a.b === firstUnally.a),
      );
      if (matchingAlliance) {
        expect(firstUnally.year).toBeGreaterThanOrEqual(matchingAlliance.year);
      }
    }
  });

  it('应该正确提取宗藩关系', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
    const civ = generateCiv(w);
    const submissions = civ.annals.filter((e) => e.kind === 'submit');
    expect(submissions.length).toBeGreaterThan(0);
    for (const s of submissions) {
      expect(s.a).toBeGreaterThanOrEqual(0);
      expect(s.b).toBeGreaterThanOrEqual(0);
      expect(s.a).not.toBe(s.b);
    }
  });

  it('应该在特定年份正确过滤外交关系', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
    const civ = generateCiv(w);
    const midYear = Math.floor(civ.endYear / 2);
    const alliancesBefore = civ.annals.filter((e) => e.kind === 'alliance' && e.year <= midYear);
    const warsBefore = civ.annals.filter((e) => e.kind === 'war' && e.year <= midYear);
    expect(alliancesBefore.length + warsBefore.length).toBeGreaterThan(0);
  });
});

describe('宗藩按宗主分组', () => {
  it('同一宗主的藩属收进一张,先出现的宗主在前,藩属保持原来的顺序', () => {
    const rows = [
      { lord: 0, vassal: 1, since: 100 },
      { lord: 2, vassal: 3, since: 110 },
      { lord: 0, vassal: 4, since: 120 },
    ];
    expect(groupVassalages(rows)).toEqual([
      {
        lord: 0,
        vassals: [
          { lord: 0, vassal: 1, since: 100 },
          { lord: 0, vassal: 4, since: 120 },
        ],
      },
      { lord: 2, vassals: [{ lord: 2, vassal: 3, since: 110 }] },
    ]);
  });
});

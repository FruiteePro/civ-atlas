/**
 * 人物卡片上的民族(gen/civ/story/peopleInfo.ts 的 inferredCulture):推演里人物没有民族字段,按籍贯城或所在国推断。
 * 有籍贯就用那座城建城时的民族,否则用他所在国的主体民族;名字不能用来证明他是哪一族。
 */
import { describe, expect, it } from 'vitest';
import type { Civ, Culture, Person, Polity, Settlement } from '../src/gen/civ/types';
import { inferredCulture } from '../src/gen/civ/story/peopleInfo';
import { cultureLabel } from '../src/gen/civ/story/display';

function folk(id: number, name: string): Culture {
  return { id, name, style: 'zhongyuan', kind: 'river', hearth: 0, born: 0, expansionism: 0, color: [0, 0, 0] };
}

function city(id: number, culture: number): Settlement {
  return { id, cell: 0, region: 0, culture, name: `城${id}`, founded: 0, capacity: 1, growth: 0, port: false };
}

function state(id: number, culture: number): Polity {
  return { id, name: `国${id}`, culture, capital: 0, founded: 0, kind: 'river', expansionism: 0, color: [0, 0, 0] };
}

function civOf(cultures: Culture[], settlements: Settlement[], polities: Polity[]): Pick<Civ, 'cultures' | 'settlements' | 'polities'> {
  return { cultures, settlements, polities };
}

describe('人物卡片推断民族', () => {
  const a = folk(0, '戈拉');
  const b = folk(1, '霜澜');
  const civ = civOf([a, b], [city(0, 1)], [state(0, 0)]);

  it('有籍贯城就用那座城的民族,否则用所在国的主体民族', () => {
    expect(inferredCulture(civ, { polity: 0, home: 0 })).toBe(1);
    expect(cultureLabel(civ.cultures[inferredCulture(civ, { polity: 0, home: 0 })!])).toBe('霜澜族');
    expect(inferredCulture(civ, { polity: 0 })).toBe(0);
    expect(cultureLabel(civ.cultures[inferredCulture(civ, { polity: 0 })!])).toBe('戈拉族');
  });

  it('籍贯城没有或不在名单里,退到所在国;国家和民族都对不上则没有', () => {
    expect(inferredCulture(civ, { polity: 0, home: 9 })).toBe(0);
    expect(inferredCulture(civOf([a, b], [city(0, 9)], [state(0, 0)]), { polity: 0, home: 0 })).toBe(0);
    expect(inferredCulture(civOf([a, b], [], [state(0, 9)]), { polity: 0 })).toBe(null);
    expect(inferredCulture(civOf([a, b], [], []), { polity: 0 } as Pick<Person, 'home' | 'polity'>)).toBe(null);
  });
});

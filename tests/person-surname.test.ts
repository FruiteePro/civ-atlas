/**
 * 人物卡片上的姓(peopleInfo.ts 的 personSurname、surname.ts 的 displaySurname):
 * 只有中原、仙侠、和风、海东这种带姓的语感才从全名拆出来;西幻、边塞、山海故意只有名,不另造姓。
 */
import { describe, expect, it } from 'vitest';
import type { Civ, Culture, Person, Polity } from '../src/gen/civ/types';
import { personSurname } from '../src/gen/civ/story/peopleInfo';
import { displaySurname, splitSurname } from '../src/gen/civ/surname';
import { styleSurnamed } from '../src/gen/names/persons';

function folk(id: number, style: string): Culture {
  return { id, name: '族', style, kind: 'river', hearth: 0, born: 0, expansionism: 0, color: [0, 0, 0] };
}

function state(id: number, culture: number): Polity {
  return { id, name: '国', culture, capital: 0, founded: 0, kind: 'river', expansionism: 0, color: [0, 0, 0] };
}

function civOf(style: string): Pick<Civ, 'polities' | 'cultures'> {
  return { cultures: [folk(0, style)], polities: [state(0, 0)] };
}

function who(name: string, polity = 0): Pick<Person, 'name' | 'polity'> {
  return { name, polity };
}

describe('人物卡片的姓', () => {
  it('带姓的语感才从全名拆姓,西幻、边塞、山海不写', () => {
    expect(styleSurnamed('central') && styleSurnamed('xianxia') && styleSurnamed('yamato') && styleSurnamed('haedong')).toBe(true);
    expect(styleSurnamed('frontier') || styleSurnamed('mythic') || styleSurnamed('kingdom') || styleSurnamed('indic')).toBe(false);

    expect(personSurname(civOf('central'), who('李昭'))).toBe('李');
    expect(personSurname(civOf('central'), who('司马昭'))).toBe('司马');
    expect(personSurname(civOf('xianxia'), who('南宫尘'))).toBe('南宫');
    expect(personSurname(civOf('yamato'), who('青木健'))).toBe('青木');
    expect(personSurname(civOf('haedong'), who('朴正浩'))).toBe('朴');

    expect(personSurname(civOf('kingdom'), who('阿尔德里克'))).toBe(null);
    expect(personSurname(civOf('frontier'), who('咄苾'))).toBe(null);
    expect(personSurname(civOf('mythic'), who('少昊'))).toBe(null);
    expect(personSurname(civOf('central'), who(''))).toBe(null);
  });

  it('界面拆姓能认出和风复姓;推演用的 splitSurname 不改,免得改了历史', () => {
    expect(displaySurname('青木健')).toBe('青木');
    expect(splitSurname('青木健')).toBe('青');
    expect(displaySurname('李昭')).toBe('李');
    expect(displaySurname('司马昭')).toBe('司马');
  });
});

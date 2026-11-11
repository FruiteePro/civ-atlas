/**
 * 各语感的教名、民间信仰后缀(GENERATOR_VERSION 67,religionNames.ts):
 * 每一种语感(含和风、海东、天竺、波斯、南洋、萨赫勒)都有自己的词干和民间通名,不与现实教名撞车。
 */
import { describe, expect, it } from 'vitest';
import { NAME_STYLES } from '../src/gen/names';
import { FAITH_WORDS, faithTail, faithWords, folkSuffix, sectTail } from '../src/gen/civ/religionNames';

const NEW_STYLES = ['yamato', 'haedong', 'indic', 'persian', 'nusantara', 'sahel'] as const;
const BANNED = ['佛', '基督', '耶稣', '安拉', '真主', '释迦', '穆罕默德', '神道', '天照', '湿婆', '毗湿', '琐罗亚', '安拉'];

describe('各语感的教名用字', () => {
  it('每一种语感都有足够、互不重复的词干,通名是教宗道派之一', () => {
    for (const st of NAME_STYLES) {
      const w = faithWords(st.id, st.family === 'eastern');
      expect(w.stems.length, st.id).toBeGreaterThanOrEqual(8);
      expect(new Set(w.stems).size, st.id).toBe(w.stems.length);
      for (const s of w.stems) {
        expect(s.length, `${st.id} ${s}`).toBeGreaterThanOrEqual(2);
        for (const bad of BANNED) expect(s, `${st.id} ${s}`).not.toContain(bad);
      }
      expect(['教', '宗', '道', '派']).toContain(w.defaultTail);
      expect(['宗', '派']).toContain(w.sect);
    }
    expect(NAME_STYLES.every((s) => FAITH_WORDS[s.id])).toBe(true);
  });

  it('和风、海东、天竺、波斯、南洋、萨赫勒的词干和民间通名与中原、西幻默认不同', () => {
    const central = new Set(FAITH_WORDS.central.stems);
    const imperial = new Set(FAITH_WORDS.imperial.stems);
    const eastFolk = folkSuffix('central', true);
    const westFolk = folkSuffix('imperial', false);
    expect(eastFolk).toBe('祖灵');
    expect(westFolk).toBe('旧神');
    for (const id of NEW_STYLES) {
      const w = FAITH_WORDS[id];
      expect(w.stems.some((s) => !central.has(s) && !imperial.has(s)), id).toBe(true);
      expect(w.folk, id).not.toBe(eastFolk);
      expect(['教', '宗', '道', '派']).toContain(faithTail(id, '一神', id === 'yamato' || id === 'haedong'));
      expect(sectTail(id, id === 'yamato' || id === 'haedong')).toMatch(/^[宗派]$/);
    }
    expect(folkSuffix('yamato', true)).toBe('氏神');
    expect(folkSuffix('haedong', true)).toBe('巫祀');
    expect(folkSuffix('indic', false)).toBe('林神');
    expect(folkSuffix('persian', false)).toBe('火祀');
    expect(folkSuffix('nusantara', false)).toBe('岛灵');
    expect(folkSuffix('sahel', false)).toBe('社神');
  });
});

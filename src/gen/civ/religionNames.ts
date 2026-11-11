/**
 * 各语感的教名用字、民间信仰后缀、教派通名(religion.ts 起名用)。
 * 避开现实里有的教名、宗派名;用字不出地名生成器的字表(西幻走音译表里已有的写法)。
 * 不另做一层信仰系统,只把名字和说明写得跟语感的地名、人名一样厚。
 */
import type { FaithForm } from './types';

export interface StyleFaithWords {
  /** 大教名的词干(再加通名) */
  stems: readonly string[];
  /** 按类型的通名;没有的用 defaultTail */
  tails?: Partial<Record<FaithForm, string>>;
  defaultTail: string;
  /** 教派通名(某某东宗 / 东派) */
  sect: string;
  /** 民间信仰:族名 + 这一截 */
  folk: string;
}

/** 东方默认词干(中原;也作没单独表的东方语感的底子)。导出给字表单测 */
export const EAST_WORDS = ['玄晖', '澄元', '照冥', '衡一', '昭虚', '守素', '含光', '归穹', '青冥', '苍玄', '明渊', '澄澜'] as const;

const WEST_TAIL = { 修行: '宗', 哲理: '教', 一神: '教', 多神: '教', 二元: '教' } as const;
const EAST_TAIL = { 修行: '宗', 哲理: '道', 一神: '教', 多神: '教', 二元: '教' } as const;

export const FAITH_WORDS: Readonly<Record<string, StyleFaithWords>> = {
  central: { stems: EAST_WORDS, tails: EAST_TAIL, defaultTail: '教', sect: '宗', folk: '祖灵' },
  xianxia: {
    stems: ['紫霄', '星河', '玉霄', '栖霞', '凌霄', '碧落', '丹霞', '摘星', '听雪', '问月'],
    tails: EAST_TAIL,
    defaultTail: '教',
    sect: '宗',
    folk: '祖灵',
  },
  frontier: {
    stems: ['朔风', '苍狼', '白草', '孤烟', '长风', '烽火', '黄沙', '镇北', '寒沙', '狼烟'],
    tails: EAST_TAIL,
    defaultTail: '教',
    sect: '宗',
    folk: '祠祭',
  },
  mythic: {
    stems: ['玄墟', '归墟', '羽渊', '雷墟', '丹丘', '青台', '桂丘', '苍野', '玄丘', '玉山'],
    tails: EAST_TAIL,
    defaultTail: '教',
    sect: '宗',
    folk: '山灵',
  },
  yamato: {
    stems: ['青原', '松津', '白崎', '樱川', '枫原', '云鹤', '金崎', '高森', '梅津', '石原'],
    tails: { 修行: '宗', 哲理: '道', 一神: '宗', 多神: '宗', 二元: '道' },
    defaultTail: '宗',
    sect: '宗',
    folk: '氏神',
  },
  haedong: {
    stems: ['青丘', '松津', '云邑', '海原', '鹤岭', '白岳', '星川', '德山', '风泽', '龙原'],
    tails: EAST_TAIL,
    defaultTail: '教',
    sect: '宗',
    folk: '巫祀',
  },
  imperial: {
    stems: ['奥雷', '维斯', '卡皮', '卢佩', '弗拉', '塞维', '马尔', '奥斯'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '旧神',
  },
  kingdom: {
    stems: ['克拉', '奥斯', '贝内', '阿尔', '埃德', '加雷', '罗万', '埃尔'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '旧神',
  },
  nordic: {
    stems: ['哈尔', '斯卡', '维格', '弗罗', '西格', '安德', '乌尔', '贡纳'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '祖火',
  },
  slavic: {
    stems: ['斯维', '米拉', '扎里', '杜布', '别利', '格罗', '列卡', '白林'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '旧神',
  },
  hellenic: {
    stems: ['波利', '卡斯', '提尔', '伊奥', '米诺', '内莱', '劳尔', '阿尔'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '旧神',
  },
  desert: {
    stems: ['萨法', '扎希', '卡里', '巴迪', '萨赫', '纳吉', '艾恩', '绿洲'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '旧祀',
  },
  steppe: {
    stems: ['苏利', '奥伦', '阿格', '查甘', '萨尔', '莫林', '加尔', '苍穹'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '天祀',
  },
  elven: {
    stems: ['艾尔', '希尔', '伊斯', '米尔', '赛尔', '洛斯', '伊希', '星歌'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '林灵',
  },
  indic: {
    stems: ['维拉', '帕拉', '卡维', '拉维', '古那', '塔拉', '尼拉', '希拉', '洛卡', '帕德'],
    tails: { 修行: '宗', 哲理: '宗', 一神: '教', 多神: '教', 二元: '教' },
    defaultTail: '教',
    sect: '派',
    folk: '林神',
  },
  persian: {
    stems: ['罗什', '阿扎', '戈尔', '亚斯', '沙德', '胡尔', '法尔', '扎尔', '卡瓦'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '火祀',
  },
  nusantara: {
    stems: ['室利', '劳特', '西拉', '布兰', '萨里', '卡尤', '努沙', '穆提'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '岛灵',
  },
  sahel: {
    stems: ['库马', '苏拉', '法马', '巴拉', '塔马', '沃洛', '莫里', '达巴', '贾拉', '塞瓦'],
    tails: WEST_TAIL,
    defaultTail: '教',
    sect: '派',
    folk: '社神',
  },
};

/** 字表单测:所有语感的词干 */
export const FAITH_NAME_STEMS: readonly string[] = [...new Set(Object.values(FAITH_WORDS).flatMap((w) => [...w.stems]))];
/** 字表单测:教名、教派用到的通名 */
export const FAITH_NAME_TAILS: readonly string[] = ['教', '宗', '道', '派'];

export function faithWords(style: string, eastern: boolean): StyleFaithWords {
  return FAITH_WORDS[style] ?? (eastern ? FAITH_WORDS.central : { stems: FAITH_WORDS.imperial.stems, tails: WEST_TAIL, defaultTail: '教', sect: '派', folk: '旧神' });
}

export function folkSuffix(style: string, eastern = false): string {
  return faithWords(style, eastern).folk;
}

export function faithTail(style: string, form: FaithForm | undefined, eastern: boolean): string {
  const w = faithWords(style, eastern);
  return (form && w.tails?.[form]) || w.defaultTail;
}

export function sectTail(style: string, eastern: boolean): string {
  return faithWords(style, eastern).sect;
}

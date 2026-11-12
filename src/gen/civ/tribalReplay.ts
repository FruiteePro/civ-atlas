/**
 * 接着推时收服部落地带看的时代、信仰从哪来(polities.ts 的 tribalEra、tribalFaith):
 * development.ts、religion.ts 载入时登记"照 Civ 里存的历史给出"的那一份,resumePolities 重放"国家到达"的预约以前挂上。
 * 单独一个文件、不引别的模块:谁先载入都不会撞上还没定义的表
 */
import type { Civ, Year } from './types';
import type { FaithEra } from './religion';

export type TribalLookup = (r: number, y: Year) => number;

/** eras = 地形大事以前各段的州(信仰照历史重放时用,同 resumeReligion) */
export const tribalReplay: { era?: (civ: Civ) => TribalLookup; faith?: (civ: Civ, eras: readonly FaithEra[]) => TribalLookup } = {};

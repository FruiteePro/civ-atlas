/**
 * 接着推时收服部落地带看的时代、信仰从哪来(polities.ts 的 tribalEra、tribalFaith):
 * development.ts、religion.ts 载入时登记"照 Civ 里存的历史给出"的那一份,resumePolities 重放"国家到达"的预约以前挂上。
 * 单独一个文件、不引别的模块:谁先载入都不会撞上还没定义的表
 */
import type { Civ, Year } from './types';

export type TribalLookup = (r: number, y: Year) => number;

export const tribalReplay: { era?: (civ: Civ) => TribalLookup; faith?: (civ: Civ) => TribalLookup } = {};

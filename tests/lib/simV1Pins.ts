/**
 * 照接口第 1 版写的两个插件(厌战、宗教生效)在种子 1、2024 默认参数推 3000 年钉住的结果:
 * 直接跑(tests/sim-plugin-v1.test.ts)和打成插件包经 QuickJS 跑(tests/sim-plugin-examples.test.ts)都对它。
 * 改了官方推演(同一种子的历史变了)跟着变:PRINT_PINS=1 跑 sim-plugin-v1.test.ts,照打出来的换掉
 * (改进后的分裂把种子 7 的异教远战比例钉不住了,换成种子 1;2024 仍留着)
 */
import { createHash } from 'node:crypto';
import type { Civ } from '../../src/gen/civ';
import { packValue } from '../../src/gen/snapshot';

/** 推出来的历史的指纹:史事、归属、干预、插件写的编年史和状态 */
export function simDigest(civ: Civ): string {
  const x = packValue({ annals: civ.annals, polity: civ.polity, culture: civ.culture, interventions: civ.interventions ?? [], chronicle: civ.simChronicle ?? [], plugins: civ.simPlugins ?? [] });
  return createHash('sha256').update(x).digest('hex').slice(0, 16);
}

export const V1_SEEDS = [1, 2024] as const;
export type V1Seed = (typeof V1_SEEDS)[number];

export const V1_PINS: Record<V1Seed, { weariness: { digest: string } & Record<string, unknown>; faith: { digest: string } & Record<string, unknown> }> = {
  1: {
    weariness: { before: { wars: 35, meanYears: 4.81, long: 7 }, after: { wars: 23, meanYears: 3.56, long: 1 }, treaties: 8, digest: 'd6f4984f5a21620d' },
    faith: { before: { wars: 199, farWars: 21, pacts: 21, samePacts: 15 }, after: { wars: 241, farWars: 23, pacts: 30, samePacts: 22 }, declare: 0, ally: 2, digest: '0bae23a8dbe8053a' },
  },
  2024: {
    weariness: { before: { wars: 47, meanYears: 4.84, long: 1 }, after: { wars: 33, meanYears: 4.56, long: 2 }, treaties: 20, digest: '2ecacc67bac7beec' },
    faith: { before: { wars: 185, farWars: 20, pacts: 16, samePacts: 7 }, after: { wars: 156, farWars: 55, pacts: 12, samePacts: 4 }, declare: 2, ally: 3, digest: '71871361d7444559' },
  },
};

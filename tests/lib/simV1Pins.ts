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
    weariness: { before: { wars: 50, meanYears: 4.71, long: 7 }, after: { wars: 40, meanYears: 3.26, long: 1 }, treaties: 15, digest: '00e163be30eb1bcd' },
    faith: { before: { wars: 232, farWars: 11, pacts: 23, samePacts: 16 }, after: { wars: 270, farWars: 38, pacts: 29, samePacts: 25 }, declare: 0, ally: 0, digest: '706119bd91ac24b3' },
  },
  2024: {
    weariness: { before: { wars: 14, meanYears: 5.67, long: 1 }, after: { wars: 13, meanYears: 4.04, long: 1 }, treaties: 5, digest: 'f2a2eef0471beb1b' },
    faith: { before: { wars: 141, farWars: 32, pacts: 12, samePacts: 8 }, after: { wars: 214, farWars: 31, pacts: 16, samePacts: 10 }, declare: 0, ally: 1, digest: 'cde7a0770aad47e8' },
  },
};


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
    weariness: { before: { wars: 68, meanYears: 6.79, long: 16 }, after: { wars: 42, meanYears: 4.8, long: 4 }, treaties: 21, digest: 'f653e1e79b5a0f87' },
    faith: { before: { wars: 371, farWars: 61, pacts: 24, samePacts: 17 }, after: { wars: 436, farWars: 82, pacts: 28, samePacts: 22 }, declare: 0, ally: 5, digest: '5f13d13f8b7518d7' },
  },
  2024: {
    weariness: { before: { wars: 62, meanYears: 4.93, long: 9 }, after: { wars: 47, meanYears: 5.15, long: 7 }, treaties: 20, digest: '6f5daac89e7dcd5f' },
    faith: { before: { wars: 244, farWars: 85, pacts: 9, samePacts: 6 }, after: { wars: 195, farWars: 71, pacts: 11, samePacts: 11 }, declare: 0, ally: 9, digest: 'fe870bf67b4479b0' },
  },
};


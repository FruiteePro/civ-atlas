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
    weariness: { before: { wars: 72, meanYears: 6.11, long: 24 }, after: { wars: 46, meanYears: 4.39, long: 7 }, treaties: 19, digest: '445f69909d3b6b85' },
    faith: { before: { wars: 311, farWars: 41, pacts: 25, samePacts: 18 }, after: { wars: 253, farWars: 34, pacts: 30, samePacts: 18 }, declare: 0, ally: 5, digest: '0f6754967d8d6f72' },
  },
  2024: {
    weariness: { before: { wars: 16, meanYears: 4.48, long: 2 }, after: { wars: 17, meanYears: 3.54, long: 1 }, treaties: 7, digest: '7df76acc3ae14fab' },
    faith: { before: { wars: 174, farWars: 42, pacts: 11, samePacts: 5 }, after: { wars: 213, farWars: 27, pacts: 34, samePacts: 25 }, declare: 0, ally: 9, digest: '88d02ddd9a818648' },
  },
};

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
    weariness: { before: { wars: 56, meanYears: 6.91, long: 22 }, after: { wars: 32, meanYears: 4.18, long: 2 }, treaties: 15, digest: '8c3095752392a7b4' },
    faith: { before: { wars: 205, farWars: 39, pacts: 5, samePacts: 1 }, after: { wars: 170, farWars: 55, pacts: 20, samePacts: 8 }, declare: 0, ally: 8, digest: 'd2cfdbd1d6a6e4a0' },
  },
  2024: {
    weariness: { before: { wars: 22, meanYears: 6.96, long: 8 }, after: { wars: 16, meanYears: 2.89, long: 0 }, treaties: 5, digest: '00ae33a515746734' },
    faith: { before: { wars: 157, farWars: 68, pacts: 3, samePacts: 1 }, after: { wars: 120, farWars: 52, pacts: 5, samePacts: 3 }, declare: 0, ally: 1, digest: 'd1cd0e492842a43b' },
  },
};

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
    weariness: { before: { wars: 62, meanYears: 7.04, long: 22 }, after: { wars: 48, meanYears: 4.72, long: 2 }, treaties: 28, digest: '6f02ceea4a5fdaf4' },
    faith: { before: { wars: 316, farWars: 51, pacts: 19, samePacts: 12 }, after: { wars: 290, farWars: 45, pacts: 19, samePacts: 15 }, declare: 0, ally: 3, digest: 'b95f251da8176e3f' },
  },
  2024: {
    weariness: { before: { wars: 80, meanYears: 5.75, long: 17 }, after: { wars: 52, meanYears: 4.78, long: 4 }, treaties: 21, digest: 'd36641ad83d8b4db' },
    faith: { before: { wars: 190, farWars: 63, pacts: 1, samePacts: 0 }, after: { wars: 228, farWars: 72, pacts: 25, samePacts: 21 }, declare: 0, ally: 17, digest: 'f6857f0c8a174c7f' },
  },
};


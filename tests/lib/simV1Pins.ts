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
    weariness: { before: { wars: 93, meanYears: 5.1, long: 16 }, after: { wars: 35, meanYears: 4.02, long: 4 }, treaties: 15, digest: 'bc4fd5c2cd8c1b4d' },
    faith: { before: { wars: 211, farWars: 42, pacts: 17, samePacts: 11 }, after: { wars: 208, farWars: 14, pacts: 21, samePacts: 20 }, declare: 0, ally: 3, digest: 'baf47004e9696e4d' },
  },
  2024: {
    weariness: { before: { wars: 18, meanYears: 4.42, long: 1 }, after: { wars: 14, meanYears: 4.02, long: 0 }, treaties: 6, digest: 'f4374aa1e545905d' },
    faith: { before: { wars: 136, farWars: 24, pacts: 7, samePacts: 7 }, after: { wars: 201, farWars: 44, pacts: 15, samePacts: 7 }, declare: 0, ally: 4, digest: '20fbd6a0ed6cec5d' },
  },
};


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
    weariness: { before: { wars: 118, meanYears: 6.1, long: 27 }, after: { wars: 46, meanYears: 5.44, long: 6 }, treaties: 33, digest: '1727fad38fe593b6' },
    faith: { before: { wars: 370, farWars: 74, pacts: 40, samePacts: 28 }, after: { wars: 297, farWars: 54, pacts: 36, samePacts: 27 }, declare: 0, ally: 5, digest: 'f523ed500d761556' },
  },
  2024: {
    weariness: { before: { wars: 69, meanYears: 5.81, long: 12 }, after: { wars: 54, meanYears: 4.23, long: 4 }, treaties: 17, digest: '1d9296453f4b671b' },
    faith: { before: { wars: 248, farWars: 77, pacts: 18, samePacts: 4 }, after: { wars: 197, farWars: 49, pacts: 5, samePacts: 3 }, declare: 4, ally: 1, digest: 'c0dcb3484d6cfe90' },
  },
};


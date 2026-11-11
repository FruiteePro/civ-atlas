/**
 * 信仰影响同化、邦交、开战意愿(GENERATOR_VERSION 70):同教相吸、异教相斥,神权在这条轴上更强。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld, type World } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import { OFFICIAL_KNOBS } from '../src/gen/civ/engine/knobs';
import { ASSIMILATION_KNOBS } from '../src/gen/civ/assimilation';
import { DIPLOMACY_KNOBS } from '../src/gen/civ/diplomacy';
import { WARS_KNOBS } from '../src/gen/civ/wars';
import { faithAlignMul, faithGap, faithOpposeMul, faithScale, polityFaith, polityFaithGap } from '../src/gen/civ/faithRules';
import type { Polity } from '../src/gen/civ/types';
import type { PolityModel } from '../src/gen/civ/polities';
import { stateFaithAt } from '../src/gen/civ/religion';

const A = OFFICIAL_KNOBS.get(ASSIMILATION_KNOBS);
const D = OFFICIAL_KNOBS.get(DIPLOMACY_KNOBS);
const W = OFFICIAL_KNOBS.get(WARS_KNOBS);

function mockPm(opts?: { gap?: number; state?: Record<number, number>; region?: Record<number, number> }): PolityModel {
  const state = opts?.state ?? {};
  const region = opts?.region ?? {};
  const gap = opts?.gap;
  return {
    settlements: [{ region: 0 }, { region: 1 }],
    stateFaith: (p: number) => state[p] ?? -1,
    faithAt: (r: number) => region[r] ?? -1,
    faithGap: (f: number, g: number) => {
      if (gap !== undefined) return f === g ? 0 : gap;
      if (f < 0 || g < 0) return -1;
      if (f === g) return 0;
      // 偶数为同一大教的不同派:0/1, 2/3…
      return Math.floor(f / 2) === Math.floor(g / 2) ? 0.5 : 1;
    },
  } as unknown as PolityModel;
}

function crown(id: number): Polity {
  return { id, capital: id, lineage: 'realm' } as Polity;
}

function theo(id: number): Polity {
  return { id, capital: id, lineage: 'realm', dynasties: [{ year: 0, regime: 'theocracy' }] } as Polity;
}

describe('信仰加权', () => {
  it('不明或还没有信仰时倍数是 1;同教相吸、异教相斥,教派算一半', () => {
    expect(faithAlignMul(-1, 0.2, 0.3, 1)).toBe(1);
    expect(faithOpposeMul(-1, 0.2, 0.3, 1)).toBe(1);
    expect(faithAlignMul(0, 0.2, 0.3, 1)).toBeCloseTo(1.2, 12);
    expect(faithAlignMul(1, 0.2, 0.3, 1)).toBeCloseTo(0.7, 12);
    expect(faithAlignMul(0.5, 0.2, 0.3, 1)).toBeCloseTo(1 - 0.15, 12);
    expect(faithOpposeMul(0, 0.2, 0.3, 1)).toBeCloseTo(0.8, 12);
    expect(faithOpposeMul(1, 0.2, 0.3, 1)).toBeCloseTo(1.3, 12);
    expect(faithOpposeMul(0.5, 0.2, 0.3, 1)).toBeCloseTo(1.15, 12);
  });

  it('神权在这条轴上更强,别的政体是 1', () => {
    expect(faithScale(crown(0), 1000, A.FAITH_THEO)).toBe(1);
    expect(faithScale(theo(0), 1000, A.FAITH_THEO)).toBe(A.FAITH_THEO);
    expect(A.FAITH_THEO).toBeGreaterThan(1);
    expect(D.FAITH_THEO).toBe(A.FAITH_THEO);
    expect(W.FAITH_THEO).toBe(A.FAITH_THEO);
    const same = faithAlignMul(0, A.FAITH_SAME, A.FAITH_FAR, 1);
    const sameTheo = faithAlignMul(0, A.FAITH_SAME, A.FAITH_FAR, A.FAITH_THEO);
    expect(sameTheo).toBeGreaterThan(same);
    const far = faithOpposeMul(1, W.FAITH_WAR_SAME, W.FAITH_WAR_FAR, 1);
    const farTheo = faithOpposeMul(1, W.FAITH_WAR_SAME, W.FAITH_WAR_FAR, W.FAITH_THEO);
    expect(farTheo).toBeGreaterThan(far);
  });

  it('有国教用国教,否则用国都所在州;差距走 faithGap', () => {
    const pm = mockPm({ state: { 0: 4 }, region: { 0: 1, 1: 5 } });
    const p = crown(0);
    const q = crown(1);
    expect(polityFaith(pm, p, 1000)).toBe(4);
    expect(polityFaith(pm, q, 1000)).toBe(5);
    expect(faithGap(pm, 4, 4)).toBe(0);
    expect(faithGap(pm, 4, 5)).toBe(0.5);
    expect(faithGap(pm, 4, 7)).toBe(1);
    expect(polityFaithGap(pm, p, q, 1000)).toBe(0.5);
    const no = mockPm({ region: { 0: 2 } });
    expect(polityFaith(no, p, 1000)).toBe(2);
    expect(faithGap(no, 2, -1)).toBe(-1);
  });

  it('几个种子里同教结盟、异教开战都会出现;同化按州的信仰加权已挂上', () => {
    const worlds = new Map<number, World>();
    const civOf = (seed: number) => {
      let w = worlds.get(seed);
      if (!w) worlds.set(seed, (w = generateWorld({ ...DEFAULT_PARAMS, seed })));
      return generateCiv(w);
    };
    let samePact = 0;
    let farWar = 0;
    let assim = 0;
    for (const seed of [7, 2024, 1]) {
      const civ = civOf(seed);
      const rel = civ.religion;
      expect(rel, `seed ${seed}`).toBeDefined();
      for (const e of civ.annals) {
        if (e.kind === 'alliance' && e.a >= 0 && e.b >= 0) {
          const fa = stateFaithAt(rel, e.a, e.year)?.faith;
          const fb = stateFaithAt(rel, e.b, e.year)?.faith;
          if (fa !== undefined && fb !== undefined && fa === fb && fa >= 0) samePact++;
        }
        if (e.kind === 'war' && e.a >= 0 && e.b >= 0) {
          const fa = stateFaithAt(rel, e.a, e.year)?.faith;
          const fb = stateFaithAt(rel, e.b, e.year)?.faith;
          if (fa !== undefined && fb !== undefined && fa >= 0 && fb >= 0 && fa !== fb) farWar++;
        }
        if (e.kind === 'assimilate') assim++;
      }
    }
    expect(samePact).toBeGreaterThan(0);
    expect(farWar).toBeGreaterThan(0);
    expect(assim).toBeGreaterThan(0);
  }, 120_000);
});

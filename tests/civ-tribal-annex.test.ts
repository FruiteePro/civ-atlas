/**
 * 中古以后并吞部落地带(GENERATOR_VERSION 69):扩张门槛按国都时代、政体、贫富、民族、信仰加权;
 * 战争也可能顺手收服接壤的无主部落州。早年战争仍不占无主部落地,并不把部落地带一口吃光。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld, type World } from '../src/gen/world';
import { generateCiv, type Civ } from '../src/gen/civ';
import { OFFICIAL_KNOBS } from '../src/gen/civ/engine/knobs';
import { POLITIES_KNOBS, tribalAnnexMul, type PolityModel } from '../src/gen/civ/polities';
import { WARS_KNOBS } from '../src/gen/civ/wars';
import { capitalAt } from '../src/gen/civ/growth';
import { developmentAt, eraLevel, eraOf } from '../src/gen/civ/development';
import type { Polity, Year } from '../src/gen/civ/types';

const K = OFFICIAL_KNOBS.get(POLITIES_KNOBS);
const W = OFFICIAL_KNOBS.get(WARS_KNOBS);

const worlds = new Map<number, World>();
const world = (seed: number) => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld({ ...DEFAULT_PARAMS, seed })));
  return w;
};
const civs = new Map<number, Civ>();
const civOf = (seed: number) => {
  let c = civs.get(seed);
  if (!c) civs.set(seed, (c = generateCiv(world(seed))));
  return c;
};

function eraAtYear(civ: Civ, year: Year, r: number): number {
  const lv = developmentAt(civ.development!, year);
  return eraOf(eraLevel(lv, r)).era;
}

function mock(opts: {
  era?: number;
  regime?: 'crown' | 'republic' | 'junta' | 'theocracy';
  tier?: number;
  suit?: number;
  culture?: number;
  cb?: number;
  sf?: number;
  rf?: number;
  noHooks?: boolean;
}): number {
  const regime = opts.regime ?? 'crown';
  const p = {
    id: 0,
    capital: 0,
    culture: opts.culture ?? 1,
    lineage: regime === 'republic' ? 'republic' : 'realm',
    dynasties: regime === 'junta' || regime === 'theocracy' ? [{ year: 0, regime }] : undefined,
  } as Polity;
  const m = {
    k: K,
    settlements: [{ region: 0 }],
    tier: new Int8Array([opts.tier ?? 0]),
    terrain: { meanSuit: Float32Array.from([opts.suit ?? K.TRIBAL_SUIT_REF * 0.5]) },
  } as unknown as PolityModel;
  if (!opts.noHooks) {
    m.eraAt = () => opts.era ?? 5;
    m.faithAt = () => opts.rf ?? -1;
    m.stateFaith = () => opts.sf ?? -1;
  }
  return tribalAnnexMul(m, p, 0, opts.cb ?? 2, 1000);
}

describe('中古以后并吞部落地带', () => {
  it('国都时代不到中古、或还没挂时代,门槛倍数是 1', () => {
    expect(mock({ era: K.TRIBAL_ERA0 - 1, regime: 'junta', tier: 3, suit: 40, cb: 1, culture: 1, sf: 1, rf: 1 })).toBe(1);
    expect(mock({ noHooks: true, regime: 'junta', tier: 3, suit: 40, cb: 1, culture: 1, sf: 1, rf: 1 })).toBe(1);
    // 刚进中古,时代加成还没起来,政体、贫富也按填满程度插,仍是 1
    expect(mock({ era: K.TRIBAL_ERA0, regime: 'junta', tier: 3, suit: 40, cb: 1, culture: 1, sf: 1, rf: 1 })).toBe(1);
  });

  it('到工业时代收满:军政府、神权、帝国比王室容易,共和略难;富庶、同族、同教再容易一截,异教略难', () => {
    const late = K.TRIBAL_ERA1;
    const crown = mock({ era: late });
    expect(crown).toBeCloseTo(K.TRIBAL_LATE, 12);
    expect(mock({ era: late, regime: 'junta' })).toBeCloseTo(K.TRIBAL_LATE * K.TRIBAL_JUNTA, 12);
    expect(mock({ era: late, regime: 'theocracy' })).toBeCloseTo(K.TRIBAL_LATE * K.TRIBAL_THEOCRACY, 12);
    expect(mock({ era: late, regime: 'republic' })).toBeCloseTo(K.TRIBAL_LATE * K.TRIBAL_REPUBLIC, 12);
    expect(mock({ era: late, tier: 3 })).toBeCloseTo(K.TRIBAL_LATE * K.TRIBAL_EMPIRE, 12);
    expect(mock({ era: late, regime: 'junta' })).toBeLessThan(crown);
    expect(mock({ era: late, regime: 'theocracy' })).toBeLessThan(crown);
    expect(mock({ era: late, regime: 'republic' })).toBeGreaterThan(crown);

    const poor = mock({ era: late, suit: K.TRIBAL_SUIT_REF * 0.5 });
    const rich = mock({ era: late, suit: K.TRIBAL_SUIT_REF * 1.5 });
    expect(rich).toBeLessThan(poor);

    const foreign = mock({ era: late, culture: 1, cb: 2 });
    const kin = mock({ era: late, culture: 1, cb: 1 });
    expect(kin).toBeLessThan(foreign);

    const none = mock({ era: late, sf: -1, rf: -1 });
    const same = mock({ era: late, sf: 3, rf: 3 });
    const other = mock({ era: late, sf: 3, rf: 4 });
    expect(same).toBeLessThan(none);
    expect(other).toBeGreaterThan(none);
  });

  it('中古到工业之间按时代插值,不到晚近满额', () => {
    const midEra = (K.TRIBAL_ERA0 + K.TRIBAL_ERA1) / 2;
    const mid = mock({ era: midEra });
    const late = mock({ era: K.TRIBAL_ERA1 });
    expect(mid).toBeGreaterThan(late);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeCloseTo(1 - (1 - K.TRIBAL_LATE) * 0.5, 12);
  });

  it('战争顺手收服的旋钮在,一场每边有上限', () => {
    expect(W.TRIBAL_WAR_ODDS).toBeGreaterThan(0);
    expect(W.TRIBAL_WAR_ODDS).toBeLessThan(1);
    expect(W.TRIBAL_WAR_MAX).toBeGreaterThanOrEqual(1);
  });

  it('几个种子里国家仍占大半、部落地带还在;早年战争不占无主部落地,中古以后才有打仗顺手收的', () => {
    const seeds = [7, 2024, 13];
    let warTribal = 0;
    for (const seed of seeds) {
      const civ = civOf(seed);
      const R = civ.regions.count;
      let occupied = 0;
      let inPolity = 0;
      for (let r = 0; r < R; r++) {
        if (civ.culture[r] >= 0) occupied++;
        if (civ.polity[r] >= 0) inPolity++;
      }
      expect(inPolity / occupied, `seed ${seed}`).toBeGreaterThan(0.6);
      expect(inPolity / occupied, `seed ${seed}`).toBeLessThan(0.995);

      const tribal = civ.annals.filter((e) => e.kind === 'conquer' && e.b < 0);
      expect(tribal.every((e) => e.war >= 0 && e.b === -1), `seed ${seed}`).toBe(true);
      for (const e of tribal) {
        const cap = civ.settlements[capitalAt(civ.polities[e.a], e.year)]?.region;
        expect(cap, `seed ${seed} year ${e.year}`).toBeGreaterThanOrEqual(0);
        expect(eraAtYear(civ, e.year, cap), `seed ${seed} year ${e.year} 攻方国都还不到中古`).toBeGreaterThanOrEqual(K.TRIBAL_ERA0);
        warTribal++;
      }
    }
    expect(warTribal).toBeGreaterThan(0);
  }, 120_000);
});

/**
 * 中古以后并吞部落地带(GENERATOR_VERSION 69):扩张门槛按国都时代、政体、贫富、民族、信仰加权;
 * 战争也可能顺手收服接壤的无主部落州。早年战争仍不占无主部落地,并不把部落地带一口吃光。
 * 时代、信仰只看那一刻以前存下来的快照、算过的那一步(GENERATOR_VERSION 71):接着推时重放的预约和一口气推完一样。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld, type World } from '../src/gen/world';
import { continueCiv, generateCiv, type Civ } from '../src/gen/civ';
import { OFFICIAL_KNOBS } from '../src/gen/civ/engine/knobs';
import { POLITIES_KNOBS, tribalAnnexMul, type PolityModel } from '../src/gen/civ/polities';
import { WARS_KNOBS } from '../src/gen/civ/wars';
import { capitalAt } from '../src/gen/civ/growth';
import { developmentAt, eraLevel, eraOf, snapEraBefore } from '../src/gen/civ/development';
import { faithAt } from '../src/gen/civ/religion';
import { tribalReplay } from '../src/gen/civ/tribalReplay';
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
    // 国都在第 1 州,要收的是第 0 州(同教 = 两州信的一样)
    settlements: [{ region: 1 }],
    tier: new Int8Array([opts.tier ?? 0]),
    terrain: { meanSuit: Float32Array.from([opts.suit ?? K.TRIBAL_SUIT_REF * 0.5]) },
  } as unknown as PolityModel;
  if (!opts.noHooks) {
    m.tribalEra = () => opts.era ?? 5;
    m.tribalFaith = (r) => (r === 1 ? (opts.sf ?? -1) : (opts.rf ?? -1));
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

  it('接着推:重放预约照存下来的时代、信仰,和推演里一样;推到 3000 再推 300 和一口气推到 3300 的归属、日志一样', () => {
    const civ = civOf(7);
    const era = tribalReplay.era!(civ);
    const faith = tribalReplay.faith!(civ, civ.eras ?? []);
    const dev = civ.development!;
    // 时代:第 y 年以前最近的一份快照(整百年那一份到下一刻才算)
    const r = civ.settlements[capitalAt(civ.polities[0], 1000)].region;
    expect(era(r, 1000)).toBe(snapEraBefore(dev.snaps, dev.snapYears, 1000, r));
    expect(era(r, 1000)).toBe(eraLevel(developmentAt(dev, 900), r));
    expect(era(r, 1000.5)).toBeCloseTo(eraLevel(developmentAt(dev, 1000), r), 5);
    // 信仰:第 y 年以前最近算过的那一步(整 5 年那一步在那一刻的事件之后)
    expect(faith(r, 1000)).toBe(faithAt(civ, 995)[r]);
    // 推到一半拼的结果(地形大事那一刻接着推)没有 Civ.religion:照历史重放,答得一样(以前当"不明",重放的预约就错开了)
    const bare = tribalReplay.faith!({ ...civ, religion: undefined }, civ.eras ?? []);
    for (const y of [1000, 1777.5, 2500]) for (const q of [r, 0, 5, 100]) expect(bare(q, y), `${q}@${y}`).toBe(faith(q, y));
    expect(faith(r, 1001)).toBe(faithAt(civ, 1000)[r]);
    expect(era(r, 0)).toBe(-1);
    expect(faith(r, 0)).toBe(-1);

    const w = world(7);
    const whole = generateCiv(w, { endYear: 3300 });
    const once = continueCiv(w, civ, { endYear: 3300 });
    expect(Array.from(once.polity)).toEqual(Array.from(whole.polity));
    expect(once.log.size).toBe(whole.log.size);
    expect(Array.from(once.log.region.subarray(0, once.log.size))).toEqual(Array.from(whole.log.region.subarray(0, whole.log.size)));
    expect(once.settlements).toEqual(whole.settlements);
  }, 120_000);
});

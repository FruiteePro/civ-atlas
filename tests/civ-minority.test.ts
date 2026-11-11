/**
 * 少数族早年自治与危机自立(GENERATOR_VERSION 66):
 * 日常管治、离心力随国都时代收紧;危机里自立 / 复国 / 割据按占地和是否异教另加一截。
 */
import { describe, expect, it } from 'vitest';
import { CONTROL_KNOBS, controlConsts, foreignControlMul } from '../src/gen/civ/control';
import { POLITICS_KNOBS, cultureLandShare, foreignSplitDrift, minorityCrisisBonus, minorityCrisisWeight } from '../src/gen/civ/politics';
import { OFFICIAL_KNOBS } from '../src/gen/civ/engine/knobs';

const C = controlConsts(OFFICIAL_KNOBS);
const K = OFFICIAL_KNOBS.get(POLITICS_KNOBS);

describe('少数族日常管治与危机加成', () => {
  it('早年异族折扣是 FOREIGN,中古以后收到 FOREIGN_LATE,中间按时代插值', () => {
    expect(C.FOREIGN_LATE).toBeGreaterThan(C.FOREIGN);
    expect(C.FOREIGN_LATE).toBeLessThan(1);
    expect(C.FOREIGN_ERA1).toBeGreaterThan(C.FOREIGN_ERA0);
    expect(foreignControlMul(C.FOREIGN_ERA0, C)).toBeCloseTo(C.FOREIGN, 12);
    expect(foreignControlMul(C.FOREIGN_ERA0 - 1, C)).toBeCloseTo(C.FOREIGN, 12);
    expect(foreignControlMul(C.FOREIGN_ERA1, C)).toBeCloseTo(C.FOREIGN_LATE, 12);
    expect(foreignControlMul(C.FOREIGN_ERA1 + 2, C)).toBeCloseTo(C.FOREIGN_LATE, 12);
    const mid = (C.FOREIGN_ERA0 + C.FOREIGN_ERA1) / 2;
    expect(foreignControlMul(mid, C)).toBeCloseTo((C.FOREIGN + C.FOREIGN_LATE) / 2, 12);
    expect(OFFICIAL_KNOBS.get(CONTROL_KNOBS).FOREIGN).toBe(C.FOREIGN);
  });

  it('少数族日常离心力同样早年松、后来紧,仍大于 0', () => {
    expect(K.FOREIGN_D_LATE).toBeLessThan(K.FOREIGN_D);
    expect(K.FOREIGN_D_LATE).toBeGreaterThan(0);
    expect(foreignSplitDrift(K.FOREIGN_D_ERA0, K)).toBeCloseTo(K.FOREIGN_D, 12);
    expect(foreignSplitDrift(K.FOREIGN_D_ERA1, K)).toBeCloseTo(K.FOREIGN_D_LATE, 12);
  });

  it('未过动荡门槛或占地为 0 不加;动荡与占地越大越满,异教再加一截', () => {
    expect(minorityCrisisWeight(K.CRISIS_MIN_U0, 1, K)).toBe(0);
    expect(minorityCrisisWeight(K.CRISIS_MIN_U1, 0, K)).toBe(0);
    expect(minorityCrisisWeight(K.CRISIS_MIN_U1, K.CRISIS_MIN_SHARE, K)).toBeCloseTo(1, 12);
    expect(minorityCrisisWeight(K.CRISIS_MIN_U1, K.CRISIS_MIN_SHARE / 2, K)).toBeCloseTo(0.5, 12);
    expect(minorityCrisisWeight((K.CRISIS_MIN_U0 + K.CRISIS_MIN_U1) / 2, K.CRISIS_MIN_SHARE, K)).toBeCloseTo(0.5, 12);
    expect(minorityCrisisBonus(K.CRISIS_MIN_U1, 1, false, K)).toBeCloseTo(K.CRISIS_MIN_D, 12);
    expect(minorityCrisisBonus(K.CRISIS_MIN_U1, 1, true, K)).toBeCloseTo(K.CRISIS_MIN_D + K.CRISIS_FAITH_D, 12);
    expect(minorityCrisisBonus(0, 1, true, K)).toBe(0);
  });

  it('cultureLandShare 按这族占地算,不把别的少数族算进来', () => {
    const lands = [[0, 1, 2, 3, 4]];
    const culture = [1, 1, 2, 0, 0];
    expect(cultureLandShare(lands, culture, 0, 1, 5)).toBeCloseTo(0.4, 12);
    expect(cultureLandShare(lands, culture, 0, 2, 5)).toBeCloseTo(0.2, 12);
    expect(cultureLandShare(lands, culture, 0, 9, 5)).toBe(0);
    expect(cultureLandShare(lands, culture, 0, 1, 0)).toBe(0);
  });
});

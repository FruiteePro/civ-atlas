/**
 * 大分裂模式评估与切分参数(fragmentMode.ts / unrest 挂接)。
 */
import { describe, expect, it } from 'vitest';
import {
  FRAGMENT_MODE_OPT,
  FRAGMENT_MODE_PARAMS,
  assessFragment,
  fragmentModeFromOpt,
  resolveFragmentMode,
} from '../src/gen/civ/fragmentMode';
import { generateWorld, DEFAULT_PARAMS } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import { ownersAt } from '../src/gen/civ/engine/timeline';
import { polityKey, cleanIntervention } from '../src/gen/edits';

describe('fragmentMode assessment', () => {
  it('powers: 1–3 warlord seats + decent center (no large domain required)', () => {
    const a = assessFragment({
      N: 100,
      meanC: 0.62,
      foreignShare: 0.1,
      age: 200,
      lordDomains: [5],
      lordSeats: [10],
    });
    expect(a.mode).toBe('powers');
    expect(a.targetPieces).toBeGreaterThanOrEqual(2);
    expect(a.targetPieces).toBeLessThanOrEqual(4);
    expect(a.mergeDist).toBe(FRAGMENT_MODE_PARAMS.powers.mergeDist);
    expect(a.minSize).toBeGreaterThanOrEqual(FRAGMENT_MODE_PARAMS.powers.minSizeBase);
  });

  it('shatter: many lords or large weak high-foreign empire', () => {
    const many = assessFragment({
      N: 120,
      meanC: 0.4,
      foreignShare: 0.5,
      age: 300,
      lordDomains: [4, 3, 3, 2],
      lordSeats: [1, 2, 3, 4],
    });
    expect(many.mode).toBe('shatter');
    expect(many.mergeDist).toBe(0.25);
    expect(many.minSize).toBeGreaterThanOrEqual(2);

    const weak = assessFragment({
      N: 150,
      meanC: 0.36,
      foreignShare: 0.53,
      age: 400,
      lordDomains: [3],
      lordSeats: [7],
    });
    // centerStrength < 0.42 → not powers; large + weak → shatter
    expect(weak.mode).toBe('shatter');
  });

  it('mixed: no lords, modest size, decent center', () => {
    const a = assessFragment({
      N: 47,
      meanC: 0.58,
      foreignShare: 0.19,
      age: 100,
      lordDomains: [],
      lordSeats: [],
    });
    expect(a.mode).toBe('mixed');
    expect(a.mergeDist).toBe(FRAGMENT_MODE_PARAMS.mixed.mergeDist);
  });

  it('resolveFragmentMode honors explicit mode; pieces is soft target', () => {
    const assessed = assessFragment({
      N: 90,
      meanC: 0.5,
      foreignShare: 0.2,
      age: 200,
      lordDomains: [4],
      lordSeats: [3],
    });
    const forced = resolveFragmentMode('shatter', assessed, 7);
    expect(forced.mode).toBe('shatter');
    expect(forced.targetPieces).toBe(7);
    expect(forced.mergeDist).toBe(0.25);
    const auto = resolveFragmentMode('auto', assessed);
    expect(auto.mode).toBe(assessed.mode);
  });

  it('opt encoding round-trips', () => {
    expect(fragmentModeFromOpt(FRAGMENT_MODE_OPT.powers)).toBe('powers');
    expect(fragmentModeFromOpt(FRAGMENT_MODE_OPT.mixed)).toBe('mixed');
    expect(fragmentModeFromOpt(FRAGMENT_MODE_OPT.shatter)).toBe('shatter');
    expect(fragmentModeFromOpt(undefined)).toBeUndefined();
  });
});

describe('natural collapse records mode opt', () => {
  it('seed 7 collapses have opt and produce a mix of modes', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const civ = generateCiv(world);
    const collapses = civ.annals.filter((e) => e.kind === 'collapse');
    expect(collapses.length).toBeGreaterThan(0);
    const modes = new Set<number>();
    for (const e of collapses) {
      expect(e.opt === 0 || e.opt === 1 || e.opt === 2, `year ${e.year} missing opt`).toBe(true);
      modes.add(e.opt!);
      if (e.b < 2) expect(e.war).toBeGreaterThan(0);
    }
    // 阈值按 seed7 调过:应至少出现两种模式
    expect(modes.size, `modes=${[...modes]}`).toBeGreaterThanOrEqual(2);
  }, 120_000);
});

describe('destroy partition: no orphaned exclaves', () => {
  it('seed7 destroy mixed/shatter: contiguous polity → leftover foe ≈ 0', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const year = 1600;
    const own = ownersAt(base, year).polity;
    const cnt = new Map<number, number>();
    for (let r = 0; r < own.length; r++) if (own[r] >= 0) cnt.set(own[r], (cnt.get(own[r]) ?? 0) + 1);
    const pid = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const N = cnt.get(pid)!;
    expect(N).toBeGreaterThan(20);
    for (const mode of ['mixed', 'shatter'] as const) {
      const iv = cleanIntervention({ kind: 'destroy', a: polityKey(base, pid), from: year, mode })!;
      const civ = generateCiv(world, { interventions: [iv], endYear: year + 30 });
      const ie = civ.annals.find((e) => e.kind === 'intervene' && Math.abs(e.year - year) < 0.01)!;
      expect(ie.n, mode).toBeGreaterThan(0);
      // 连通国土不应整片散成无主;允许少量孤岛/无城
      expect(ie.foe ?? 0, `${mode} leftover=${ie.foe}`).toBeLessThanOrEqual(Math.max(3, Math.floor(N * 0.08)));
    }
  }, 180_000);
});

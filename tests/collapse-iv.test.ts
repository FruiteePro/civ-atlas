/**
 * 作者「大崩解」干预:核心留下,其余裂成继承国;mode / pieces。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import { ownersAt } from '../src/gen/civ/engine/timeline';
import { polityKey, type Intervention } from '../src/gen/edits';
import { fragmentModeFromOpt } from '../src/gen/civ/fragmentMode';
import { capitalAt } from '../src/gen/civ/growth';
import { newIvDoneText } from '../src/ui/newIvInfo';
import { nameAt } from '../src/ui/Interventions';

describe('author collapse intervention', () => {
  it('seed7: auto collapse keeps capital owner, creates successors, records mode', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 1600;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const A = nameAt(base.polities[id], T);
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'auto' };
    const civ = generateCiv(world, { interventions: [iv], endYear: T + 30 });
    const e = civ.annals.find((x) => x.kind === 'intervene' && x.war === 0)!;
    expect(e.a).toBe(id);
    expect([-8, -2]).toContain(e.b);
    if (e.b === -8) {
      expect(e.n!).toBeGreaterThan(0);
      expect(e.opt === 0 || e.opt === 1 || e.opt === 2).toBe(true);
      const after = ownersAt(civ, T).polity;
      const cap = capitalAt(civ.polities[id], T);
      expect(after[civ.settlements[cap].region]).toBe(id);
      expect(civ.polities[id].ended).toBeUndefined();
      const splits = civ.annals.filter((x) => x.kind === 'split' && x.year === e.year && x.cause === 'collapse' && x.b === id);
      expect(splits.length).toBe(e.n);
      const done = newIvDoneText(civ, iv, 0, A, undefined)!;
      expect(done.ok).toBe(true);
      expect(done.text).toMatch(/大崩解，裂出 \d+ 国/);
      expect(fragmentModeFromOpt(e.opt)).toBeTruthy();
    }
  }, 90_000);

  it('seed7: powers mode soft pieces=2', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 2000;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'powers', pieces: 2 };
    const civ = generateCiv(world, { interventions: [iv], endYear: T + 20 });
    const e = civ.annals.find((x) => x.kind === 'intervene' && x.war === 0)!;
    expect([-8, -2]).toContain(e.b);
    if (e.b === -8) {
      expect(e.n!).toBeGreaterThan(0);
      expect(e.n!).toBeLessThanOrEqual(4);
      expect(e.opt).toBe(0); // powers
    }
  }, 90_000);
});

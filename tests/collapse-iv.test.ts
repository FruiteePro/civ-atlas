/**
 * 作者「大崩解」干预:核心留下,其余裂成继承国;mode / pieces。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import { ownersAt } from '../src/gen/civ/engine/timeline';
import { cleanIntervention, polityKey, type Intervention } from '../src/gen/edits';
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

describe('post-collapse truce', () => {
  it('seed7 author collapse: parent does not claim-war children within 100 years', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 1600;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'shatter' };
    const civ = generateCiv(world, { interventions: [iv], endYear: T + 99 });
    const kids = new Set(
      civ.annals.filter((e) => e.kind === 'split' && e.cause === 'collapse' && e.b === id && Math.abs(e.year - T) < 0.01).map((e) => e.a),
    );
    expect(kids.size).toBeGreaterThan(0);
    const early = civ.annals.filter(
      (e) => e.kind === 'war' && e.year < T + 100 && e.a === id && kids.has(e.b) && e.cause === 'claim',
    );
    expect(early, `claim wars before +100: ${early.map((e) => e.year)}`).toHaveLength(0);
  }, 180_000);
});

describe('forbid parent reclaim (noReclaim)', () => {
  it('cleanIntervention + UI data path keep noReclaim', () => {
    const raw = { kind: 'collapse', a: 'polity:c1#0', from: 1600, mode: 'shatter', noReclaim: true };
    const v = cleanIntervention(raw)!;
    expect(v.kind).toBe('collapse');
    if (v.kind !== 'collapse') return;
    expect(v.noReclaim).toBe(true);
    const d = cleanIntervention({ kind: 'destroy', a: 'polity:c1#0', from: 1600, mode: 'mixed', pieces: 4, noReclaim: true })!;
    expect(d.kind).toBe('destroy');
    if (d.kind !== 'destroy') return;
    expect(d.noReclaim).toBe(true);
    expect(d.mode).toBe('mixed');
    expect(d.pieces).toBe(4);
    // UI 勾选控件挂在 Collapse / Destroy 页
    const collapseSrc = readFileSync(join(__dirname, '../src/ui/CollapsePage.tsx'), 'utf8');
    const destroySrc = readFileSync(join(__dirname, '../src/ui/DestroyPage.tsx'), 'utf8');
    expect(collapseSrc).toContain('data-act="collapse-no-reclaim"');
    expect(collapseSrc).toContain('禁止母国收复');
    expect(destroySrc).toContain('data-act="destroy-no-reclaim"');
    expect(destroySrc).toContain('禁止母国收复');
  });

  it('seed7 collapse noReclaim: opt bit 4 set; parent never claim-wars children', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 1600;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'shatter', noReclaim: true };
    // 跑过 +100 年,确认禁收复是永久的(不是只禁 100 年)
    const civ = generateCiv(world, { interventions: [iv], endYear: T + 150 });
    const e = civ.annals.find((x) => x.kind === 'intervene' && x.war === 0)!;
    expect([-8, -2]).toContain(e.b);
    if (e.b === -8) {
      expect((e.opt ?? 0) & 4).toBe(4);
      expect(fragmentModeFromOpt(e.opt)).toBeTruthy();
      const kids = new Set(
        civ.annals.filter((x) => x.kind === 'split' && x.cause === 'collapse' && x.b === id && Math.abs(x.year - T) < 0.01).map((x) => x.a),
      );
      expect(kids.size).toBeGreaterThan(0);
      const claims = civ.annals.filter(
        (x) => x.kind === 'war' && x.a === id && kids.has(x.b) && x.cause === 'claim',
      );
      expect(claims, `claim wars despite noReclaim: ${claims.map((x) => x.year)}`).toHaveLength(0);
    }
  }, 180_000);
});

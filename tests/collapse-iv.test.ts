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
import { resumeCiv } from '../src/gen/civ/modules';
import { polityModelOf } from '../src/gen/civ/polities';
import { WARS_KNOBS, collapseTruceYears, collapseWeakFactor, collapseVigorFactor, collapseClaimStrength, piananAmbitionFactor, warModelOf } from '../src/gen/civ/wars';
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
  it('collapseTruceYears is in 5–50 and deterministic', () => {
    const a = collapseTruceYears(0x12345678, 42, 1600, [5, 50]);
    const b = collapseTruceYears(0x12345678, 42, 1600, [5, 50]);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(5);
    expect(a).toBeLessThanOrEqual(50);
    // 换母国或年份会变(不要求必变,但常见)
    const samples = new Set([
      a,
      collapseTruceYears(0x12345678, 43, 1600, [5, 50]),
      collapseTruceYears(0x12345678, 42, 1601, [5, 50]),
      collapseTruceYears(0x99abcdef, 42, 1600, [5, 50]),
    ]);
    expect(samples.size).toBeGreaterThan(1);
  });

  it('seed7 author collapse: parent does not claim-war children within that collapse\'s truce', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 1600;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'shatter' };
    const civ = generateCiv(world, { interventions: [iv], endYear: T + 55 });
    const kids = new Set(
      civ.annals.filter((e) => e.kind === 'split' && e.cause === 'collapse' && e.b === id && Math.abs(e.year - T) < 0.01).map((e) => e.a),
    );
    expect(kids.size).toBeGreaterThan(0);
    const sim = resumeCiv(world, civ);
    const pm = polityModelOf(sim)!;
    const wm = warModelOf(sim)!;
    const years = collapseTruceYears(wm.base, pm.ptag[id], T, wm.k.COLLAPSE_TRUCE);
    expect(years).toBeGreaterThanOrEqual(5);
    expect(years).toBeLessThanOrEqual(50);
    const early = civ.annals.filter(
      (e) => e.kind === 'war' && e.year < T + years && e.a === id && kids.has(e.b) && e.cause === 'claim',
    );
    expect(early, `claim wars before +${years}: ${early.map((e) => e.year)}`).toHaveLength(0);
  }, 180_000);
});





describe('sibling alliance priority', () => {
  it('diplomacy knobs expose earlier check and pact bonus for collapse siblings', async () => {
    const { DIPLOMACY_KNOBS } = await import('../src/gen/civ/diplomacy');
    expect(DIPLOMACY_KNOBS.values.SIB_DIP_FIRST).toBeLessThan(DIPLOMACY_KNOBS.values.DIP_FIRST);
    expect(DIPLOMACY_KNOBS.values.SIB_PACT).toBeGreaterThan(1);
  });
});

describe('shared collapse family claims', () => {
  it('collapseClaimStrength: full to 100y, zero by 200y', () => {
    expect(collapseClaimStrength(0, 100, 200)).toBe(1);
    expect(collapseClaimStrength(100, 100, 200)).toBe(1);
    expect(collapseClaimStrength(150, 100, 200)).toBeCloseTo(0.5, 5);
    expect(collapseClaimStrength(200, 100, 200)).toBe(0);
  });

  it('seed7 author collapse: family rebuilt with parent+kids and territory', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 1600;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'shatter' };
    const civ = generateCiv(world, { interventions: [iv], endYear: T + 5 });
    const kids = civ.annals.filter((e) => e.kind === 'split' && e.cause === 'collapse' && e.b === id && Math.abs(e.year - T) < 0.01).map((e) => e.a);
    expect(kids.length).toBeGreaterThan(0);
    const sim = resumeCiv(world, civ);
    const wm = warModelOf(sim)!;
    const fi = wm.familyOf.get(id);
    expect(fi).toBeDefined();
    const fam = wm.families[fi!];
    expect(fam.parent).toBe(id);
    expect(fam.members.has(id)).toBe(true);
    for (const k of kids) expect(fam.members.has(k)).toBe(true);
    expect(fam.regions.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('successor founding vigor', () => {
  it('collapseVigorFactor: 1.5 at founding, 1 after 40y; non-child stays 1', () => {
    expect(collapseVigorFactor(1000, true, 1000, 1.5, 40)).toBe(1.5);
    expect(collapseVigorFactor(1000, true, 1040, 1.5, 40)).toBe(1);
    expect(collapseVigorFactor(1000, true, 1020, 1.5, 40)).toBeCloseTo(1.25, 5);
    expect(collapseVigorFactor(1000, false, 1000, 1.5, 40)).toBe(1);
  });
});

describe('post-collapse parent weakness', () => {
  it('collapseWeakFactor: 0.5 at year 0, 1 after 40y, linear mid', () => {
    expect(collapseWeakFactor(1000, 1000, 0.5, 40)).toBe(0.5);
    expect(collapseWeakFactor(1000, 1040, 0.5, 40)).toBe(1);
    expect(collapseWeakFactor(1000, 1020, 0.5, 40)).toBeCloseTo(0.75, 5);
    expect(collapseWeakFactor(undefined, 1000, 0.5, 40)).toBe(1);
  });
});

describe('pianan ambition factor', () => {
  it('piananAmbitionFactor: 1 at 50/50; monotone in ambition; K=0 is 1', () => {
    expect(piananAmbitionFactor(50, 50, 1.2)).toBe(1);
    expect(piananAmbitionFactor(0, 0, 1.2)).toBeLessThan(1);
    expect(piananAmbitionFactor(100, 100, 1.2)).toBeGreaterThan(1);
    expect(piananAmbitionFactor(80, 80, 1.2)).toBeGreaterThan(piananAmbitionFactor(60, 60, 1.2));
    expect(piananAmbitionFactor(100, 0, 1.2)).toBe(1);
    expect(piananAmbitionFactor(undefined, 100, 1.2)).toBe(1);
    expect(piananAmbitionFactor(0, 0, 0)).toBe(1);
    expect(piananAmbitionFactor(100, 100, 0)).toBe(1);
    expect(WARS_KNOBS.values.PIANAN_K).toBe(1.2);
  });
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
    expect(collapseSrc).toContain('5–50 年不等的休战期');
    expect(destroySrc).toContain('data-act="destroy-no-reclaim"');
    expect(destroySrc).toContain('禁止母国收复');
    expect(destroySrc).toContain('5–50 年不等的休战期');
  });

  it('seed7 collapse noReclaim: opt bit 4 set; parent never claim-wars children', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world);
    const T = 1600;
    const sizes = new Map<number, number>();
    for (const o of ownersAt(base, T).polity) if (o >= 0) sizes.set(o, (sizes.get(o) ?? 0) + 1);
    const id = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const iv: Intervention = { kind: 'collapse', a: polityKey(base, id), from: T, mode: 'shatter', noReclaim: true };
    // 跑过最大休战期以后,确认禁收复是永久的(不是只禁 5–50 年)
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

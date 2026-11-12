/**
 * 作者干预「立神权 / 废神权」(InterventionKind 'theocracy'):
 * 清理、推演里生效(记 intervene + reform,在位表加一段)、本来就是 / 不是神权时不生效、接着推和一口气推完一样、
 * 编年史 / 干预列表 / 推完的提示条的说法、AI 改写能下这条命令。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { continueCiv, generateCiv, type Civ } from '../src/gen/civ';
import { polityAlive } from '../src/gen/civ/growth';
import { regimeAt } from '../src/gen/civ/regime';
import { REFORM_LAICIZE, REFORM_THEOCRACY } from '../src/gen/civ/councilRules';
import { interventionOutcome } from '../src/gen/civ/story/chronicle';
import { INTERVENTION_KINDS, polityKey, tidyIntervention, type Intervention, type WorldEdits } from '../src/gen/edits';
import { parseRewrite } from '../src/ai/prompts/rewrite';
import { newIvDoneText } from '../src/ui/newIvInfo';

const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
const base = generateCiv(world, { endYear: 1400 });
const Y = 1200;
const END = 1225;
/** 1200 年是君主国、活到 1400 年以后、1226 年(没有干预时)还是君主国的国里最晚立的那个 */
const pick = base.polities
  .filter((p) => polityAlive(p, Y) && p.ended === undefined && regimeAt(p, Y) === 'crown' && regimeAt(p, END + 1) === 'crown')
  .sort((a, b) => b.founded - a.founded)[0];
const key = polityKey(base, pick.id);
const ivs: Intervention[] = [
  { kind: 'theocracy', a: key, from: Y },
  { kind: 'theocracy', a: key, from: Y + 5 },
  { kind: 'theocracy', a: key, from: END, end: true },
];
const civ = generateCiv(world, { endYear: 1400, interventions: ivs });
const ivAnnal = (c: Civ, i: number) => c.annals.findIndex((e) => e.kind === 'intervene' && e.war === i);

describe('干预:立神权 / 废神权', () => {
  it('清理:只认国家键,end 只认 true;列在干预种类里', () => {
    expect(INTERVENTION_KINDS).toContain('theocracy');
    expect(tidyIntervention({ kind: 'theocracy', a: key, from: 1200, junk: 1 })).toEqual({ kind: 'theocracy', a: key, from: 1200 });
    expect(tidyIntervention({ kind: 'theocracy', a: key, from: 1200, end: true })).toEqual({ kind: 'theocracy', a: key, from: 1200, end: true });
    expect(tidyIntervention({ kind: 'theocracy', a: key, from: 1200, end: 'yes' })).toEqual({ kind: 'theocracy', a: key, from: 1200 });
    expect(tidyIntervention({ kind: 'theocracy', a: 'region:1', from: 1200 })).toBeNull();
  });

  it('立神权:记 intervene(b = −1)紧跟一条 reform(立神权),那一刻起是神权国;已是神权的再立不生效(b = −4);废神权复行共和', () => {
    const P = civ.polities[pick.id];
    const i0 = ivAnnal(civ, 0);
    expect(civ.annals[i0]).toMatchObject({ kind: 'intervene', a: pick.id, b: -1, year: Y });
    expect(civ.annals[i0 + 1]).toMatchObject({ kind: 'reform', a: pick.id, n: REFORM_THEOCRACY, year: Y });
    expect(regimeAt(P, Y + 1)).toBe('theocracy');
    expect(civ.annals[ivAnnal(civ, 1)]).toMatchObject({ kind: 'intervene', a: pick.id, b: -4 });
    const i2 = ivAnnal(civ, 2);
    expect(civ.annals[i2]).toMatchObject({ kind: 'intervene', b: -1, year: END });
    expect(civ.annals[i2 + 1]).toMatchObject({ kind: 'reform', a: pick.id, n: REFORM_LAICIZE, year: END });
    expect(regimeAt(P, END + 1)).toBe('republic');
    // 在位表:立神权那一刻起一段神权,废神权那一刻起一段共和
    const segs = P.dynasties!.filter((d) => d.year === Y || d.year === END).map((d) => d.regime);
    expect(segs).toEqual(['theocracy', 'republic']);
  });

  it('说法:编年史、推完的提示条;没生效的写原因', () => {
    expect(interventionOutcome(civ, 0)).toMatchObject({ ok: true });
    const no = interventionOutcome(civ, 1);
    expect(no.ok).toBe(false);
    expect(no.why).toMatch(/本来就是神权国/);
    expect(newIvDoneText(civ, ivs[0], 0, 'A', undefined)).toMatchObject({ ok: true, text: 'A立神权，教职主国' });
    expect(newIvDoneText(civ, ivs[2], 2, 'A', undefined)).toMatchObject({ ok: true, text: 'A废神权，复行共和' });
    expect(newIvDoneText(civ, ivs[1], 1, 'A', undefined)?.ok).toBe(false);
  });

  it('确定性:两次一样;在立、废之间切开接着推和一口气推完一样', () => {
    const again = generateCiv(world, { endYear: 1400, interventions: ivs });
    expect(JSON.stringify(again.annals)).toBe(JSON.stringify(civ.annals));
    for (const cut of [Y, Y + 3, END + 0.5]) {
      const head = generateCiv(world, { endYear: cut, interventions: ivs });
      const cont = continueCiv(world, head, { endYear: 1400, interventions: ivs });
      expect(JSON.stringify(cont.annals), `cut ${cut}`).toBe(JSON.stringify(civ.annals));
      expect(JSON.stringify(cont.polities.map((p) => p.dynasties)), `cut ${cut}`).toBe(JSON.stringify(civ.polities.map((p) => p.dynasties)));
    }
  }, 240_000);

  it('AI 改写:op theocracy 立 / 废;本来就是 / 不是的不能执行', () => {
    const EMPTY: WorldEdits = { names: {}, interventions: [], terrain: [] };
    const ctx = { world, civ: base, year: Y, edits: EMPTY };
    const parse = (edit: Record<string, unknown>) => {
      const p = parseRewrite(JSON.stringify({ reply: '好的', edits: [edit] }), ctx);
      if (!p.ok) throw new Error(p.message);
      return p.items[0];
    };
    const up = parse({ op: 'theocracy', country: `P${pick.id}`, from: Y, why: '国教既盛' });
    expect(up.change).toMatchObject({ kind: 'intervention', v: { kind: 'theocracy', a: key, from: Y } });
    const down = parse({ op: 'theocracy', country: `P${pick.id}`, from: Y, end: true, why: '…' });
    expect(down.change).toBeNull();
    expect(down.problem).toMatch(/不是神权国/);
    expect(parse({ op: '立神权', country: `P${pick.id}`, from: Y, why: '…' }).change).toMatchObject({ v: { kind: 'theocracy' } });
  });
});

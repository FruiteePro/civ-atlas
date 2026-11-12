/**
 * 干预带的一句缘由(Intervention.note)和 AI 导演的记号(ai):清理时留着、推演不看它们、编年史和「我的干预」照写。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import { polityAlive } from '../src/gen/civ/growth';
import { buildChronicle } from '../src/gen/civ/story/chronicle';
import { IV_NOTE_MAX, cleanIvNote, polityKey, tidyIntervention, type Intervention } from '../src/gen/edits';

describe('干预的缘由', () => {
  it('清理:ai 只认 true;缘由去掉换行、截到 IV_NOTE_MAX 个字;空的、不是字的不写', () => {
    const a = 'polity:c1#0';
    expect(tidyIntervention({ kind: 'unity', a, from: 10, ai: true, note: ' 两强\n久峙 ' })).toEqual({ kind: 'unity', a, from: 10, ai: true, note: '两强 久峙' });
    expect(tidyIntervention({ kind: 'unity', a, from: 10, ai: 1, note: 5 })).toEqual({ kind: 'unity', a, from: 10 });
    expect(tidyIntervention({ kind: 'unity', a, from: 10, note: '   ' })).toEqual({ kind: 'unity', a, from: 10 });
    expect([...cleanIvNote('字'.repeat(100))].length).toBe(IV_NOTE_MAX);
  });

  it('推演不看它:带不带缘由历史一样;编年史那一条后面写"(AI 导演:…)"', () => {
    const world = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const base = generateCiv(world, { endYear: 1300 });
    const p = base.polities.find((q) => polityAlive(q, 1200) && q.ended === undefined)!;
    const plain: Intervention = { kind: 'unity', a: polityKey(base, p.id), from: 1200 };
    const noted: Intervention = { ...plain, ai: true, note: '强国久安,禁其分裂以观后效' };
    const a = generateCiv(world, { endYear: 1300, interventions: [plain] });
    const b = generateCiv(world, { endYear: 1300, interventions: [noted] });
    expect(JSON.stringify(b.annals)).toBe(JSON.stringify(a.annals));
    const line = buildChronicle(b).find((e) => e.kind === 'intervene' && e.year === 1200);
    expect(line?.text).toMatch(/\(AI 导演:强国久安,禁其分裂以观后效\)$/);
    const was = buildChronicle(a).find((e) => e.kind === 'intervene' && e.year === 1200);
    expect(was?.text).not.toMatch(/AI 导演/);
  });
});

/**
 * AI 导演(src/ai/director.ts):用测试用假 AI。开关、目标、上限、白名单、窗口、超时 / 出错 / 回得不合格时什么也不做,
 * 收下的命令并进 play.commands、从最早那一刻起重推和一口气推完一样,重推不再问 AI。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld, type World } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import type { Civ } from '../src/gen/civ/types';
import { buildChronicle } from '../src/gen/civ/story/chronicle';
import { ownersAt } from '../src/gen/readers/openQuery';
import { EMPTY_EDITS, commandAt, playInterventions, polityKey, type Intervention, type WorldEdits } from '../src/gen/edits';
import { setActiveProvider, setMockResponder } from '../src/ai/client';
import { bordersAt } from '../src/ai/prompts/rewrite';
import {
  AI_DIR_DEFAULTS,
  aiDirActive,
  aiDirCallEstimate,
  aiDirDue,
  aiDirMerge,
  aiDirPropose,
  aiDirSummary,
  aiDirTimeout,
  cleanAiDir,
  type AiDirSettings,
} from '../src/ai/director';

let world: World;
let civ: Civ;
/** 第 1240—1280 年一直接壤的两国 */
let A = -1;
let B = -1;
const NOW = 1300;
const SINCE = 1200;
const on: AiDirSettings = { ...AI_DIR_DEFAULTS, on: true, kinds: ['protect', 'unity', 'halt', 'ally', 'declare', 'collapse'] };
const edits = (over: Partial<WorldEdits> = {}): WorldEdits => ({ ...EMPTY_EDITS, play: { year: NOW, commands: [] }, ...over });
let calls = 0;
const c0 = (c: Civ) => c.annals.filter((e) => e.year < 1250).length;
const reply = (edits: unknown[], extra: Record<string, unknown> = {}) => {
  setMockResponder(() => {
    calls++;
    return JSON.stringify({ reply: '看一眼', edits, ...extra });
  });
};
const declare = (from: number, why = '两强久峙,促其一战') => ({ op: 'declare', country: `P${A}`, other: `P${B}`, from, why });

beforeAll(() => {
  world = generateWorld({ ...DEFAULT_PARAMS, seed: 3 });
  civ = generateCiv(world, { endYear: NOW });
  // 第 1240—1280 年一直接壤的两国(下面在这几年宣战)
  const years = [1240, 1250, 1260, 1270, 1280];
  const own = years.map((y) => ownersAt(civ, y).polity);
  for (const p of civ.polities) {
    const n = [...bordersAt(civ, own[0], p.id, 1240)].find((q) => years.every((y, i) => bordersAt(civ, own[i], p.id, y).has(q)));
    if (n !== undefined) {
      A = p.id;
      B = n;
      break;
    }
  }
  expect(A).toBeGreaterThanOrEqual(0);
});

afterEach(() => {
  setMockResponder(null);
  setActiveProvider(null);
  calls = 0;
});

describe('AI 导演', () => {
  it('设置清理;关着、目标模式没写目标:不算开着,不问 AI', async () => {
    expect(cleanAiDir(null)).toEqual(AI_DIR_DEFAULTS);
    expect(cleanAiDir({ on: true, perStep: 9, every: 1, kinds: ['declare', 'crown', 'x'], aggr: 5, style: 'twist' })).toMatchObject({
      on: true,
      perStep: 3,
      every: 10,
      kinds: ['declare'],
      aggr: 2,
      style: 'twist',
    });
    expect(aiDirActive(AI_DIR_DEFAULTS)).toBe(false);
    expect(aiDirActive({ ...on, mode: 'goal', goal: '  ' })).toBe(false);
    expect(aiDirActive({ ...on, mode: 'goal', goal: '让 P3 统一大陆' })).toBe(true);
    expect(aiDirActive({ ...on, kinds: [] })).toBe(false);
    expect(aiDirDue(on, 1200, 1299, 0)).toBe(false);
    expect(aiDirDue(on, 1200, 1300, 0)).toBe(true);
    expect(aiDirDue(on, 1200, 1210, 1)).toBe(true);
    expect(aiDirDue({ ...on, onBig: false }, 1200, 1210, 1)).toBe(false);
    expect(aiDirCallEstimate(AI_DIR_DEFAULTS)).toBe(0);
    expect(aiDirCallEstimate({ ...on, every: 100, onBig: false })).toBe(10);

    setActiveProvider('mock');
    reply([declare(1250)]);
    for (const s of [AI_DIR_DEFAULTS, { ...on, mode: 'goal' as const, goal: '' }])
      expect(await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: s })).toBeNull();
    expect(calls).toBe(0);
  });

  it('简况很短:编号、国名、大事', () => {
    const s = aiDirSummary(world, civ, SINCE, NOW);
    expect(s).toMatch(new RegExp(`P${A} `));
    expect(s.split('\n').length).toBeLessThan(40);
  });

  it('没设 AI、出错、超时、回得看不懂:什么也不做(null,不抛错)', async () => {
    reply([declare(1250)]);
    expect(await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: on })).toBeNull();
    setActiveProvider('mock');
    setMockResponder(() => {
      throw new Error('boom');
    });
    expect(await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: on })).toBeNull();
    setMockResponder(() => '不是 JSON');
    expect(await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: on })).toBeNull();
    // 编号编的、不在这一段、没勾的种类、改名:一条也不收
    reply([
      { op: 'declare', country: 'P99999', other: `P${B}`, from: 1250, why: '编的' },
      declare(1150),
      { op: 'destroy', country: `P${A}`, from: 1250, why: '没勾' },
      { op: 'rename', target: `P${A}`, name: '新名', why: '改名' },
    ]);
    expect(await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: on })).toBeNull();
    // 超时:取消那次调用,回 null
    let aborted = false;
    const r = await aiDirTimeout(
      (signal) =>
        new Promise<string>((res) => {
          signal.addEventListener('abort', () => (aborted = true));
          setTimeout(() => res('晚了'), 500);
        }),
      20,
    );
    expect(r).toBeNull();
    expect(aborted).toBe(true);
    expect(await aiDirTimeout(async () => '及时', 200)).toBe('及时');
  });

  it('上限:每次最多 perStep 条;最近一百年里算上以前 AI 下的;起演那年、别的支分开以前的不收', async () => {
    setActiveProvider('mock');
    reply([declare(1240), declare(1250), declare(1260), declare(1270), declare(1280)]);
    const r1 = await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: { ...on, perStep: 2, perCentury: 10 } });
    expect(r1?.commands.map((v) => v.from)).toEqual([1240, 1250]);
    expect(r1?.dropped.filter((x) => x.includes('超过上限')).length).toBe(3);
    // 以前 AI 下过 2 条(最近一百年里),百年上限 3:这次只收 1 条
    const old: Intervention[] = [
      { kind: 'halt', a: polityKey(civ, A), from: 1210, ai: true, note: '旧的' },
      { kind: 'halt', a: polityKey(civ, B), from: 1220, ai: true },
    ];
    const r2 = await aiDirPropose({ world, civ, edits: edits({ play: { year: NOW, commands: old } }), since: SINCE, now: NOW, settings: { ...on, perStep: 3, perCentury: 3 } });
    expect(r2?.commands.length).toBe(1);
    const r3 = await aiDirPropose({ world, civ, edits: edits({ play: { year: NOW, commands: old } }), since: SINCE, now: NOW, settings: { ...on, perStep: 3, perCentury: 2 } });
    expect(r3).toBeNull();
    // 从第 1255 年起演:更早的不收
    const r4 = await aiDirPropose({ world, civ, edits: edits({ playFrom: 1255 }), since: SINCE, now: NOW, settings: { ...on, perStep: 3, perCentury: 10 } });
    expect(r4?.commands.map((v) => v.from)).toEqual([1260, 1270, 1280]);
  });

  it('并进进度:最早那一刻以前照旧,以后按时刻排(同一刻原来的在前);比进度晚的不并', () => {
    const a = polityKey(civ, A);
    const play = { year: NOW, commands: [{ kind: 'halt', a, from: 1210 }, { kind: 'protect', a, from: 1250 }, { kind: 'unity', a, from: 1280 }] as Intervention[] };
    const m = aiDirMerge(play, [{ kind: 'declare', a, b: polityKey(civ, B), from: 1250, ai: true } as Intervention]);
    expect(m?.from).toBe(commandAt({ from: 1250 }));
    expect(m?.play.commands.map((v) => `${v.kind}@${v.from}`)).toEqual(['halt@1210', 'protect@1250', 'declare@1250', 'unity@1280']);
    expect(aiDirMerge(play, [{ kind: 'halt', a, from: NOW + 1 }])).toBeNull();
    expect(aiDirMerge(play, [])).toBeNull();
  });

  it('确定:同一个回复两次得同一份进度;照进度重推不再问 AI,最早那一刻以前的历史一字不变,编年史写缘由', async () => {
    setActiveProvider('mock');
    reply([declare(1250)]);
    const r1 = await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: on });
    const r2 = await aiDirPropose({ world, civ, edits: edits(), since: SINCE, now: NOW, settings: on });
    expect(r1).not.toBeNull();
    expect(JSON.stringify(r2?.play)).toBe(JSON.stringify(r1?.play));
    expect(r1!.from).toBe(1250);
    expect(r1!.play.commands[0]).toMatchObject({ kind: 'declare', from: 1250, ai: true, note: '两强久峙,促其一战' });
    const n = calls;
    const a = generateCiv(world, { endYear: NOW, interventions: playInterventions([], r1!.play) });
    const b = generateCiv(world, { endYear: NOW, interventions: playInterventions([], r2!.play) });
    expect(calls).toBe(n);
    expect(JSON.stringify(b.annals)).toBe(JSON.stringify(a.annals));
    const before = (c: Civ) => JSON.stringify(c.annals.filter((e) => e.year < 1250));
    expect(c0(a)).toBeGreaterThan(100);
    expect(before(a)).toBe(before(civ));
    // 这一刻起确实不一样了(宣了那一仗)
    expect(JSON.stringify(a.annals)).not.toBe(JSON.stringify(civ.annals));
    const line = buildChronicle(a).find((e) => e.kind === 'intervene' && Math.floor(e.year) === 1250);
    expect(line?.text).toMatch(/AI 导演:两强久峙,促其一战/);
  });
});

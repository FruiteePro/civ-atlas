/**
 * AI 导演接进逐年推演(ui/aiDirectorStore.ts):开着、到了该看的年份才问;问着的时候 aiDirBusy(不请算下一步);
 * 收下了命令交给 App(aiReplay)照新进度重推;关着、回得不合格、问的时候进度变了:什么也不换。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld, type World } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';
import type { Civ } from '../src/gen/civ/types';
import { ownersAt } from '../src/gen/readers/openQuery';
import { EMPTY_EDITS, polityKey, type PlayState } from '../src/gen/edits';
import { setActiveProvider, setMockResponder } from '../src/ai/client';
import { bordersAt } from '../src/ai/prompts/rewrite';
import { _resetAiDir, aiDirAfterStep, aiDirBusy, getAiDir, setAiDir } from '../src/ui/aiDirectorStore';
import { _resetStepwise, enterStepwise, setStepwiseActions, type StepwiseActions } from '../src/ui/stepwiseStore';
import { clearEdits, getEdits, putEditsQuiet } from '../src/ui/editsStore';
import { AiDirectorFields } from '../src/ui/StepwiseDialogs';
import { AI_DIR_DEFAULTS } from '../src/ai/director';

let world: World;
let civ: Civ;
let A = -1;
let B = -1;
let calls = 0;
const replays: { play: PlayState; text: string }[] = [];
const actions = { aiReplay: (play: PlayState, text: string) => (replays.push({ play, text }), true) } as unknown as StepwiseActions;
const wait = async () => {
  for (let i = 0; i < 50 && aiDirBusy(); i++) await new Promise((r) => setTimeout(r, 5));
};

beforeAll(() => {
  world = generateWorld({ ...DEFAULT_PARAMS, seed: 3 });
  civ = generateCiv(world, { endYear: 1300 });
  const own = ownersAt(civ, 1250).polity;
  for (const p of civ.polities) {
    const n = [...bordersAt(civ, own, p.id, 1250)][0];
    if (n !== undefined) {
      A = p.id;
      B = n;
      break;
    }
  }
});

const begin = () => {
  _resetStepwise();
  _resetAiDir();
  replays.length = 0;
  calls = 0;
  setStepwiseActions(actions);
  putEditsQuiet({ ...EMPTY_EDITS, play: { year: 1300, commands: [] }, playFrom: 1200 });
  enterStepwise(1200, 1300);
  setActiveProvider('mock');
  setMockResponder(() => {
    calls++;
    return JSON.stringify({ reply: '', edits: [{ op: 'declare', country: `P${A}`, other: `P${B}`, from: 1250, why: '促其一战' }] });
  });
};

afterEach(() => {
  setMockResponder(null);
  setActiveProvider(null);
  setStepwiseActions(null);
  clearEdits();
  _resetStepwise();
  _resetAiDir();
});

describe('AI 导演接进逐年推演', () => {
  it('关着:不问;开着、到了该看的年份:问着时 busy,收下了交给 aiReplay,上次看过记成现在', async () => {
    begin();
    aiDirAfterStep(world, civ, 1300, 0);
    await wait();
    expect(calls).toBe(0);
    setAiDir({ on: true, every: 100 });
    aiDirAfterStep(world, civ, 1300, 0);
    expect(aiDirBusy()).toBe(true);
    await wait();
    expect(aiDirBusy()).toBe(false);
    expect(calls).toBe(1);
    expect(replays.length).toBe(1);
    expect(replays[0].play.commands).toMatchObject([{ kind: 'declare', from: 1250, ai: true, note: '促其一战' }]);
    expect(replays[0].text).toMatch(/AI 导演下了 1 条命令/);
    expect(getAiDir().last).toBe(1300);
    // 没到下一次该看的年份、也没有大事:不问
    aiDirAfterStep(world, civ, 1300, 0);
    await wait();
    expect(calls).toBe(1);
  });

  it('回得不合格、问的时候进度变了:不换', async () => {
    begin();
    setAiDir({ on: true, every: 100 });
    setMockResponder(() => (calls++, '看不懂'));
    aiDirAfterStep(world, civ, 1300, 0);
    await wait();
    expect(calls).toBe(1);
    expect(replays.length).toBe(0);
    expect(aiDirBusy()).toBe(false);

    begin();
    setAiDir({ on: true, every: 100 });
    aiDirAfterStep(world, civ, 1300, 0);
    // 问着的时候作者下了一条令
    putEditsQuiet({ ...getEdits(), play: { year: 1300, commands: [{ kind: 'halt', a: polityKey(civ, A), from: 1300 }] } });
    await wait();
    expect(calls).toBe(1);
    expect(replays.length).toBe(0);
  });

  it('设置那一组:关着只有开关和一句话;开着列出几项和大约调用几次;目标模式有目标框', () => {
    const off = renderToStaticMarkup(createElement(AiDirectorFields, { value: AI_DIR_DEFAULTS, set: () => {}, phone: false }));
    expect(off).toContain('data-act="ai-dir-on"');
    expect(off).not.toContain('ai-dir-style');
    const on = renderToStaticMarkup(createElement(AiDirectorFields, { value: { ...AI_DIR_DEFAULTS, on: true, onBig: false }, set: () => {}, phone: false }));
    for (const a of ['ai-dir-mode', 'ai-dir-style', 'ai-dir-every', 'ai-dir-aggr', 'ai-dir-step', 'ai-dir-century', 'ai-dir-kind-declare']) expect(on).toContain(a);
    expect(on).toContain('推一千年约调用 10 次 AI');
    const goal = renderToStaticMarkup(createElement(AiDirectorFields, { value: { ...AI_DIR_DEFAULTS, on: true, mode: 'goal' }, set: () => {}, phone: true }));
    expect(goal).toContain('ai-dir-goal');
    expect(goal).toContain('还没写目标');
  });
});

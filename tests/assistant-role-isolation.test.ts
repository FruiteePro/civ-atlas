/**
 * Role 隔离：面板「干预」开关决定 story / intervention，不再靠关键词。
 */
import { test, expect, beforeEach, afterEach } from 'vitest';
import type { Civ } from '../src/gen/civ';
import type { World } from '../src/gen/world';
import type { WorldEdits } from '../src/gen/edits';
import {
  validateSelection,
  resolveAssistantRole,
  assistantTools,
  type AssistantContext,
} from '../src/ai/agent/assistant';
import {
  _resetAssistant,
  getInterveneMode,
  setInterveneMode,
  getAssistant,
} from '../src/ui/assistantStore';

function mockWorld(): World {
  return {
    mesh: { n: 100, half: [] },
    elev: new Float32Array(100),
    biome: new Uint8Array(100),
  } as any;
}

function mockCiv(): Civ {
  return {
    seed: 7,
    viable: true,
    endYear: 3000,
    polities: [
      {
        id: 0,
        name: '大澜王朝',
        founded: 100,
        ended: undefined,
        capital: 0,
        names: [{ year: 100, title: '大澜王朝' }],
      },
    ],
    settlements: [{ id: 0, name: '大澜城', founded: 100, ended: undefined, region: 10, at: [0, 0] }],
    places: [],
  } as any;
}

function mockEdits(): WorldEdits {
  return { names: {}, interventions: [], terrain: [] };
}

beforeEach(() => {
  _resetAssistant();
});

afterEach(() => {
  _resetAssistant();
});

test('resolveAssistantRole：默认 story；显式 intervention；history 强制 intervention', () => {
  expect(resolveAssistantRole({})).toBe('story');
  expect(resolveAssistantRole({ role: 'story' })).toBe('story');
  expect(resolveAssistantRole({ role: 'intervention' })).toBe('intervention');
  // 新建中只能改地形：强制干预，忽略关开关
  expect(resolveAssistantRole({ role: 'story', lock: 'history' })).toBe('intervention');
  expect(resolveAssistantRole({ lock: 'history' })).toBe('intervention');
});

test('关开关：含「保护」「改」等字仍是 story（无写工具）', () => {
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ: mockCiv(),
    year: 300,
    edits: mockEdits(),
    selection: { kind: 'polity', id: 0 },
  };
  const role = resolveAssistantRole({ role: 'story' });
  expect(role).toBe('story');
  const names = assistantTools(ctx, { trials: [], proposal: null }, role).map((t) => t.def.name);
  expect(names).not.toContain('propose_edits');
  expect(names).not.toContain('try_edits');
  // 问句本身不再驱动角色（关键词已停用）
  for (const q of ['保护这个国家', '修改历史让它不灭亡', '造一座山']) {
    expect(resolveAssistantRole({ role: 'story' }), q).toBe('story');
  }
});

test('开开关：intervention，有写工具', () => {
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ: mockCiv(),
    year: 300,
    edits: mockEdits(),
    selection: null,
  };
  const role = resolveAssistantRole({ role: 'intervention' });
  const names = assistantTools(ctx, { trials: [], proposal: null }, role).map((t) => t.def.name);
  expect(names).toContain('propose_edits');
  expect(names).toContain('try_edits');
});

test('store 把开关状态映射成 role', () => {
  expect(getInterveneMode()).toBe(false);
  expect(resolveAssistantRole({ role: getInterveneMode() ? 'intervention' : 'story' })).toBe('story');

  setInterveneMode(true);
  expect(getInterveneMode()).toBe(true);
  expect(getAssistant().intervene).toBe(true);
  expect(resolveAssistantRole({ role: getInterveneMode() ? 'intervention' : 'story' })).toBe('intervention');

  setInterveneMode(false);
  expect(getInterveneMode()).toBe(false);
  expect(resolveAssistantRole({ role: getInterveneMode() ? 'intervention' : 'story' })).toBe('story');
});

test('selection 存在也不自动打开写工具（须显式 intervention）', () => {
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ: mockCiv(),
    year: 300,
    edits: mockEdits(),
    selection: { kind: 'polity', id: 0 },
  };
  expect(validateSelection(ctx).valid).toBe(true);
  const names = assistantTools(ctx, { trials: [], proposal: null }, 'story').map((t) => t.def.name);
  expect(names).not.toContain('propose_edits');
});

/**
 * Role隔离回归测试：验证selection不会自动覆盖story模式
 * 
 * 场景：
 * 1. 用户选中国家，问关于它的历史 -> story模式（只读）
 * 2. 用户选中国家，说要修改它 -> intervention模式（可写）
 * 3. 显式指定role -> 尊重指定
 */

import { test, expect } from 'vitest';
import type { Civ } from '../src/gen/civ';
import type { World } from '../src/gen/world';
import type { WorldEdits } from '../src/gen/edits';
import { validateSelection, type AssistantContext, assistantTools } from '../src/ai/agent/assistant';

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
    settlements: [
      { id: 0, name: '大澜城', founded: 100, ended: undefined, region: 10, at: [0, 0] },
    ],
    places: [],
  } as any;
}

function mockEdits(): WorldEdits {
  return {
    names: {},
    interventions: [],
    terrain: [],
  };
}

test('selection存在但用户只问历史 -> story模式（只读）', () => {
  const civ = mockCiv();
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ,
    year: 300,
    edits: mockEdits(),
    selection: { kind: 'polity', id: 0 }, // 有selection
  };
  
  const sel = validateSelection(ctx);
  expect(sel.valid).toBe(true);
  
  // story模式下只有查询工具
  const storyTools = assistantTools(ctx, { trials: [], proposal: null }, 'story');
  const toolNames = storyTools.map(t => t.def.name);
  
  expect(toolNames).toContain('country');
  expect(toolNames).toContain('chronicle');
  expect(toolNames).not.toContain('propose_edits');
  expect(toolNames).not.toContain('try_edits');
});

test('selection存在且用户表达修改意图 -> intervention模式（可写）', () => {
  const civ = mockCiv();
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ,
    year: 300,
    edits: mockEdits(),
    selection: { kind: 'polity', id: 0 },
  };
  
  // intervention模式下有编辑工具
  const interventionTools = assistantTools(ctx, { trials: [], proposal: null }, 'intervention');
  const toolNames = interventionTools.map(t => t.def.name);
  
  expect(toolNames).toContain('country');
  expect(toolNames).toContain('propose_edits');
  expect(toolNames).toContain('try_edits');
});

test('无selection，story模式 -> 只读', () => {
  const civ = mockCiv();
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ,
    year: 300,
    edits: mockEdits(),
    selection: null, // 无selection
  };
  
  const storyTools = assistantTools(ctx, { trials: [], proposal: null }, 'story');
  const toolNames = storyTools.map(t => t.def.name);
  
  expect(toolNames).not.toContain('propose_edits');
  expect(toolNames).not.toContain('try_edits');
});

test('显式story模式 + selection -> 保持只读', () => {
  const civ = mockCiv();
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ,
    year: 300,
    edits: mockEdits(),
    selection: { kind: 'polity', id: 0 },
  };
  
  // 即使有selection，显式story模式也不给编辑工具
  const tools = assistantTools(ctx, { trials: [], proposal: null }, 'story');
  const toolNames = tools.map(t => t.def.name);
  
  expect(toolNames).not.toContain('propose_edits');
  expect(toolNames).not.toContain('try_edits');
});

test('显式intervention模式 + 无selection -> 仍可编辑', () => {
  const civ = mockCiv();
  const ctx: AssistantContext = {
    world: mockWorld(),
    civ,
    year: 300,
    edits: mockEdits(),
    selection: null, // 无selection
  };
  
  // 显式intervention模式给编辑工具，即使无selection
  const tools = assistantTools(ctx, { trials: [], proposal: null }, 'intervention');
  const toolNames = tools.map(t => t.def.name);
  
  expect(toolNames).toContain('propose_edits');
  expect(toolNames).toContain('try_edits');
});

test('关键词识别：故事类问题保持story', () => {
  const queries = [
    '大澜王朝的历史是什么',
    '这个国家有哪些君主',
    '告诉我关于这个时代的故事',
    '为什么会有这场战争',
  ];
  
  for (const q of queries) {
    const hasEditIntent = /修改|改|保护|结盟|宣战|立国|迁都|禁止|划州|让.*存活|让.*灭亡|不许|阻止/.test(q);
    expect(hasEditIntent).toBe(false);
  }
});

test('关键词识别：编辑意图触发intervention', () => {
  const queries = [
    '让大澜王朝存活到最后',
    '保护这个国家',
    '让它和邻国结盟',
    '修改历史让它不灭亡',
    '禁止它分裂',
  ];
  
  for (const q of queries) {
    const hasEditIntent = /修改|改|保护|结盟|宣战|立国|迁都|禁止|划州|让.*存活|让.*灭亡|不许|阻止/.test(q);
    expect(hasEditIntent).toBe(true);
  }
});

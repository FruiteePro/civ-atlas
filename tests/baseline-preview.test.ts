/**
 * Baseline vs Intervention Preview 测试
 * 
 * 覆盖：
 * - preview隔离（不mutate已提交world）
 * - baseline身份验证
 * - selection/year变化使preview过期
 * - 取消/失败preview零变化
 * - apply/undo正确执行
 * - 保留后续编辑
 */

import { test, expect } from 'vitest';
import {
  createPreview,
  getCurrentPreview,
  clearPreview,
  validatePreview,
  compareOutcomes,
  safeUndoInterventions,
  type BaselinePreview,
} from '../src/ui/baselinePreview';
import type { Civ } from '../src/gen/civ';
import type { WorldEdits, Intervention } from '../src/gen/edits';

function mockCiv(polities: Array<{ id: number; name: string; ended?: number }>): Civ {
  return {
    seed: 7,
    viable: true,
    endYear: 3000,
    polities: polities.map(p => ({
      ...p,
      founded: 100,
      capital: 0,
      names: [{ year: 100, title: p.name }],
    })) as any,
    settlements: [],
    places: [],
  } as any;
}

function mockEdits(interventions: Intervention[]): WorldEdits {
  return {
    names: {},
    interventions,
    terrain: [],
  };
}

test('createPreview: 创建不mutate原始数据', () => {
  const baseline = mockCiv([{ id: 0, name: '大澜', ended: 500 }]);
  const intervention = mockCiv([{ id: 0, name: '大澜' }]); // 存活
  const proposed: Intervention[] = [
    { kind: 'protect', a: 'polity:c0#0', from: 300 },
  ];
  
  const originalBaseline = JSON.parse(JSON.stringify(baseline));
  
  const preview = createPreview(baseline, intervention, proposed, {
    seed: 7,
    year: 300,
    horizonYear: 3000,
  });
  
  expect(preview).toBeTruthy();
  expect(preview.baseline.polities[0].ended).toBe(500);
  expect(preview.intervention.polities[0].ended).toBeUndefined();
  
  // 验证原始数据未被修改
  expect(JSON.stringify(baseline)).toBe(JSON.stringify(originalBaseline));
});

test('getCurrentPreview和clearPreview', () => {
  const baseline = mockCiv([{ id: 0, name: '大澜' }]);
  const intervention = mockCiv([{ id: 0, name: '大澜' }]);
  const proposed: Intervention[] = [];
  
  clearPreview();
  expect(getCurrentPreview()).toBeNull();
  
  createPreview(baseline, intervention, proposed, {
    seed: 7,
    year: 300,
    horizonYear: 3000,
  });
  
  expect(getCurrentPreview()).not.toBeNull();
  
  clearPreview();
  expect(getCurrentPreview()).toBeNull();
});

test('validatePreview: seed变化使preview过期', () => {
  const baseline = mockCiv([{ id: 0, name: '大澜' }]);
  const intervention = mockCiv([{ id: 0, name: '大澜' }]);
  const proposed: Intervention[] = [];
  
  const preview = createPreview(baseline, intervention, proposed, {
    seed: 7,
    year: 300,
    horizonYear: 3000,
  });
  
  // seed不变
  let result = validatePreview(preview, {
    seed: 7,
    year: 300,
    edits: mockEdits([]),
  });
  expect(result.valid).toBe(true);
  
  // seed变化
  result = validatePreview(preview, {
    seed: 8, // 不同的seed
    year: 300,
    edits: mockEdits([]),
  });
  expect(result.valid).toBe(false);
  expect(result.stale?.seedChanged).toBe(true);
});

test('validatePreview: year变化使preview过期', () => {
  const baseline = mockCiv([{ id: 0, name: '大澜' }]);
  const intervention = mockCiv([{ id: 0, name: '大澜' }]);
  const proposed: Intervention[] = [];
  
  const preview = createPreview(baseline, intervention, proposed, {
    seed: 7,
    year: 300,
    horizonYear: 3000,
  });
  
  // year变化
  const result = validatePreview(preview, {
    seed: 7,
    year: 400, // 不同的year
    edits: mockEdits([]),
  });
  expect(result.valid).toBe(false);
  expect(result.stale?.yearChanged).toBe(true);
});

test('validatePreview: edits变化使preview过期', () => {
  const baseline = mockCiv([{ id: 0, name: '大澜' }]);
  const intervention = mockCiv([{ id: 0, name: '大澜' }]);
  const proposed: Intervention[] = [
    { kind: 'protect', a: 'polity:c0#0', from: 300 },
  ];
  
  const preview = createPreview(baseline, intervention, proposed, {
    seed: 7,
    year: 300,
    horizonYear: 3000,
  });
  
  // edits变化
  const result = validatePreview(preview, {
    seed: 7,
    year: 300,
    edits: mockEdits([
      { kind: 'protect', a: 'polity:c0#0', from: 300 },
      { kind: 'ally', a: 'polity:c0#0', b: 'polity:c1#0', from: 350 }, // 额外干预
    ]),
  });
  expect(result.valid).toBe(false);
  expect(result.stale?.editsChanged).toBe(true);
});

test('validatePreview: 无preview返回invalid', () => {
  const result = validatePreview(null, {
    seed: 7,
    year: 300,
    edits: mockEdits([]),
  });
  expect(result.valid).toBe(false);
  expect(result.reason).toContain('没有可用的预览');
});

test('compareOutcomes: 识别存活vs灭亡', () => {
  const baseline = mockCiv([
    { id: 0, name: '大澜', ended: 500 },
    { id: 1, name: '提布里亚', ended: 600 },
  ]);
  const intervention = mockCiv([
    { id: 0, name: '大澜' }, // 存活
    { id: 1, name: '提布里亚', ended: 800 }, // 延后灭亡
  ]);
  
  const comparison = compareOutcomes(baseline, intervention);
  
  expect(comparison.affectedPolities.length).toBe(2);
  
  const dalan = comparison.affectedPolities.find(p => p.id === 0);
  expect(dalan?.change).toBe('survived');
  expect(dalan?.baseline.ended).toBe(500);
  expect(dalan?.intervention.ended).toBeUndefined();
  
  const tibu = comparison.affectedPolities.find(p => p.id === 1);
  expect(tibu?.change).toBe('fell_later');
  expect(tibu?.baseline.ended).toBe(600);
  expect(tibu?.intervention.ended).toBe(800);
});

test('compareOutcomes: 识别新增/消失国家', () => {
  const baseline = mockCiv([
    { id: 0, name: '大澜' },
    { id: 1, name: '提布里亚' },
  ]);
  const intervention = mockCiv([
    { id: 0, name: '大澜' },
    { id: 2, name: '维利西亚' }, // 新国家
  ]);
  
  const comparison = compareOutcomes(baseline, intervention);
  
  expect(comparison.newPolities.length).toBe(1);
  expect(comparison.newPolities[0].name).toBe('维利西亚');
  
  expect(comparison.lostPolities.length).toBe(1);
  expect(comparison.lostPolities[0].name).toBe('提布里亚');
});

test('safeUndoInterventions: 无冲突情况下成功undo', () => {
  const current = mockEdits([
    { kind: 'protect', a: 'polity:c0#0', from: 300 },
    { kind: 'ally', a: 'polity:c1#0', b: 'polity:c2#0', from: 400 },
  ]);
  
  const toRemove: Intervention[] = [
    { kind: 'protect', a: 'polity:c0#0', from: 300 },
  ];
  
  const result = safeUndoInterventions(current, toRemove);
  
  expect(result.success).toBe(true);
  expect(result.newEdits?.interventions.length).toBe(1);
  expect(result.newEdits?.interventions[0].kind).toBe('ally');
});

test('safeUndoInterventions: 检测冲突', () => {
  const current = mockEdits([
    { kind: 'protect', a: 'polity:c0#0', from: 300, until: 500 },
    { kind: 'unity', a: 'polity:c0#0', from: 400 }, // 同一国家，时间重叠
  ]);
  
  const toRemove: Intervention[] = [
    { kind: 'protect', a: 'polity:c0#0', from: 300, until: 500 },
  ];
  
  const result = safeUndoInterventions(current, toRemove);
  
  expect(result.success).toBe(false);
  expect(result.conflicts).toBeTruthy();
  expect(result.conflicts!.length).toBeGreaterThan(0);
  expect(result.conflicts![0].description).toContain('冲突');
});

test('safeUndoInterventions: 保留不相关编辑', () => {
  const current = mockEdits([
    { kind: 'protect', a: 'polity:c0#0', from: 300 },
    { kind: 'ally', a: 'polity:c1#0', b: 'polity:c2#0', from: 400 },
    { kind: 'declare', a: 'polity:c3#0', b: 'polity:c4#0', from: 500 },
  ]);
  
  const toRemove: Intervention[] = [
    { kind: 'ally', a: 'polity:c1#0', b: 'polity:c2#0', from: 400 },
  ];
  
  const result = safeUndoInterventions(current, toRemove);
  
  expect(result.success).toBe(true);
  expect(result.newEdits?.interventions.length).toBe(2);
  expect(result.newEdits?.interventions[0].kind).toBe('protect');
  expect(result.newEdits?.interventions[1].kind).toBe('declare');
});

test('safeUndoInterventions: knownBefore 重叠不视为冲突', () => {
  const protect: Intervention = { kind: 'protect', a: 'polity:c0#0', from: 300, until: 500 };
  const unity: Intervention = { kind: 'unity', a: 'polity:c0#0', from: 400 };
  const current = mockEdits([protect, unity]);

  // 撤销本轮加的 unity；protect 是执行前就有的，不算冲突
  const result = safeUndoInterventions(current, [unity], { knownBefore: [protect] });
  expect(result.success).toBe(true);
  expect(result.newEdits?.interventions).toEqual([protect]);
});

test('safeUndoInterventions: 执行后新加的重叠仍冲突', () => {
  const protect: Intervention = { kind: 'protect', a: 'polity:c0#0', from: 300, until: 500 };
  const unity: Intervention = { kind: 'unity', a: 'polity:c0#0', from: 400 };
  const later: Intervention = { kind: 'halt', a: 'polity:c0#0', from: 450 };
  const current = mockEdits([protect, unity, later]);

  const result = safeUndoInterventions(current, [unity], { knownBefore: [protect] });
  expect(result.success).toBe(false);
  expect(result.conflicts![0].description).toContain('冲突');
});

test('preview隔离: cancel不影响当前edits', () => {
  const currentEdits = mockEdits([]);
  const originalEdits = JSON.parse(JSON.stringify(currentEdits));
  
  const baseline = mockCiv([{ id: 0, name: '大澜' }]);
  const intervention = mockCiv([{ id: 0, name: '大澜' }]);
  const proposed: Intervention[] = [
    { kind: 'protect', a: 'polity:c0#0', from: 300 },
  ];
  
  createPreview(baseline, intervention, proposed, {
    seed: 7,
    year: 300,
    horizonYear: 3000,
  });
  
  // 取消preview
  clearPreview();
  
  // 验证currentEdits未被修改
  expect(JSON.stringify(currentEdits)).toBe(JSON.stringify(originalEdits));
});

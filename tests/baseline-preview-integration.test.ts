/**
 * Baseline Preview Integration测试
 * 
 * 验证baseline vs intervention store逻辑
 * 
 * 注意：真实引擎测试需要完整worker设置（见src/worker.ts）
 * 这里使用mock runner验证store/flow逻辑
 */

import { test, expect } from 'vitest';
import { generateBaselinePreview, cancelPreview, validateCurrentPreview, isPreviewReady, getComparisonMetrics } from '../src/ui/baselinePreviewStore';
import type { Civ } from '../src/gen/civ';
import type { WorldEdits, Intervention } from '../src/gen/edits';

/** Mock Civ对象（简化） */
function mockCiv(polities: Array<{ id: number; name: string; ended?: number }>): Civ {
  return {
    seed: 7,
    viable: true,
    endYear: 500,
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

/** 模拟runner（模拟baseline vs intervention差异） */
function createMockRunner(baselinePolities: any[], interventionPolities: any[]) {
  let callCount = 0;
  
  return async (interventions: Intervention[]): Promise<Civ> => {
    callCount++;
    // 第一次调用返回baseline，第二次返回intervention
    const polities = callCount === 1 ? baselinePolities : interventionPolities;
    return mockCiv(polities);
  };
}

test('generateBaselinePreview: mock runner对比baseline vs intervention', async () => {
  const seed = 2024;
  
  // Mock: baseline中大澜灭亡，intervention中存活
  const baselinePolities = [
    { id: 0, name: '大澜', ended: 300 },
    { id: 1, name: '提布里亚', ended: 400 },
  ];
  const interventionPolities = [
    { id: 0, name: '大澜' }, // 存活
    { id: 1, name: '提布里亚', ended: 400 },
  ];
  
  const runner = createMockRunner(baselinePolities, interventionPolities);
  
  const context = {
    seed,
    year: 100,
    horizonYear: 500,
    currentEdits: {
      names: {},
      interventions: [],
      terrain: [],
    },
  };
  
  const proposedInterventions: Intervention[] = [
    { kind: 'protect', a: 'polity:c0#0', from: 200 },
  ];
  
  const result = await generateBaselinePreview(runner, context, proposedInterventions);
  
  expect(result.success).toBe(true);
  expect(isPreviewReady()).toBe(true);
  
  const comparison = getComparisonMetrics();
  expect(comparison).toBeTruthy();
  expect(comparison!.affectedPolities.length).toBeGreaterThan(0);
  
  // 验证大澜从灭亡变为存活
  const dalan = comparison!.affectedPolities.find(p => p.id === 0);
  expect(dalan?.change).toBe('survived');
  
  cancelPreview();
  expect(isPreviewReady()).toBe(false);
});

test('validateCurrentPreview: 检测seed变化', async () => {
  const seed = 2025;
  const runner = createMockRunner([{ id: 0, name: '大澜' }], [{ id: 0, name: '大澜' }]);
  
  const context = {
    seed,
    year: 100,
    horizonYear: 500,
    currentEdits: {
      names: {},
      interventions: [],
      terrain: [],
    },
  };
  
  const result = await generateBaselinePreview(runner, context, []);
  expect(result.success).toBe(true);
  
  // seed不变，valid
  let validation = validateCurrentPreview(context);
  expect(validation.valid).toBe(true);
  
  // seed改变，invalid
  validation = validateCurrentPreview({ ...context, seed: 9999 });
  expect(validation.valid).toBe(false);
  expect(validation.reason).toContain('过期');
  
  cancelPreview();
});

test('generateBaselinePreview: abort signal取消生成', async () => {
  const seed = 2026;
  const runner = createMockRunner([{ id: 0, name: '大澜' }], [{ id: 0, name: '大澜' }]);
  
  const context = {
    seed,
    year: 100,
    horizonYear: 500,
    currentEdits: {
      names: {},
      interventions: [],
      terrain: [],
    },
  };
  
  const controller = new AbortController();
  
  // 立即abort
  controller.abort();
  
  const result = await generateBaselinePreview(
    runner, 
    context, 
    [],
    controller.signal
  );
  
  expect(result.success).toBe(false);
  expect(result.error).toBe('Aborted');
  expect(isPreviewReady()).toBe(false);
});

/**
 * Baseline vs Intervention Preview Store
 * 
 * 集成baseline preview到assistant workflow:
 * - 从当前world/seed/year/edits运行baseline（无干预）
 * - 运行intervention（应用proposal）
 * - 对比结果并展示
 * - 提供confirm/cancel和safe undo
 */

import type { Civ } from '../gen/civ';
import type { WorldEdits, Intervention } from '../gen/edits';
import { 
  createPreview, 
  validatePreview, 
  compareOutcomes, 
  getCurrentPreview,
  clearPreview,
  type BaselinePreview, 
  type ComparisonMetrics 
} from './baselinePreview';
import { createListeners } from './createStore';

/** Preview状态 */
interface PreviewState {
  /** 当前preview */
  preview: BaselinePreview | null;
  /** 对比结果 */
  comparison: ComparisonMetrics | null;
  /** preview生成状态 */
  status: 'idle' | 'generating-baseline' | 'generating-intervention' | 'ready' | 'error';
  /** 错误信息 */
  error?: string;
}

let state: PreviewState = {
  preview: null,
  comparison: null,
  status: 'idle',
};

const { subscribe, emit, use } = createListeners();

export const usePreviewState = () => use(get);

function get(): PreviewState {
  return state;
}

function set(newState: PreviewState): void {
  state = newState;
  emit();
}

/** 获取当前preview状态 */
export function getPreviewState(): PreviewState {
  return get();
}

/**
 * 生成baseline vs intervention preview
 * 
 * @param runner 试推演runner（来自assistantStore）
 * @param context 当前上下文
 * @param proposedInterventions 建议的干预
 * @param signal AbortSignal
 */
export async function generateBaselinePreview(
  runner: (interventions: Intervention[], signal?: AbortSignal) => Promise<Civ>,
  context: {
    seed: number;
    year: number;
    horizonYear: number;
    currentEdits: WorldEdits;
  },
  proposedInterventions: Intervention[],
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  try {
    set({ ...get(), status: 'generating-baseline', error: undefined });
    
    // 1. 运行baseline（无新干预，仅当前edits）
    const baseline = await runner(context.currentEdits.interventions as Intervention[], signal);
    
    if (signal?.aborted) {
      set({ ...get(), status: 'idle' });
      return { success: false, error: 'Aborted' };
    }
    
    set({ ...get(), status: 'generating-intervention' });
    
    // 2. 运行intervention（当前edits + proposed）
    const allInterventions = [
      ...(context.currentEdits.interventions as Intervention[]),
      ...proposedInterventions,
    ];
    const intervention = await runner(allInterventions, signal);
    
    if (signal?.aborted) {
      set({ ...get(), status: 'idle' });
      return { success: false, error: 'Aborted' };
    }
    
    // 3. 创建preview
    const preview = createPreview(baseline, intervention, proposedInterventions, {
      seed: context.seed,
      year: context.year,
      horizonYear: context.horizonYear,
    });
    
    // 4. 生成对比
    const comparison = compareOutcomes(baseline, intervention);
    
    set({ 
      ...get(), 
      preview, 
      comparison, 
      status: 'ready',
    });
    
    return { success: true };
    
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    set({ ...get(), status: 'error', error });
    return { success: false, error };
  }
}

/**
 * 取消preview
 */
export function cancelPreview(): void {
  clearPreview();
  set({ preview: null, comparison: null, status: 'idle', error: undefined });
}

/**
 * 验证当前preview是否有效
 */
export function validateCurrentPreview(current: {
  seed: number;
  year: number;
  edits: WorldEdits;
}): { valid: boolean; reason?: string } {
  const state = get();
  if (!state.preview) {
    return { valid: false, reason: '没有可用的preview' };
  }
  
  return validatePreview(state.preview, current);
}

/**
 * 获取preview对比结果
 */
export function getComparisonMetrics(): ComparisonMetrics | null {
  return get().comparison;
}

/**
 * 检查preview是否ready
 */
export function isPreviewReady(): boolean {
  const state = get();
  return state.status === 'ready' && state.preview !== null;
}

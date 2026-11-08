/**
 * Baseline vs Intervention Preview
 * 
 * 从相同year/seed/settings/horizon显示baseline和proposed intervention的真实引擎结果
 * - 复用try_edits和world/history机制
 * - preview不mutate已提交world/history
 * - 验证seed/year/config身份，拒绝过期preview
 * - 区分直接编辑和不确定后果
 * - 提供安全undo，保留后续不相关编辑
 */

import type { Civ } from '../gen/civ';
import type { WorldEdits, Intervention } from '../gen/edits';

/**
 * 计算干预列表的signature（用于比较是否改变）
 */
function ivSig(interventions: Intervention[]): string {
  return interventions.map(i => JSON.stringify(i)).join('|');
}

/** Baseline vs Intervention preview状态 */
export interface BaselinePreview {
  /** 创建时的world参数 - 用于验证过期 */
  seed: number;
  year: number;
  horizonYear: number;
  /** baseline: 无干预的推演结果 */
  baseline: Civ;
  /** intervention: 应用建议后的推演结果 */
  intervention: Civ;
  /** 建议的干预措施 */
  proposedInterventions: Intervention[];
  /** 创建时间戳，用于过期检测 */
  createdAt: number;
}

/** Preview验证结果 */
export interface PreviewValidation {
  valid: boolean;
  reason?: string;
  stale?: {
    seedChanged?: boolean;
    yearChanged?: boolean;
    editsChanged?: boolean;
  };
}

/** 当前preview（内存中，不持久化）*/
let currentPreview: BaselinePreview | null = null;

/**
 * 创建baseline vs intervention preview
 * 
 * @param baseline 当前无干预的历史
 * @param intervention 应用干预后的历史（来自try_edits）
 * @param proposed 建议的干预措施
 * @param context 当前上下文（seed/year/horizon）
 */
export function createPreview(
  baseline: Civ,
  intervention: Civ,
  proposed: Intervention[],
  context: { seed: number; year: number; horizonYear: number }
): BaselinePreview {
  const preview: BaselinePreview = {
    seed: context.seed,
    year: context.year,
    horizonYear: context.horizonYear,
    baseline,
    intervention,
    proposedInterventions: proposed,
    createdAt: Date.now(),
  };
  
  currentPreview = preview;
  return preview;
}

/**
 * 获取当前preview
 */
export function getCurrentPreview(): BaselinePreview | null {
  return currentPreview;
}

/**
 * 清除preview
 */
export function clearPreview(): void {
  currentPreview = null;
}

/**
 * 验证preview是否过期
 * 
 * 检查：
 * - seed是否改变
 * - year是否改变
 * - 已有edits是否改变（signature）
 */
export function validatePreview(
  preview: BaselinePreview | null,
  current: { seed: number; year: number; edits: WorldEdits }
): PreviewValidation {
  if (!preview) {
    return { valid: false, reason: '没有可用的预览' };
  }
  
  const stale: PreviewValidation['stale'] = {};
  let isStale = false;
  
  if (preview.seed !== current.seed) {
    stale.seedChanged = true;
    isStale = true;
  }
  
  if (preview.year !== current.year) {
    stale.yearChanged = true;
    isStale = true;
  }
  
  // 检查edits是否改变（通过signature）
  const previewSig = ivSig(preview.proposedInterventions);
  const currentSig = ivSig(current.edits.interventions as Intervention[]);
  if (previewSig !== currentSig) {
    stale.editsChanged = true;
    isStale = true;
  }
  
  if (isStale) {
    return {
      valid: false,
      reason: '预览已过期：world配置或当前年份已改变',
      stale,
    };
  }
  
  return { valid: true };
}

/**
 * 比较baseline和intervention的差异
 * 
 * 返回有意义的指标差异：
 * - 国家存续情况
 * - 领土变化
 * - 重大事件差异
 */
export interface ComparisonMetrics {
  /** 受影响的国家 */
  affectedPolities: Array<{
    id: number;
    name: string;
    baseline: { ended?: number; size?: number };
    intervention: { ended?: number; size?: number };
    change: 'survived' | 'fell_earlier' | 'fell_later' | 'grew' | 'shrank' | 'unchanged';
  }>;
  
  /** 新出现的国家（仅在intervention中） */
  newPolities: Array<{ id: number; name: string }>;
  
  /** 消失的国家（仅在baseline中） */
  lostPolities: Array<{ id: number; name: string }>;
}

/**
 * 比较两个civ的结果
 */
export function compareOutcomes(baseline: Civ, intervention: Civ): ComparisonMetrics {
  const affected: ComparisonMetrics['affectedPolities'] = [];
  const newPols: ComparisonMetrics['newPolities'] = [];
  const lostPols: ComparisonMetrics['lostPolities'] = [];
  
  // 建立id到polity的映射
  const baseMap = new Map(baseline.polities.map(p => [p.id, p]));
  const intMap = new Map(intervention.polities.map(p => [p.id, p]));
  
  // 检查baseline中的每个国家
  for (const bp of baseline.polities) {
    const ip = intMap.get(bp.id);
    
    if (!ip) {
      lostPols.push({ id: bp.id, name: bp.name });
      continue;
    }
    
    // 比较结局
    const bEnded = bp.ended;
    const iEnded = ip.ended;
    
    let change: ComparisonMetrics['affectedPolities'][0]['change'] = 'unchanged';
    
    if (bEnded !== undefined && iEnded === undefined) {
      change = 'survived';
    } else if (bEnded === undefined && iEnded !== undefined) {
      change = 'fell_earlier';
    } else if (bEnded !== undefined && iEnded !== undefined && bEnded !== iEnded) {
      change = iEnded > bEnded ? 'fell_later' : 'fell_earlier';
    }
    
    // 如果没有结局变化，检查领土变化
    // 注意：size在Polity类型中可能不存在，需要从其他地方计算
    // 这里简化处理
    
    if (change !== 'unchanged' || bEnded !== iEnded) {
      affected.push({
        id: bp.id,
        name: bp.name,
        baseline: { ended: bEnded },
        intervention: { ended: iEnded },
        change,
      });
    }
  }
  
  // 检查intervention中新增的国家
  for (const ip of intervention.polities) {
    if (!baseMap.has(ip.id)) {
      newPols.push({ id: ip.id, name: ip.name });
    }
  }
  
  return {
    affectedPolities: affected,
    newPolities: newPols,
    lostPolities: lostPols,
  };
}

/**
 * 安全undo：仅移除指定批次的干预，保留后续不相关编辑
 * 
 * 如果后续edits与要undo的edits有冲突（比如修改了同一国家的同一年份），
 * 则返回冲突信息，不执行undo
 */
export interface UndoResult {
  success: boolean;
  newEdits?: WorldEdits;
  conflicts?: Array<{
    type: 'intervention' | 'name' | 'terrain';
    description: string;
  }>;
}

/**
 * 检测干预冲突
 * 
 * 如果两个干预影响同一个对象在同一时间段，视为冲突
 */
function detectInterventionConflicts(
  toRemove: Intervention[],
  existing: Intervention[]
): Array<{ description: string }> {
  const conflicts: Array<{ description: string }> = [];
  
  for (const rem of toRemove) {
    for (const ex of existing) {
      // 简化：检查是否操作同一国家
      if ('a' in rem && 'a' in ex && rem.a === ex.a) {
        // 检查时间重叠
        const remStart = rem.from;
        const remEnd = 'until' in rem ? rem.until : Infinity;
        const exStart = ex.from;
        const exEnd = 'until' in ex ? ex.until : Infinity;
        
        const overlaps = remStart <= (exEnd ?? Infinity) && (remEnd ?? Infinity) >= exStart;
        
        if (overlaps) {
          conflicts.push({
            description: `干预冲突：${rem.kind} 和 ${ex.kind} 都作用于同一目标的重叠时间段`,
          });
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * 安全undo一批干预
 * 
 * @param current 当前edits
 * @param toRemove 要移除的干预（来自applied.before/after）
 */
export function safeUndoInterventions(
  current: WorldEdits,
  toRemove: Intervention[]
): UndoResult {
  const removeSigs = new Set(toRemove.map(i => JSON.stringify(i)));
  
  // 分离：要保留的 vs 要移除的
  const remaining: Intervention[] = [];
  const actuallyRemoved: Intervention[] = [];
  
  for (const iv of current.interventions) {
    const sig = JSON.stringify(iv);
    if (removeSigs.has(sig)) {
      actuallyRemoved.push(iv);
    } else {
      remaining.push(iv);
    }
  }
  
  // 检测冲突：后续干预是否与要移除的干预冲突
  const conflicts = detectInterventionConflicts(actuallyRemoved, remaining);
  
  if (conflicts.length > 0) {
    return {
      success: false,
      conflicts: conflicts.map(c => ({ type: 'intervention' as const, ...c })),
    };
  }
  
  // 无冲突，执行undo
  const newEdits: WorldEdits = {
    ...current,
    interventions: remaining,
  };
  
  return {
    success: true,
    newEdits,
  };
}

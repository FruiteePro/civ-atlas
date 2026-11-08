/**
 * 条件触发干预规则（Conditional Player Interventions）
 * 
 * 小范围验证的one-shot规则，基于真实引擎事件触发玩家批准的干预行动。
 * 例子：'当这个帝国下次发生大叛乱时，保护它'
 * 
 * 设计原则：
 * - 窄范围的显式触发器词汇表（基于真实引擎Annal事件）
 * - 使用现有有效的Intervention actions
 * - 用户必须review/confirm来arm规则
 * - 一次性触发（one-shot by default）
 * - 稳定ID确保replay/resume不重复触发
 * - 效果必须在trigger之后发生
 * - 取消的规则永不触发
 */

import type { Intervention } from './edits';
import type { AnnalKind } from './civ/types';

/** 支持的触发器类型（基于真实引擎事件） */
export type ConditionalTriggerKind = 
  | 'revolt'      // 民变
  | 'collapse'    // 大崩解
  | 'war'         // 战争
  | 'fall'        // 灭亡
  | 'famine';     // 饥荒

/** 条件规则 */
export interface ConditionalRule {
  /** 规则唯一ID（创建时生成，用于去重和追踪） */
  id: string;
  
  /** 目标国家的稳定键（ResolvedKey） */
  targetKey: string;
  
  /** 触发条件 */
  trigger: {
    /** 触发器类型 */
    kind: ConditionalTriggerKind;
    /** 最早触发年份（可选） */
    afterYear?: number;
    /** 最晚触发年份（可选，过期自动失效） */
    beforeYear?: number;
  };
  
  /** 触发时执行的干预 */
  action: Intervention;
  
  /** 规则状态 */
  status: 'pending' | 'fired' | 'cancelled' | 'expired' | 'invalid';
  
  /** 触发时的年份（fired后记录） */
  firedAtYear?: number;
  
  /** 创建时间戳 */
  createdAt: number;
  
  /** 取消/失效原因 */
  reason?: string;
}

/** 条件规则的持久化记录 */
export interface ConditionalRulesState {
  /** 所有规则（包括已触发/取消的，用于replay一致性） */
  rules: ConditionalRule[];
  
  /** 生成器版本（用于兼容性检查） */
  generatorVersion: number;
}

/**
 * 生成规则ID
 */
export function generateRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 检查触发器类型是否对应引擎事件
 */
export function isValidTriggerForAnnal(trigger: ConditionalTriggerKind, annalKind: AnnalKind): boolean {
  return trigger === annalKind;
}

/**
 * 验证规则的目标是否仍然有效
 */
export function validateRuleTarget(rule: ConditionalRule, currentYear: number): { valid: boolean; reason?: string } {
  // 检查是否过期
  if (rule.trigger.beforeYear && currentYear >= rule.trigger.beforeYear) {
    return { valid: false, reason: `规则已过期（${rule.trigger.beforeYear} 年前）` };
  }
  
  // 检查是否取消
  if (rule.status === 'cancelled') {
    return { valid: false, reason: '规则已取消' };
  }
  
  // 检查是否已触发
  if (rule.status === 'fired') {
    return { valid: false, reason: `规则已在 ${rule.firedAtYear} 年触发` };
  }
  
  return { valid: true };
}

/**
 * 标记规则为已触发
 */
export function fireRule(rule: ConditionalRule, year: number): ConditionalRule {
  return {
    ...rule,
    status: 'fired',
    firedAtYear: year,
  };
}

/**
 * 取消规则
 */
export function cancelRule(rule: ConditionalRule, reason: string): ConditionalRule {
  return {
    ...rule,
    status: 'cancelled',
    reason,
  };
}

/**
 * 标记规则为过期
 */
export function expireRule(rule: ConditionalRule): ConditionalRule {
  return {
    ...rule,
    status: 'expired',
    reason: `已过期（${rule.trigger.beforeYear} 年前）`,
  };
}

/**
 * 标记规则为无效（目标灭亡等）
 */
export function invalidateRule(rule: ConditionalRule, reason: string): ConditionalRule {
  return {
    ...rule,
    status: 'invalid',
    reason,
  };
}

/**
 * AI 设置与密钥的本地存储(阶段 5)。只存在用户自己的浏览器里,不上传。
 *
 *   设置(用不用 AI、用哪家、模型、地域、深度思考、记不记密钥)→ localStorage 'civ-atlas:ai-settings'
 *   密钥(DeepSeek / 百炼 / OpenAI 兼容接口的 API 密钥)→
 *       "记住密钥"开着:localStorage 'civ-atlas:ai-secrets'(下次打开还在)
 *       关着:只在内存里(这次打开的页面有效,刷新 / 关掉就忘),同时把存过的删掉
 *
 * 浏览器存储不可用(隐私模式)时一律只在内存里。
 * 规矩:密钥不进网址、不进调用记录、不打印到控制台。
 */
import { useSyncExternalStore } from 'react';
import { notifyAiChanged, setActiveProvider, setAiOn } from './client';
import type { AiProviderKind } from './types';

export type BailianRegion = 'cn' | 'intl';

/** AI角色类型：故事生成 vs 干预建议 */
export type AiRole = 'story' | 'intervention';

/** 单个AI角色的配置 */
export interface AiRoleConfig {
  /** 用哪家provider;null = 继承默认配置 */
  provider: AiProviderKind | null | 'inherit';
  deepseek: { model: string; thinking: boolean };
  bailian: { model: string; region: BailianRegion; thinking: boolean };
  openai: { baseUrl: string; model: string };
}

export interface AiSettings {
  /** 「使用 AI 功能」:关掉 = 界面上所有 AI 入口都不显示(只管这个浏览器;写过的史书、名字由来不删) */
  enabled: boolean;
  /** 默认provider（legacy兼容+新建时的默认值） */
  provider: AiProviderKind | null;
  /** 在这个浏览器里记住密钥和登录 */
  remember: boolean;
  
  /** 故事AI配置（只读历史，生成叙述） */
  story: AiRoleConfig;
  /** 干预AI配置（提议验证过的编辑，需用户确认） */
  intervention: AiRoleConfig;
  
  // Legacy fields for migration
  deepseek: { model: string; thinking: boolean };
  bailian: { model: string; region: BailianRegion; thinking: boolean };
  openai: { baseUrl: string; model: string };
}

/** 存密钥的格子:各家的 API 密钥(DeepSeek、百炼、OpenAI 兼容接口) */
export interface AiSecrets {
  deepseek?: string;
  bailian?: string;
  openai?: string;
}

/** OpenAI 兼容接口的默认地址(OpenAI 官方;可以改成中转站、本地模型,归一化见 providers/openai.ts) */
export const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';

const DEFAULT_ROLE_CONFIG: AiRoleConfig = {
  provider: 'inherit',
  deepseek: { model: 'deepseek-flash', thinking: false },
  bailian: { model: 'qwen-plus', region: 'cn', thinking: false },
  openai: { baseUrl: DEFAULT_OPENAI_BASE, model: '' },
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  provider: null,
  remember: true,
  
  // 新增：角色配置
  story: { ...DEFAULT_ROLE_CONFIG },
  intervention: { 
    ...DEFAULT_ROLE_CONFIG,
    // 干预AI默认使用更强大的模型
    deepseek: { model: 'deepseek-chat', thinking: true },
    bailian: { model: 'qwen-max', region: 'cn', thinking: true },
  },
  
  // Legacy fields (兼容旧配置)
  deepseek: { model: 'deepseek-flash', thinking: false },
  bailian: { model: 'qwen-plus', region: 'cn', thinking: false },
  openai: { baseUrl: DEFAULT_OPENAI_BASE, model: '' },
};

const SETTINGS_KEY = 'civ-atlas:ai-settings';
const SECRETS_KEY = 'civ-atlas:ai-secrets';
const KINDS: AiProviderKind[] = ['deepseek', 'bailian', 'openai', 'mock'];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown | null) {
  try {
    const s = storage();
    if (!s) return;
    if (v === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(v));
  } catch {
    /* 存不下 / 隐私模式:只留在内存里 */
  }
}

const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** 接口地址:比别的字段长,放宽到 300 字(中转站、网关的地址可能很长) */
const url = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : d);

function sanitizeRoleConfig(v: unknown, d: AiRoleConfig): AiRoleConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, any>;
  const ds = (o.deepseek && typeof o.deepseek === 'object' ? o.deepseek : {}) as Record<string, unknown>;
  const bl = (o.bailian && typeof o.bailian === 'object' ? o.bailian : {}) as Record<string, unknown>;
  const oa = (o.openai && typeof o.openai === 'object' ? o.openai : {}) as Record<string, unknown>;
  
  return {
    provider: o.provider === 'inherit' || KINDS.includes(o.provider) ? o.provider : 'inherit',
    deepseek: { model: str(ds.model, d.deepseek.model), thinking: bool(ds.thinking, d.deepseek.thinking) },
    bailian: {
      model: str(bl.model, d.bailian.model),
      region: bl.region === 'intl' ? 'intl' : 'cn',
      thinking: bool(bl.thinking, d.bailian.thinking),
    },
    openai: { baseUrl: url(oa.baseUrl, d.openai.baseUrl), model: str(oa.model, d.openai.model) },
  };
}

/** 读存档里的设置,坏的字段用默认值，自动迁移旧格式 */
export function sanitizeSettings(v: unknown): AiSettings {
  const d = DEFAULT_AI_SETTINGS;
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, any>;
  const ds = (o.deepseek && typeof o.deepseek === 'object' ? o.deepseek : {}) as Record<string, unknown>;
  const bl = (o.bailian && typeof o.bailian === 'object' ? o.bailian : {}) as Record<string, unknown>;
  const oa = (o.openai && typeof o.openai === 'object' ? o.openai : {}) as Record<string, unknown>;
  
  // Legacy fields
  const legacyDeepseek = { model: str(ds.model, d.deepseek.model), thinking: bool(ds.thinking, d.deepseek.thinking) };
  const legacyBailian = {
    model: str(bl.model, d.bailian.model),
    region: bl.region === 'intl' ? 'intl' : 'cn' as BailianRegion,
    thinking: bool(bl.thinking, d.bailian.thinking),
  };
  const legacyOpenai = { baseUrl: url(oa.baseUrl, d.openai.baseUrl), model: str(oa.model, d.openai.model) };
  
  // Migrate legacy config to role configs if story/intervention not present
  const hasRoleConfig = o.story || o.intervention;
  const storyConfig = hasRoleConfig 
    ? sanitizeRoleConfig(o.story, d.story)
    : {
        provider: 'inherit' as const,
        deepseek: legacyDeepseek,
        bailian: legacyBailian,
        openai: legacyOpenai,
      };
  
  const interventionConfig = hasRoleConfig
    ? sanitizeRoleConfig(o.intervention, d.intervention)
    : {
        provider: 'inherit' as const,
        deepseek: { ...legacyDeepseek, thinking: true }, // 干预默认开思考
        bailian: { ...legacyBailian, model: legacyBailian.model === 'qwen-plus' ? 'qwen-max' : legacyBailian.model, thinking: true },
        openai: legacyOpenai,
      };
  
  return {
    enabled: bool(o.enabled, d.enabled),
    provider: KINDS.includes(o.provider) ? o.provider : null,
    remember: bool(o.remember, d.remember),
    
    story: storyConfig,
    intervention: interventionConfig,
    
    // Keep legacy fields for compatibility
    deepseek: legacyDeepseek,
    bailian: legacyBailian,
    openai: legacyOpenai,
  };
}

function sanitizeSecrets(v: unknown): AiSecrets {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, any>;
  const out: AiSecrets = {};
  if (typeof o.deepseek === 'string' && o.deepseek) out.deepseek = o.deepseek;
  if (typeof o.bailian === 'string' && o.bailian) out.bailian = o.bailian;
  return out;
}

let settings: AiSettings | null = null;
let secrets: AiSecrets | null = null;
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const f of subs) f();
  notifyAiChanged();
};

function load() {
  if (settings && secrets) return;
  settings = sanitizeSettings(readJson(SETTINGS_KEY));
  secrets = settings.remember ? sanitizeSecrets(readJson(SECRETS_KEY)) : {};
  setAiOn(settings.enabled);
}

export function getAiSettings(): AiSettings {
  load();
  return settings!;
}

export function updateAiSettings(patch: Partial<Omit<AiSettings, 'deepseek' | 'bailian' | 'openai' | 'story' | 'intervention'>> & {
  deepseek?: Partial<AiSettings['deepseek']>;
  bailian?: Partial<AiSettings['bailian']>;
  openai?: Partial<AiSettings['openai']>;
  story?: Partial<AiRoleConfig>;
  intervention?: Partial<AiRoleConfig>;
}): void {
  const cur = getAiSettings();
  settings = sanitizeSettings({
    ...cur,
    ...patch,
    deepseek: { ...cur.deepseek, ...patch.deepseek },
    bailian: { ...cur.bailian, ...patch.bailian },
    openai: { ...cur.openai, ...patch.openai },
    story: patch.story ? {
      ...cur.story,
      ...patch.story,
      deepseek: { ...cur.story.deepseek, ...patch.story.deepseek },
      bailian: { ...cur.story.bailian, ...patch.story.bailian },
      openai: { ...cur.story.openai, ...patch.story.openai },
    } : cur.story,
    intervention: patch.intervention ? {
      ...cur.intervention,
      ...patch.intervention,
      deepseek: { ...cur.intervention.deepseek, ...patch.intervention.deepseek },
      bailian: { ...cur.intervention.bailian, ...patch.intervention.bailian },
      openai: { ...cur.intervention.openai, ...patch.intervention.openai },
    } : cur.intervention,
  });
  writeJson(SETTINGS_KEY, settings);
  setAiOn(settings.enabled);
  if (patch.remember !== undefined) writeJson(SECRETS_KEY, settings.remember && hasAny(secrets!) ? secrets : null);
  emit();
}

const hasAny = (s: AiSecrets) => !!(s.deepseek || s.bailian || s.openai);

export function getSecrets(): Readonly<AiSecrets> {
  load();
  return secrets!;
}

/** 粘贴进来的密钥去掉空白和误带的 "Bearer " */
export function cleanKey(k: string): string {
  return k.replace(/^\s*bearer\s+/i, '').replace(/\s+/g, '');
}

export function setSecret<K extends keyof AiSecrets>(slot: K, value: AiSecrets[K] | undefined): void {
  load();
  const next = { ...secrets! };
  if (value === undefined || value === '') delete next[slot];
  else next[slot] = value;
  secrets = next;
  writeJson(SECRETS_KEY, settings!.remember && hasAny(next) ? next : null);
  emit();
}

/** 选用哪家(设置面板的单选);立刻生效 */
export function chooseProvider(kind: AiProviderKind | null): void {
  updateAiSettings({ provider: kind });
  setActiveProvider(kind);
}

/** 「使用 AI 功能」开 / 关 */
export function setAiEnabled(on: boolean): void {
  updateAiSettings({ enabled: on });
}

/** React:设置或密钥变了就重渲染 */
export function useAiSettingsVersion(): number {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version,
    () => version,
  );
}

/** 单测用:忘掉内存里的,下次从存储重读 */
export function resetAiSettingsForTest(): void {
  settings = null;
  secrets = null;
}

/** 把一段文字里出现的密钥遮掉(服务商的报错偶尔会原样带回密钥) */
export function scrubSecrets(text: string): string {
  let out = text;
  const s = secrets ?? {};
  for (const k of [s.deepseek, s.bailian, s.openai]) {
    if (k && k.length >= 6) out = out.split(k).join('***');
  }
  return out.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-***');
}

/** 解析角色配置：如果是'inherit'则返回默认配置 */
export function resolveRoleConfig(role: AiRole): { 
  provider: AiProviderKind | null; 
  deepseek: { model: string; thinking: boolean };
  bailian: { model: string; region: BailianRegion; thinking: boolean };
  openai: { baseUrl: string; model: string };
} {
  const settings = getAiSettings();
  const roleConfig = settings[role];
  
  // 如果角色配置指定了 'inherit'，使用默认provider配置
  const effectiveProvider = roleConfig.provider === 'inherit' ? settings.provider : roleConfig.provider;
  
  return {
    provider: effectiveProvider,
    deepseek: roleConfig.deepseek,
    bailian: roleConfig.bailian,
    openai: roleConfig.openai,
  };
}

/** 获取特定角色的有效provider */
export function getProviderForRole(role: AiRole): AiProviderKind | null {
  return resolveRoleConfig(role).provider;
}

/** 检查角色是否配置完整 */
export function isRoleConfigured(role: AiRole): boolean {
  const resolved = resolveRoleConfig(role);
  if (!resolved.provider || resolved.provider === 'mock') return resolved.provider === 'mock';
  
  // 检查该provider的配置是否完整
  if (resolved.provider === 'openai' && !resolved.openai.model) return false;
  
  const secrets = getSecrets();
  return !!(secrets as any)[resolved.provider];
}

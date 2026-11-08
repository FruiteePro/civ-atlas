/**
 * AI角色配置测试：故事AI vs 干预AI
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { 
  sanitizeSettings, 
  resolveRoleConfig, 
  getProviderForRole,
  isRoleConfigured,
  resetAiSettingsForTest,
  DEFAULT_AI_SETTINGS,
  type AiSettings 
} from '../src/ai/settings';

describe('AI角色配置', () => {
  beforeEach(() => {
    resetAiSettingsForTest();
  });

  it('应该正确迁移旧格式配置到新角色配置', () => {
    // 模拟旧格式配置（没有story/intervention字段）
    const legacyConfig = {
      enabled: true,
      provider: 'deepseek' as const,
      remember: true,
      deepseek: { model: 'deepseek-flash', thinking: false },
      bailian: { model: 'qwen-plus', region: 'cn' as const, thinking: false },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4' },
    };

    const migrated = sanitizeSettings(legacyConfig);

    // 验证story配置继承了legacy配置
    expect(migrated.story.provider).toBe('inherit');
    expect(migrated.story.deepseek.model).toBe('deepseek-flash');
    expect(migrated.story.deepseek.thinking).toBe(false);

    // 验证intervention配置使用更强模型并开启思考
    expect(migrated.intervention.provider).toBe('inherit');
    expect(migrated.intervention.deepseek.thinking).toBe(true);
    expect(migrated.intervention.bailian.model).toBe('qwen-max');
    expect(migrated.intervention.bailian.thinking).toBe(true);

    // 验证legacy字段保持不变
    expect(migrated.provider).toBe('deepseek');
    expect(migrated.deepseek.model).toBe('deepseek-flash');
  });

  it('应该保留新格式配置', () => {
    const newConfig: Partial<AiSettings> = {
      enabled: true,
      provider: 'deepseek' as const,
      remember: true,
      story: {
        provider: 'bailian' as const,
        deepseek: { model: 'deepseek-flash', thinking: false },
        bailian: { model: 'qwen-plus', region: 'cn' as const, thinking: false },
        openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
      },
      intervention: {
        provider: 'deepseek' as const,
        deepseek: { model: 'deepseek-reasoner', thinking: true },
        bailian: { model: 'qwen-max', region: 'cn' as const, thinking: true },
        openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
      },
      deepseek: { model: 'deepseek-flash', thinking: false },
      bailian: { model: 'qwen-plus', region: 'cn' as const, thinking: false },
      openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
    };

    const sanitized = sanitizeSettings(newConfig);

    // 验证角色配置被保留
    expect(sanitized.story.provider).toBe('bailian');
    expect(sanitized.intervention.provider).toBe('deepseek');
    expect(sanitized.intervention.deepseek.model).toBe('deepseek-reasoner');
  });

  it('配置应该支持inherit选项', () => {
    const config = sanitizeSettings({
      provider: 'deepseek' as const,
      story: {
        provider: 'inherit' as const,
        deepseek: { model: 'deepseek-flash', thinking: false },
        bailian: { model: 'qwen-plus', region: 'cn' as const, thinking: false },
        openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
      },
      deepseek: { model: 'deepseek-flash', thinking: false },
      bailian: { model: 'qwen-plus', region: 'cn' as const, thinking: false },
      openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
    });

    // 'inherit'应该被保留
    expect(config.story.provider).toBe('inherit');
    expect(config.story.deepseek.model).toBe('deepseek-flash');
  });

  it('配置应该支持指定的provider', () => {
    const config = sanitizeSettings({
      provider: 'deepseek' as const,
      intervention: {
        provider: 'bailian' as const,
        deepseek: { model: 'deepseek-flash', thinking: false },
        bailian: { model: 'qwen-max', region: 'cn' as const, thinking: true },
        openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
      },
      deepseek: { model: 'deepseek-flash', thinking: false },
      bailian: { model: 'qwen-max', region: 'cn' as const, thinking: true },
      openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
    });
    
    // 应该保留指定的provider
    expect(config.intervention.provider).toBe('bailian');
    expect(config.intervention.bailian.model).toBe('qwen-max');
    expect(config.intervention.bailian.thinking).toBe(true);
  });

  it('应该处理无效配置', () => {
    const invalidConfig = {
      enabled: true,
      provider: 'invalid-provider', // 无效provider
      story: {
        provider: 'also-invalid',
        deepseek: 'not-an-object',
      },
    };

    const sanitized = sanitizeSettings(invalidConfig);

    // 无效provider应该变为null
    expect(sanitized.provider).toBeNull();
    // 无效角色provider应该变为'inherit'
    expect(sanitized.story.provider).toBe('inherit');
    // 无效对象应该使用默认值
    expect(sanitized.story.deepseek).toEqual(DEFAULT_AI_SETTINGS.story.deepseek);
  });
});

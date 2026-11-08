/**
 * 实际UI验证：使用正确的hook和生成配置
 * 
 * 修复：
 * - __wf.civ不存在，正确检查__wf.ready和__wfCiv
 * - 使用支持的URL参数启用civ generation
 * - 通过实际按钮交互打开设置/外交
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './lib/devserver';

const SCREENSHOTS_DIR = 'snaps/ui-actual';

async function main() {
  fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const dev = await startDevServer();
  console.log(`✓ Dev server: ${dev.url}`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  const errors: string[] = [];
  const logs: string[] = [];
  
  page.on('console', msg => {
    const text = msg.text();
    logs.push(`${msg.type()}: ${text}`);
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', e => errors.push(`PAGE ERROR: ${e.message}`));
  
  try {
    // 1. 测试AI设置（无需civ）
    console.log('\n=== 测试1: AI设置界面 ===');
    await page.goto(`${dev.url}/?ai=mock`);
    
    await page.waitForSelector('body', { timeout: 5000 });
    console.log('✓ 页面已加载');
    
    // 等待React渲染
    await page.waitForTimeout(1000);
    
    // 查找并点击可能的设置触发器
    const settingsTriggers = [
      'button:has-text("设置")',
      'button[aria-label*="设置"]',
      '[data-testid="settings-button"]',
      'button[title*="设置"]',
    ];
    
    let settingsFound = false;
    for (const selector of settingsTriggers) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.count() > 0) {
          console.log(`找到触发器: ${selector}`);
          settingsFound = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 如果没找到按钮，尝试通过console调用
    if (!settingsFound) {
      console.log('⚠️  未找到UI触发器，尝试调用openAiSettings()');
      await page.evaluate(() => {
        const w = window as any;
        if (w.openAiSettings) {
          w.openAiSettings();
        }
      });
      await page.waitForTimeout(500);
    }
    
    // 检查对话框是否打开
    const dialogVisible = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"], .dialog, .modal, [data-dialog]');
      return dialogs.length > 0;
    });
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-settings-attempt.png') });
    console.log(`AI设置对话框: ${dialogVisible ? '已打开' : '未找到'}`);
    
    // 2. 测试world generation + diplomacy
    console.log('\n=== 测试2: World Generation + 外交页面 ===');
    
    // 使用seed=7，较快生成
    await page.goto(`${dev.url}/?seed=7&ai=mock`);
    await page.waitForSelector('body', { timeout: 5000 });
    
    // 等待world generation
    console.log('等待world generation...');
    const genResult = await page.waitForFunction(() => {
      const wf = (window as any).__wf;
      const wfCiv = (window as any).__wfCiv;
      return {
        wfExists: !!wf,
        wfReady: wf?.ready === true,
        civExists: !!wfCiv,
        civReady: wfCiv?.ready === true,
      };
    }, { timeout: 60000 });
    
    const result = await genResult.jsonValue();
    console.log('Generation状态:', result);
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-world-generated.png') });
    
    if (result.wfReady && result.civReady) {
      console.log('✓ World和Civ均已生成');
      
      // 尝试打开外交页面
      console.log('尝试打开外交页面...');
      
      // 查找可能的概览/外交触发器
      const overviewTriggers = [
        'button:has-text("外交")',
        'button:has-text("概览")',
        '.overview-button',
        '[data-act="overview"]',
      ];
      
      for (const selector of overviewTriggers) {
        try {
          const btn = page.locator(selector).first();
          if (await btn.count() > 0) {
            await btn.click({ timeout: 2000 });
            await page.waitForTimeout(1000);
            
            const overviewOpen = await page.evaluate(() => {
              return document.querySelectorAll('.overview, [data-overview], .diplomacy').length > 0;
            });
            
            if (overviewOpen) {
              console.log(`✓ 通过"${selector}"打开了概览`);
              await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-diplomacy.png') });
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
    } else {
      console.log('⚠️  World/Civ generation未完成');
    }
    
    // 3. 报告console日志
    console.log('\n=== Console日志 ===');
    console.log(`总计: ${logs.length}条, 错误: ${errors.length}条`);
    if (errors.length > 0) {
      console.log('错误列表:');
      errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    }
    
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'console-logs.txt'),
      logs.join('\n')
    );
    
    // 4. 检查实际生成的hooks
    const hooks = await page.evaluate(() => {
      const w = window as any;
      return {
        __wf: w.__wf ? Object.keys(w.__wf) : null,
        __wfCiv: w.__wfCiv ? Object.keys(w.__wfCiv) : null,
        __wfView: w.__wfView ? Object.keys(w.__wfView) : null,
        openAiSettings: typeof w.openAiSettings,
      };
    });
    
    console.log('\n=== 实际可用的hooks ===');
    console.log(JSON.stringify(hooks, null, 2));
    
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'available-hooks.json'),
      JSON.stringify(hooks, null, 2)
    );
    
    console.log(`\n✅ 验证完成，截图保存在: ${SCREENSHOTS_DIR}/`);
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    files.forEach(f => {
      const size = fs.statSync(path.join(SCREENSHOTS_DIR, f)).size;
      console.log(`   - ${f} (${(size/1024).toFixed(1)} KB)`);
    });
    
  } catch (e) {
    console.error('❌ 验证失败:', e);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-state.png') }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
    await dev.close();
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});

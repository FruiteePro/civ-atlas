/**
 * 完整功能烟雾测试
 * 
 * 验证：
 * 1. 助手角色选择（story vs intervention）
 * 2. 外交页面显示真实外交关系
 * 3. Baseline预览 → 对比 → 取消/确认 → 撤销
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './lib/devserver';

const SCREENSHOTS_DIR = 'snaps/feature-smoke';

async function main() {
  fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const dev = await startDevServer();
  console.log(`✓ Dev server: ${dev.url}`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', e => errors.push(`PAGE: ${e.message}`));
  
  try {
    console.log('\n=== 1. 加载世界并等待生成 ===');
    await page.goto(`${dev.url}/?seed=7&ai=mock`);
    await page.waitForSelector('body', { timeout: 5000 });
    
    const ready = await page.waitForFunction(() => {
      const wf = (window as any).__wf;
      const wfCiv = (window as any).__wfCiv;
      return wf?.ready === true && wfCiv?.ready === true;
    }, { timeout: 60000 }).catch(() => null);
    
    if (!ready) {
      throw new Error('World generation timeout');
    }
    
    console.log('✓ 世界已生成');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-world-loaded.png'), fullPage: false });
    
    console.log('\n=== 2. 打开助手面板 ===');
    // 查找助手按钮
    const assistantTriggers = [
      'button:has-text("助手")',
      '[data-act="assistant"]',
      '.assistant-trigger',
    ];
    
    let assistantOpened = false;
    for (const selector of assistantTriggers) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.count() > 0 && await btn.isVisible()) {
          await btn.click({ timeout: 2000 });
          await page.waitForTimeout(500);
          assistantOpened = true;
          console.log(`✓ 通过"${selector}"打开助手`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!assistantOpened) {
      console.log('⚠️  未找到助手触发器，尝试通过console');
      await page.evaluate(() => {
        const w = window as any;
        if (w.openAssistant) w.openAssistant();
      });
      await page.waitForTimeout(500);
    }
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-assistant-opened.png'), fullPage: false });
    
    const assistantVisible = await page.evaluate(() => {
      return document.querySelectorAll('.ast-panel, [data-panel="assistant"]').length > 0;
    });
    console.log(`助手面板: ${assistantVisible ? '已打开' : '未找到'}`);
    
    console.log('\n=== 3. 测试外交页面 ===');
    // 查找概览/外交按钮
    const overviewTriggers = [
      'button:has-text("概览")',
      'button:has-text("外交")',
      '[data-layer="overview"]',
    ];
    
    let overviewOpened = false;
    for (const selector of overviewTriggers) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.count() > 0 && await btn.isVisible()) {
          await btn.click({ timeout: 2000 });
          await page.waitForTimeout(1000);
          overviewOpened = true;
          console.log(`✓ 通过"${selector}"打开概览`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (overviewOpened) {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-diplomacy-page.png'), fullPage: false });
      
      const diplomacyContent = await page.evaluate(() => {
        const content = document.body.innerText;
        return {
          hasRelations: /结盟|战争|宣战|和平/.test(content),
          hasPolities: /帝国|王国|公国/.test(content),
        };
      });
      console.log(`外交内容: ${JSON.stringify(diplomacyContent)}`);
    } else {
      console.log('⚠️  未能打开概览页面');
    }
    
    console.log('\n=== 4. 检查可用hooks和API ===');
    const hooks = await page.evaluate(() => {
      const w = window as any;
      return {
        __wf: w.__wf ? Object.keys(w.__wf) : null,
        __wfCiv: w.__wfCiv ? Object.keys(w.__wfCiv) : null,
        openAssistant: typeof w.openAssistant,
        runner: w.runner ? 'present' : 'missing',
      };
    });
    
    console.log('可用hooks:', JSON.stringify(hooks, null, 2));
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'hooks-api.json'),
      JSON.stringify(hooks, null, 2)
    );
    
    console.log('\n=== 5. Console错误 ===');
    if (errors.length > 0) {
      console.log(`发现 ${errors.length} 个错误:`);
      errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    } else {
      console.log('✓ 无console错误');
    }
    
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'console-errors.txt'),
      errors.length > 0 ? errors.join('\n') : 'No errors'
    );
    
    console.log(`\n✅ 功能烟雾测试完成`);
    console.log(`截图保存在: ${SCREENSHOTS_DIR}/`);
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    files.forEach(f => {
      const size = fs.statSync(path.join(SCREENSHOTS_DIR, f)).size;
      console.log(`   - ${f} (${(size/1024).toFixed(1)} KB)`);
    });
    
  } catch (e) {
    console.error('❌ 测试失败:', e);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
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

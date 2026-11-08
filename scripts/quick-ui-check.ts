/**
 * 快速UI验证：使用项目现有的visual test fixture和方法
 * 不等待完整world generation，直接验证UI元素
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './lib/devserver';

const SCREENSHOTS_DIR = 'snaps/ui-validation';

async function main() {
  fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const dev = await startDevServer();
  console.log(`✓ Dev server: ${dev.url}`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  const errors: string[] = [];
  const logs: string[] = [];
  
  page.on('console', msg => {
    const text = msg.text();
    logs.push(`${msg.type()}: ${text}`);
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', e => errors.push(`PAGE ERROR: ${e.message}`));
  
  try {
    // 1. 加载页面（使用小seed快速生成）
    console.log('\n=== 测试1: 页面加载 ===');
    await page.goto(`${dev.url}/?seed=7&ai=mock`);
    
    // 等待基础DOM（不等待world generation）
    await page.waitForSelector('body', { timeout: 5000 });
    console.log('✓ 页面DOM已加载');
    
    // 检查__wf hook是否存在
    const hasWf = await page.evaluate(() => typeof (window as any).__wf !== 'undefined');
    console.log(`__wf hook: ${hasWf ? '存在' : '不存在'}`);
    
    // 截图1: 初始页面
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-initial-load.png') });
    console.log('✓ 截图: 初始加载');
    
    // 2. 尝试打开AI设置（不依赖world generation）
    console.log('\n=== 测试2: AI设置对话框 ===');
    
    // 查找可能触发设置的元素
    const settingsTriggers = [
      'button:has-text("AI")',
      '[data-act="ai-settings"]',
      '.settings-button',
      'button[title*="设置"]',
    ];
    
    let settingsOpened = false;
    for (const selector of settingsTriggers) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.count() > 0) {
          await btn.click({ timeout: 1000 });
          await page.waitForTimeout(500);
          
          const dialog = await page.locator('[data-testid="ai-dialog"]').count();
          if (dialog > 0) {
            console.log(`✓ 通过"${selector}"打开了AI设置`);
            settingsOpened = true;
            break;
          }
        }
      } catch (e) {
        // 继续尝试
      }
    }
    
    if (settingsOpened) {
      // 截图2: AI设置 - 故事生成tab
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-ai-settings-story.png') });
      console.log('✓ 截图: AI设置-故事生成');
      
      // 切换到干预建议tab
      const interventionTab = page.locator('[data-role-tab="intervention"]');
      if (await interventionTab.count() > 0) {
        await interventionTab.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-ai-settings-intervention.png') });
        console.log('✓ 截图: AI设置-干预建议');
      }
      
      // 关闭对话框
      const closeBtn = page.locator('.ai-x').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    } else {
      console.log('⚠️  未找到AI设置触发按钮，使用localStorage直接设置');
      await page.evaluate(() => {
        localStorage.setItem('civ-atlas:ai-settings', JSON.stringify({
          enabled: true,
          provider: 'mock',
          story: { provider: 'mock' },
          intervention: { provider: 'mock' }
        }));
      });
    }
    
    // 3. 等待并测试world+diplomacy（使用seed 7，更快）
    console.log('\n=== 测试3: 外交页面（seed 7） ===');
    
    // 检查world generation状态
    const checkWorld = async () => {
      return await page.evaluate(() => {
        const wf: any = (window as any).__wf;
        if (!wf) return { status: 'no_wf', ready: false };
        if (!wf.ready) return { status: 'not_ready', ready: false };
        if (!wf.civ) return { status: 'no_civ', ready: true };
        return { 
          status: 'ready', 
          ready: true, 
          viable: wf.civ.viable,
          polityCount: wf.civ.polities?.length ?? 0 
        };
      });
    };
    
    // 轮询world generation（最多30秒）
    const startTime = Date.now();
    let worldState = await checkWorld();
    
    while (!worldState.ready && Date.now() - startTime < 30000) {
      await page.waitForTimeout(1000);
      worldState = await checkWorld();
      console.log(`  World状态: ${worldState.status}`);
    }
    
    console.log(`World生成: ${JSON.stringify(worldState)}`);
    
    if (worldState.ready && worldState.status === 'ready' && (worldState as any).viable) {
      console.log(`✓ 文明已生成 (${(worldState as any).polityCount}个政权)`);
      
      // 尝试打开外交页面
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-world-ready.png') });
      console.log('✓ 截图: 世界已生成');
      
      // 查找并点击概览触发器
      const overviewTriggers = [
        'button:has-text("全部")',
        '.world-name',
        '[data-act="overview"]',
      ];
      
      for (const selector of overviewTriggers) {
        try {
          const elem = page.locator(selector).first();
          if (await elem.count() > 0) {
            await elem.click({ timeout: 2000 });
            await page.waitForTimeout(1000);
            
            const overview = await page.locator('.world-overview').count();
            if (overview > 0) {
              console.log(`✓ 通过"${selector}"打开了概览`);
              
              // 点击外交tab
              const diplomacyTab = page.locator('button[data-tab="diplomacy"]').first();
              if (await diplomacyTab.count() > 0) {
                await diplomacyTab.click();
                await page.waitForTimeout(500);
                
                await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-diplomacy-page.png') });
                console.log('✓ 截图: 外交页面');
              }
              
              break;
            }
          }
        } catch (e) {
          // 继续
        }
      }
    } else {
      console.log(`⚠️  World未在30秒内生成完成: ${worldState.status}`);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-world-timeout.png') });
    }
    
    // 4. 报告console日志
    console.log('\n=== Console日志 ===');
    console.log(`总计: ${logs.length}条, 错误: ${errors.length}条`);
    if (errors.length > 0) {
      console.log('错误列表:');
      errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
    }
    
    // 保存日志
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'console-logs.txt'),
      logs.join('\n')
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

/**
 * UI截图验证:用headless browser渲染并截图关键页面
 * - AI设置页面 (故事生成 & 干预建议两个tab)
 * - 外交概览页面
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { startDevServer } from './lib/devserver';

const SCREENSHOTS_DIR = 'snaps/ui-screenshots';
const SEED = 2024; // 使用seed 2024，有稳定的文明和外交关系

async function setupPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`Console error: ${msg.text()}`);
    }
  });
  
  await page.goto(url);
  
  if (errors.length > 0) {
    console.warn(`⚠️  页面有${errors.length}个错误:`, errors.slice(0, 3));
  }
  
  return page;
}

async function captureAiSettings(browser: Browser, url: string): Promise<void> {
  const page = await setupPage(browser, `${url}/?seed=${SEED}&ai=mock`);
  
  try {
    // 等待页面加载完成
    await page.waitForFunction(() => (window as any).__wf?.ready, null, { timeout: 60_000 });
    console.log('✓ 页面已加载');
    
    // 打开AI设置对话框
    await page.evaluate(() => {
      const { openAiSettings } = require('../src/ui/AiSettings');
      openAiSettings('settings');
    });
    
    // 等待对话框出现
    await page.waitForSelector('[data-testid="ai-dialog"]', { state: 'visible', timeout: 5000 });
    console.log('✓ AI设置对话框已打开');
    
    // 截图：故事生成tab
    await page.click('[data-role-tab="story"]');
    await page.waitForTimeout(500);
    const storyTab = page.locator('[data-testid="ai-dialog"]');
    await storyTab.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'ai-settings-story.png'),
      type: 'png',
    });
    console.log('✓ 已截图: AI设置-故事生成');
    
    // 截图：干预建议tab
    await page.click('[data-role-tab="intervention"]');
    await page.waitForTimeout(500);
    await storyTab.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'ai-settings-intervention.png'),
      type: 'png',
    });
    console.log('✓ 已截图: AI设置-干预建议');
    
  } catch (e) {
    console.error('❌ AI设置截图失败:', e);
    throw e;
  } finally {
    await page.close();
  }
}

async function captureDiplomacyPage(browser: Browser, url: string): Promise<void> {
  const page = await setupPage(browser, `${url}/?seed=${SEED}`);
  
  try {
    // 等待页面加载
    await page.waitForFunction(() => (window as any).__wf?.ready, null, { timeout: 60_000 });
    console.log('✓ 页面已加载');
    
    // 等待文明生成完成
    await page.waitForFunction(() => {
      const civ = (window as any).__wf?.civ;
      return civ && civ.viable && civ.polities && civ.polities.length > 0;
    }, null, { timeout: 30_000 });
    console.log('✓ 文明已生成');
    
    // 打开世界概览
    await page.evaluate(() => {
      // 通过点击侧栏的世界名或"全部X国"打开概览
      const overviewBtn = document.querySelector('[data-act="overview"]') as HTMLElement;
      if (overviewBtn) {
        overviewBtn.click();
      } else {
        // 备用方式: 直接调用 store
        const { openOverview } = require('../src/ui/overviewStore');
        openOverview();
      }
    });
    
    // 等待概览面板出现
    await page.waitForSelector('.world-overview', { state: 'visible', timeout: 5000 });
    console.log('✓ 世界概览已打开');
    
    // 点击"外交"tab
    await page.click('button[data-tab="diplomacy"]');
    await page.waitForTimeout(1000); // 等待数据加载和渲染
    
    // 截图：外交页面
    const diplomacyPanel = page.locator('.world-overview');
    await diplomacyPanel.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'diplomacy-overview.png'),
      type: 'png',
    });
    console.log('✓ 已截图: 外交概览');
    
    // 全屏截图以显示上下文
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'diplomacy-overview-fullscreen.png'),
      type: 'png',
      fullPage: false,
    });
    console.log('✓ 已截图: 外交概览-全屏');
    
  } catch (e) {
    console.error('❌ 外交页面截图失败:', e);
    throw e;
  } finally {
    await page.close();
  }
}

// ---- 主流程 ----
async function main() {
  fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const t0 = Date.now();
  const dev = await startDevServer();
  console.log(`✓ Dev server启动: ${dev.url}`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  try {
    console.log('\n=== 截图: AI设置页面 ===');
    await captureAiSettings(browser, dev.url);
    
    console.log('\n=== 截图: 外交概览页面 ===');
    await captureDiplomacyPage(browser, dev.url);
    
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ 所有截图已完成，用时 ${elapsed}s`);
    console.log(`📁 截图保存在: ${SCREENSHOTS_DIR}/`);
    
    // 列出生成的文件
    const files = fs.readdirSync(SCREENSHOTS_DIR);
    for (const f of files) {
      const stat = fs.statSync(path.join(SCREENSHOTS_DIR, f));
      console.log(`   - ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
    
  } catch (e) {
    console.error('\n❌ 截图失败:', e);
    process.exit(1);
  } finally {
    await browser.close();
    await dev.close();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

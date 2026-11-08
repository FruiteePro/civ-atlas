/**
 * 外交UI数据提取测试
 */
import { describe, expect, it } from 'vitest';
import { generateWorld, DEFAULT_PARAMS } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';

describe('外交页面数据提取', () => {
  it('应该正确提取联盟关系', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
    const civ = generateCiv(w);
    
    // 查找所有联盟事件
    const alliances = civ.annals.filter(e => e.kind === 'alliance');
    console.log(`总联盟事件数: ${alliances.length}`);
    
    // 至少应该有一些联盟形成
    expect(alliances.length).toBeGreaterThan(0);
    
    // 每个联盟应该有a和b两国
    for (const a of alliances) {
      expect(a.a).toBeGreaterThanOrEqual(0);
      expect(a.b).toBeGreaterThanOrEqual(0);
      expect(a.a).not.toBe(a.b);
    }
  });
  
  it('应该区分结盟和断盟', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 7 });
    const civ = generateCiv(w);
    
    const alliances = civ.annals.filter(e => e.kind === 'alliance');
    const unalliances = civ.annals.filter(e => e.kind === 'unally');
    
    console.log(`联盟数: ${alliances.length}, 断盟数: ${unalliances.length}`);
    
    // 应该有一些联盟形成
    expect(alliances.length).toBeGreaterThan(0);
    
    // 如果有断盟，断盟应该在联盟之后
    if (unalliances.length > 0) {
      const firstUnally = unalliances[0];
      const matchingAlliance = alliances.find(a => 
        (a.a === firstUnally.a && a.b === firstUnally.b) ||
        (a.a === firstUnally.b && a.b === firstUnally.a)
      );
      
      if (matchingAlliance) {
        expect(firstUnally.year).toBeGreaterThanOrEqual(matchingAlliance.year);
      }
    }
  });
  
  it('应该正确提取宗藩关系', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
    const civ = generateCiv(w);
    
    const submissions = civ.annals.filter(e => e.kind === 'submit');
    const defections = civ.annals.filter(e => e.kind === 'defect');
    
    console.log(`臣服事件: ${submissions.length}, 背叛事件: ${defections.length}`);
    
    // 宗藩关系应该存在
    expect(submissions.length).toBeGreaterThan(0);
    
    // 每个臣服事件应该有a（藩属）和b（宗主）
    for (const s of submissions) {
      expect(s.a).toBeGreaterThanOrEqual(0);
      expect(s.b).toBeGreaterThanOrEqual(0);
      expect(s.a).not.toBe(s.b);
    }
  });
  
  it('应该在特定年份正确过滤外交关系', () => {
    const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
    const civ = generateCiv(w);
    
    const midYear = Math.floor(civ.endYear / 2);
    
    // 统计中点年份之前的联盟
    const alliancesBefore = civ.annals.filter(e => 
      e.kind === 'alliance' && e.year <= midYear
    );
    
    // 统计中点年份之前的战争
    const warsBefore = civ.annals.filter(e => 
      e.kind === 'war' && e.year <= midYear
    );
    
    console.log(`年份${midYear}之前 - 联盟: ${alliancesBefore.length}, 战争: ${warsBefore.length}`);
    
    // 中点之前应该有一些外交活动
    expect(alliancesBefore.length + warsBefore.length).toBeGreaterThan(0);
  });
});

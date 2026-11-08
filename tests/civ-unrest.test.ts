/**
 * 动荡、饥荒、民变、大崩解(unrest.ts)。
 */
import { describe, expect, it } from 'vitest';
import { generateWorld, DEFAULT_PARAMS, type World } from '../src/gen/world';
import { generateCiv, type Civ } from '../src/gen/civ';
import { Layer } from '../src/gen/civ/types';
import { ownersAt } from '../src/gen/civ/engine/timeline';
import { polityModelOf } from '../src/gen/civ/polities';
import { capitalAt, polityAlive, populationAt } from '../src/gen/civ/growth';
import { unrestStats } from '../src/gen/civ/unrest';
import { buildChronicle, type ChronicleEntry } from '../src/gen/civ/story/chronicle';
import { resumeCiv } from '../src/gen/civ/modules';
import { Ev } from '../src/gen/civ/events';

const worlds = new Map<number, World>();
function world(seed: number): World {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld({ ...DEFAULT_PARAMS, seed })));
  return w;
}
const civs = new Map<number, Civ>();
function civOf(seed: number): Civ {
  let c = civs.get(seed);
  if (!c) civs.set(seed, (c = generateCiv(world(seed))));
  return c;
}

function bytes(a: ArrayBufferView) {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength);
}

const strip = <T extends { name: string; color?: unknown; dynasties?: { name: string }[] }>(a: T[]) =>
  a.map((x) => ({ ...x, name: '', color: 0, eastern: undefined, dynasties: x.dynasties?.map((d) => ({ ...d, name: '' })) }));

function flat(list: readonly ChronicleEntry[]): ChronicleEntry[] {
  return list.flatMap((e) => [e, ...(e.children ?? [])]);
}

describe('动荡、饥荒、民变、大崩解', () => {
  it('resumeCiv 接着推:在饥荒、民变、大崩解那一刻和之后切开,和一口气推完逐字节一致', () => {
    for (const seed of [7, 2024]) {
      const w = world(seed);
      const whole = civOf(seed);
      const A = whole.annals;
      const at = (k: string) => A.find((e) => e.kind === k && e.year > 600)?.year;
      const cuts = new Set<number>();
      for (const k of ['famine', 'revolt', 'collapse']) {
        const y = at(k);
        if (y === undefined) continue;
        cuts.add(y);
        cuts.add(Math.floor(y) + 3);
      }
      expect(cuts.size, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      for (const cut of cuts) {
        const half = generateCiv(w, { endYear: cut });
        const sim = resumeCiv(w, half);
        sim.run(whole.endYear);
        const res = sim.result();
        const tag = `seed ${seed} 从第 ${cut} 年接着推`;
        expect(res.log.size, tag).toBe(whole.log.size);
        for (const k of ['year', 'region', 'layer', 'value', 'cause'] as const) {
          expect(bytes(res.log[k]).equals(bytes(whole.log[k].subarray(0, whole.log.size))), `${tag}:日志 ${k}`).toBe(true);
        }
        expect(JSON.stringify(res.annals), `${tag}:史事`).toBe(JSON.stringify(whole.annals));
        const m = polityModelOf(sim)!;
        expect(JSON.stringify(strip(m.polities)), `${tag}:国家表`).toBe(JSON.stringify(strip(whole.polities)));
        expect(JSON.stringify(strip(m.settlements)), `${tag}:城镇表`).toBe(JSON.stringify(strip(whole.settlements)));
      }
    }
  }, 240_000);

  it('史事按约定的字段记:饥荒(国家、州数、灾最重的州和城)、民变(紧跟讨伐的战争)、大崩解(紧跟散出去的几国,或散回部落地带)', () => {
    for (const seed of [7, 2024]) {
      const civ = civOf(seed);
      const A = civ.annals;
      const S = civ.settlements;
      const L = civ.log;
      // 日志里散回部落地带的归属变化:年份 → 州
      const tribal = new Map<number, number[]>();
      for (let i = 0; i < L.size; i++) {
        if (L.layer[i] !== Layer.Polity || L.cause[i] !== Ev.Collapse) continue;
        expect(L.value[i]).toBe(-1);
        let l = tribal.get(L.year[i]);
        if (!l) tribal.set(L.year[i], (l = []));
        l.push(L.region[i]);
      }
      let tribalAnnals = 0;
      A.forEach((e, i) => {
        const tag = `seed ${seed} 第 ${i} 条 ${e.kind}`;
        if (e.kind === 'famine') {
          expect(e.a, tag).toBeGreaterThanOrEqual(0);
          expect(polityAlive(civ.polities[e.a], e.year), tag).toBe(true);
          // 饥荒之后同一刻可能有民变,看这一刻之前的归属
          const own = ownersAt(civ, e.year - 1 / 512).polity;
          // 这一刻这国治下闹了饥荒的城:各有一条 cause = famine 的折损
          const hit = S.filter((s) => own[s.region] === e.a && s.sacks?.some((k) => k.cause === 'famine' && k.year === e.year));
          expect(hit.length, tag).toBe(e.b);
          expect(S[e.settlement].region, tag).toBe(e.region);
          expect(hit.map((s) => s.id), tag).toContain(e.settlement);
          const loss = (sid: number) => S[sid].sacks!.find((k) => k.cause === 'famine' && k.year === e.year)!.loss;
          for (const s of hit) expect(loss(s.id), tag).toBeLessThanOrEqual(loss(e.settlement) + 1e-3);
        } else if (e.kind === 'revolt') {
          const w = A[i + 1];
          expect(w.kind, tag).toBe('war');
          expect([w.year, w.a, w.b, w.cause], tag).toEqual([e.year, e.b, e.a, 'quell']);
          const R = civ.polities[e.a];
          expect([R.founded, R.parent, R.capitals![0].settlement], tag).toEqual([e.year, e.b, e.settlement]);
          const after = ownersAt(civ, e.year).polity;
          const before = ownersAt(civ, e.year - 1 / 512).polity;
          expect(after[e.region], tag).toBe(e.a);
          expect(before[e.region], tag).toBe(e.b);
          // 国都没丢
          expect(after[S[capitalAt(civ.polities[e.b], e.year)].region], tag).toBe(e.b);
        } else if (e.kind === 'collapse') {
          expect([0, 1, 2], tag).toContain(e.b);
          expect(S[e.settlement].region, tag).toBe(e.region);
          const after = ownersAt(civ, e.year).polity;
          expect(after[e.region], tag).toBe(e.a);
          if (e.b < 2) {
            // 紧跟着 e.war 条分裂(cause = collapse),都从这国分出去
            for (let k = 1; k <= e.war; k++) {
              const s = A[i + k];
              expect([s.kind, s.year, s.b, s.cause], tag).toEqual(['split', e.year, e.a, 'collapse']);
            }
            expect(A[i + e.war + 1]?.kind === 'split' && A[i + e.war + 1].cause === 'collapse', tag).toBe(false);
          } else {
            tribalAnnals++;
            const rs = tribal.get(e.year)!;
            expect(rs.length, tag).toBe(e.war);
            const before = ownersAt(civ, e.year - 1 / 512).polity;
            for (const r of rs) {
              expect(before[r], tag).toBe(e.a);
              expect(after[r], tag).toBe(-1);
            }
          }
        }
      });
      expect(tribal.size).toBe(tribalAnnals);
    }
  }, 60_000);

  it('默认参数 seed 7 / 2024:饥荒几十到两百多次;两个世界合计有民变、有大崩解', () => {
    let revolts = 0;
    let collapses = 0;
    let ends = 0;
    for (const seed of [7, 2024]) {
      const u = unrestStats(civOf(seed));
      // 20 个种子(1–19、2024)饥荒 72–176 条
      expect(u.famines, `seed ${seed}`).toBeGreaterThanOrEqual(40);
      expect(u.famines, `seed ${seed}`).toBeLessThanOrEqual(250);
      expect(u.quelled + u.overthrows).toBeLessThanOrEqual(u.revolts);
      revolts += u.revolts;
      collapses += u.collapses[0] + u.collapses[1] + u.collapses[2];
      ends += u.quelled + u.overthrows;
    }
    expect(revolts).toBeGreaterThanOrEqual(2);
    // 大崩解少见:20 个种子里不少一次也没有,这两个世界合计 1–2 次
    expect(collapses).toBeGreaterThanOrEqual(1);
    expect(ends).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('编年史:饥荒一条(灾异)、民变连同讨伐折成一条、大崩解连同散出去的几国折成一条(大事);措辞干净', () => {
    for (const seed of [7, 2024]) {
      const civ = civOf(seed);
      const A = civ.annals;
      const list = buildChronicle(civ);
      const all = flat(list);
      const famines = all.filter((e) => e.kind === 'famine');
      expect(famines.length).toBe(A.filter((e) => e.kind === 'famine').length);
      for (const e of famines) {
        expect(e.text).toMatch(/大饥/);
        expect(e.tag).toBe('饥');
      }
      const revolts = list.filter((e) => e.kind === 'revolt');
      expect(revolts.length).toBe(A.filter((e) => e.kind === 'revolt').length);
      for (const e of revolts) {
        expect(e.text).toMatch(/^.+大饥,饥民.*起事,号.+,叛.+,(.+所平|.+亡|.*割据一方|战事未休)$/);
        expect(e.tag).toBe('起');
        // 讨伐的战争挂在底下
        expect(e.children!.some((c) => c.kind === 'war')).toBe(true);
      }
      const collapses = list.filter((e) => e.kind === 'collapse');
      expect(collapses.length).toBe(A.filter((e) => e.kind === 'collapse').length);
      for (const e of collapses) {
        // 大迁徙迁来的一支打进国都引起的写"某某破某城,某国大崩解"
        expect(e.text).toMatch(/大乱|土崩瓦解|大崩解/);
        expect(e.tag).toBe('崩');
        expect(e.importance).toBe(3);
      }
      for (const e of all) if (['famine', 'revolt', 'collapse'].includes(e.kind)) expect(e.text).not.toMatch(/undefined|NaN|某国|-1/);
    }
  }, 60_000);

  it('分裂改进:大崩解产生继承政权而非无主地(种子 2024)', () => {
    const civ = civOf(2024);
    const A = civ.annals;
    const L = civ.log;
    
    // 找到大崩解事件
    const collapses = A.filter((e) => e.kind === 'collapse');
    expect(collapses.length).toBeGreaterThan(0);
    
    for (const collapse of collapses) {
      const pid = collapse.a;
      const collapseYear = collapse.year;
      const kind = collapse.b;
      
      // 崩溃前母国的州
      const beforeOwners = ownersAt(civ, collapseYear - 1 / 512).polity;
      const motherRegions = new Set<number>();
      for (let r = 0; r < beforeOwners.length; r++) {
        if (beforeOwners[r] === pid) motherRegions.add(r);
      }
      
      // 崩溃后的归属
      const afterOwners = ownersAt(civ, collapseYear + 1 / 512).polity;
      
      // 统计:有人住的州(崩溃前)崩溃后的归属
      let peopledBefore = 0;
      let unownedAfter = 0;
      let ownedAfter = 0;
      
      for (const r of motherRegions) {
        const cultBefore = ownersAt(civ, collapseYear - 1 / 512).culture[r];
        if (cultBefore < 0) continue; // 无人住
        
        peopledBefore++;
        const ownerAfter = afterOwners[r];
        if (ownerAfter < 0) unownedAfter++;
        else ownedAfter++;
      }
      
      const tag = `崩溃 pid=${pid} year=${collapseYear} kind=${kind}`;
      
      // kind=2(完全崩溃)可能留部分无主地,但大部分应产生继承国
      if (kind === 2 && peopledBefore > 0) {
        // 允许少量无主地(< 50%),但不应全部无主
        const unownedRatio = unownedAfter / peopledBefore;
        expect(unownedRatio, `${tag}:无主地比例`).toBeLessThan(0.5);
      } else if (kind < 2) {
        // kind=0/1 应全部产生继承国
        expect(unownedAfter, `${tag}:kind=${kind} 不应留无主地`).toBe(0);
      }
      
      // 检查继承国数量(war 字段记录)
      const successorCount = collapse.war ?? 0;
      if (peopledBefore >= 10) {
        // 足够大的国家应该分裂成多个继承国
        expect(successorCount, `${tag}:继承国数量`).toBeGreaterThanOrEqual(1);
      }
    }
  }, 120_000);

  it('分裂改进:继承国领土连通且有城(种子 7)', () => {
    const civ = civOf(7);
    const A = civ.annals;
    
    // 找到分裂事件产生的国家
    const splits = A.filter((e) => e.kind === 'split' && e.cause === 'collapse');
    expect(splits.length).toBeGreaterThan(0);
    
    for (const split of splits) {
      const successorId = split.a;
      const successor = civ.polities[successorId];
      const foundYear = successor.founded;
      
      // 立国时的领土
      const owners = ownersAt(civ, foundYear + 1 / 512).polity;
      const regions: number[] = [];
      for (let r = 0; r < owners.length; r++) {
        if (owners[r] === successorId) regions.push(r);
      }
      
      const tag = `继承国 ${successorId} founded=${foundYear}`;
      
      // 应有领土
      expect(regions.length, `${tag}:领土数`).toBeGreaterThanOrEqual(1);
      
      // 应有首都城市
      const capitalId = successor.capital;
      const capital = civ.settlements[capitalId];
      expect(capital, `${tag}:首都存在`).toBeDefined();
      expect(capital.ended, `${tag}:首都未毁`).toBeUndefined();
      
      // 首都在领土内
      expect(regions, `${tag}:首都在领土内`).toContain(capital.region);
    }
  }, 120_000);

  it('分裂改进:确定性测试(相同种子相同结果)', () => {
    // 同一种子生成两次,崩溃结果应完全一致
    const civ1 = generateCiv(world(2024));
    const civ2 = generateCiv(world(2024));
    
    const collapses1 = civ1.annals.filter((e) => e.kind === 'collapse');
    const collapses2 = civ2.annals.filter((e) => e.kind === 'collapse');
    
    expect(collapses1.length).toBe(collapses2.length);
    
    for (let i = 0; i < collapses1.length; i++) {
      const c1 = collapses1[i];
      const c2 = collapses2[i];
      
      expect(c1.year, `第 ${i} 次崩溃:年份`).toBe(c2.year);
      expect(c1.a, `第 ${i} 次崩溃:母国`).toBe(c2.a);
      expect(c1.b, `第 ${i} 次崩溃:kind`).toBe(c2.b);
      expect(c1.war, `第 ${i} 次崩溃:继承国数`).toBe(c2.war);
    }
  }, 240_000);
  
  it('分裂改进:人口保留(继承国人口总和接近母国)', () => {
    const civ = civOf(2024);
    const A = civ.annals;
    const S = civ.settlements;
    
    const collapses = A.filter((e) => e.kind === 'collapse');
    expect(collapses.length).toBeGreaterThan(0);
    
    for (const collapse of collapses) {
      const pid = collapse.a;
      const collapseYear = collapse.year;
      
      // 崩溃前母国的城市人口
      const beforeOwners = ownersAt(civ, collapseYear - 1 / 512).polity;
      let motherPopulation = 0;
      for (const s of S) {
        if (s.ended !== undefined && s.ended < collapseYear) continue;
        if (beforeOwners[s.region] === pid) {
          motherPopulation += populationAt(s, collapseYear);
        }
      }
      
      // 崩溃后继承国的人口
      const afterOwners = ownersAt(civ, collapseYear + 1 / 512).polity;
      let successorPopulation = 0;
      const successorIds = new Set<number>();
      
      for (let r = 0; r < beforeOwners.length; r++) {
        if (beforeOwners[r] === pid && afterOwners[r] >= 0) {
          successorIds.add(afterOwners[r]);
        }
      }
      
      for (const sid of successorIds) {
        for (const s of S) {
          if (s.ended !== undefined && s.ended < collapseYear) continue;
          if (afterOwners[s.region] === sid) {
            successorPopulation += populationAt(s, collapseYear);
          }
        }
      }
      
      // 人口应基本保留(允许 < 15% 损失,来自可能的洗劫等)
      if (motherPopulation > 0) {
        const ratio = successorPopulation / motherPopulation;
        const tag = `崩溃 pid=${pid} year=${collapseYear}`;
        expect(ratio, `${tag}:人口保留率`).toBeGreaterThan(0.85);
      }
    }
  }, 120_000);
  
  it('分裂改进:边缘情况(小国、无城国家)', () => {
    // 使用多个种子测试各种边缘情况
    for (const seed of [7, 2024]) {
      const civ = civOf(seed);
      const A = civ.annals;
      
      // 检查所有崩溃事件是否正常完成
      const collapses = A.filter((e) => e.kind === 'collapse');
      for (const collapse of collapses) {
        const pid = collapse.a;
        const P = civ.polities[pid];
        
        // 崩溃后母国应标记为已结束
        expect(P.ended, `seed=${seed} pid=${pid}:母国已结束`).toBeDefined();
        
        // 继承国数量应合理(0-10)
        const successorCount = collapse.war ?? 0;
        expect(successorCount, `seed=${seed} pid=${pid}:继承国数量合理`).toBeLessThanOrEqual(10);
      }
    }
  }, 180_000);
});

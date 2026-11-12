/**
 * 改制以后,作者的人物和国家干预里几处按"那一年"的政体(gen/civ/regime.ts 的 royalAt / regimeAt),不按国家原来的一系:
 * - 「立为君主」「掌权」挑国家的列表(ui/crownInfo.ts 的 alivePolities):那年是共和国 / 军政府写"执政",神权写"国师"等,复辟以后写"在位"
 * - 「保住王室」(ui/keepInfo.ts 的 keepWhy):那年是共和国 / 军政府 / 神权国用不上(干预页变淡、即位页没有那个勾),复辟以后照君主国
 * - 推演里人物的「让他掌权」「为他联姻」(ui/newIvInfo.ts):那年是共和国 / 军政府的没有王室,掌不了权、结不了亲;复辟以后照君主国
 * 例子按条件现找(历史重排以后国家会变):原来有君主的国家改成共和 / 军政府的那几段、改制以后又复辟的那一段,各取中间那一年。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { generateCiv, type Civ } from '../src/gen/civ';
import { polityAlive } from '../src/gen/civ/growth';
import { rulerAt } from '../src/gen/civ/story/peopleInfo';
import { reformedSeg } from '../src/gen/civ/regime';
import { alivePolities } from '../src/ui/crownInfo';
import { keepWhy } from '../src/ui/keepInfo';
import { IV_ROYAL_AGE, marryChoice, marryPartners, regentChoice } from '../src/ui/newIvInfo';

/**
 * 7/21 盖复辟;10、30 有改成共和;9 有从君主国政变的军政府;都有神权(第 68 版以后)。几种改制的中间年都要取得到
 * (第 72 版种子 1–22、30 里改制多半是立神权,军政府的一段只剩种子 9 有,换下 22;
 * 以前用 7/21/22/30/10,曾用 10+25;25 的政变段有时取不到中间年;更早 25+21、42、47、13)
 */
const SEEDS = [7, 9, 10, 21, 30];
const civs = new Map<number, Civ>();
const civOf = (seed: number) => {
  let c = civs.get(seed);
  if (!c) civs.set(seed, (c = generateCiv(generateWorld({ ...DEFAULT_PARAMS, seed }))));
  return c;
};

type Kind = 'republic' | 'junta' | 'theocracy' | 'restore' | 'before';
interface Case {
  seed: number;
  civ: Civ;
  pid: number;
  y: number;
  kind: Kind;
}

/**
 * 原来有君主的国家:改成共和 / 军政府的那几段(republic / junta)、改制以后回到王室的那一段(restore)、第一次改制前那一段(before);
 * y = 那一段中间的整年(国家那年还在)
 */
function cases(): Case[] {
  const out: Case[] = [];
  for (const seed of SEEDS) {
    const civ = civOf(seed);
    for (const p of civ.polities) {
      const d = p.dynasties ?? [];
      if (p.lineage === 'republic' || !d.some((s) => s.regime)) continue;
      const first = d.findIndex((s) => s.regime);
      d.forEach((s, i) => {
        const end = Math.min(d[i + 1]?.year ?? Infinity, p.ended ?? Infinity, civ.endYear);
        let y = Math.floor((Math.max(s.year, p.founded) + end) / 2);
        if (y <= s.year || y >= end) y = Math.floor(s.year) + 1;
        if (y <= s.year || y >= end || !polityAlive(p, y)) return;
        const kind: Kind | null = reformedSeg(p, i) ? s.regime! : i === first - 1 ? 'before' : i > first && !s.regime ? 'restore' : null;
        if (kind) out.push({ seed, civ, pid: p.id, y, kind });
      });
    }
  }
  return out;
}
let memo: Case[] | null = null;
const all = () => (memo ??= cases());
const tag = (c: Case) => `seed ${c.seed} 国 ${c.pid} 第 ${c.y} 年（${c.kind}）`;

describe('改制以后按那一年的政体', () => {
  it('几个种子里找得到:改成共和、改成军政府、立神权、复辟', () => {
    const kinds = new Set(all().map((c) => c.kind));
    for (const k of ['republic', 'junta', 'theocracy', 'restore', 'before'] as const) expect(kinds.has(k), k).toBe(true);
  }, 120_000);

  it('挑国家的列表:那年是共和国 / 军政府写"执政"、神权写国师等,复辟以后、改制以前写"在位"', () => {
    const seen = new Set<Kind>();
    for (const c of all()) {
      const row = alivePolities(c.civ, c.y).find((x) => x.id === c.pid);
      if (!row) continue;
      seen.add(c.kind);
      expect(row.republic, tag(c)).toBe(c.kind === 'republic' || c.kind === 'junta' || c.kind === 'theocracy');
      if (c.kind === 'theocracy') expect(row.office, tag(c)).toMatch(/国师|教宗|大祭司/);
    }
    expect(seen.has('republic') && seen.has('junta') && seen.has('theocracy') && seen.has('restore')).toBe(true);
  }, 120_000);

  it('保住王室:那年是共和国 / 军政府 / 神权国用不上,写那年的政体;复辟以后、改制以前照君主国', () => {
    for (const c of all()) {
      const P = c.civ.polities[c.pid];
      const want = c.kind === 'republic' ? '共和国没有王室，用不上' : c.kind === 'junta' ? '军政府没有王室，用不上' : c.kind === 'theocracy' ? '神权国没有王室，用不上' : null;
      expect(keepWhy(P, c.y), tag(c)).toBe(want);
    }
  }, 120_000);

  it('让他掌权、为他联姻:那年是共和国 / 军政府 / 神权国的掌不了权、结不了亲,也不在别国联姻能挑的国家里', () => {
    let n = 0;
    for (const c of all()) {
      if (c.kind !== 'republic' && c.kind !== 'junta' && c.kind !== 'theocracy') continue;
      const N = rulerAt(c.civ, c.pid, c.y);
      if (N) {
        n++;
        expect(marryChoice(c.civ, N, c.y), tag(c)).toBe(false);
      }
      for (const x of c.civ.people ?? []) if (x.polity === c.pid) expect(regentChoice(c.civ, x, c.y), `${tag(c)} ${x.name}`).toBeNull();
      for (const q of alivePolities(c.civ, c.y)) if (q.id !== c.pid) expect(marryPartners(c.civ, q.id, c.y).some((m) => m.id === c.pid), tag(c)).toBe(false);
    }
    expect(n).toBeGreaterThan(0);
  }, 120_000);

  it('复辟以后照君主国:那年在位、成年的君主能为他联姻', () => {
    let n = 0;
    for (const c of all()) {
      if (c.kind !== 'restore') continue;
      const N = rulerAt(c.civ, c.pid, c.y);
      if (!N || N.author !== undefined || N.born + IV_ROYAL_AGE > c.y) continue;
      n++;
      expect(marryChoice(c.civ, N, c.y), tag(c)).toBe(true);
    }
    expect(n).toBeGreaterThan(0);
  }, 120_000);
});

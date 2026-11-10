/**
 * 接着推和一口气推完一样(随机自查,scripts/lib/resumeFuzz.ts):
 * - 逐年推演一步随机推 1–60 年、每停一下随机下各种命令(宣战、结盟、迁都、划州、立国、不许扩张、不许灭、禁止分裂、即位),
 *   推到第 2000 年:和带着同样的命令一口气推完逐字段相等。这里跑 3 个种子,更多的种子在 scripts/stress.ts 里跑。
 *   这 3 个种子碰得上:同一刻撞上的两件事(两处看重建、看内政和看邦交、两国看邻国),
 *   立国干预在没人住的州当场建的城没几年就被毁、到了定居时预约的年份又建一座新城
 * - seed 49:停在一次"城早已建成、到了原定年份才立国"以前二三十年、接着推,那次立国照样有。按条件现找(历史变了不用跟着改种子)。
 *   大迁徙落脚立的国(found 的 cause = trek)不是照原定的年份立的,不算。以前用"立国的城早年当过别国的国都"来认这种立国,
 *   崩解平衡改了历史以后种子 1–200 里不再出现,改认城比立国早二十年以上(同一条预约立国的路径)。
 * 带地形大事的世界在 civ-resume-fuzz-upheaval(各放 5 件)和 civ-resume-fuzz-upheaval-15(各放 15 件),按耗时分开,好分到几台机器上同时跑
 */
import { describe, expect, it } from 'vitest';
import { generateCiv, type Civ } from '../src/gen/civ';
import { playCiv, playStop, playTurn } from '../src/gen/civ/play';
import type { Intervention, PlayState } from '../src/gen/edits';
import { fuzzResume, fuzzWorld } from '../scripts/lib/resumeFuzz';

/** 两份历史逐项一样 */
function same(a: Civ, b: Civ, label: string) {
  expect(Object.keys(a).sort(), label).toEqual(Object.keys(b).sort());
  for (const k of Object.keys(b) as (keyof Civ)[]) expect(a[k], `${label} ${k}`).toEqual(b[k]);
}

describe('接着推和一口气推完一样(随机自查)', () => {
  it.each([11, 28, 29])('seed %i:逐年推演随机推、随机下命令到第 2000 年,和一口气推完逐字段相等', (seed) => {
    const r = fuzzResume({ seed, to: 2000 });
    expect(r.diff, `seed ${seed}`).toBeNull();
    // 各种命令都下过
    expect(Object.keys(r.kinds).sort(), `seed ${seed}`).toEqual(['ally', 'boost', 'cede', 'crown', 'death', 'declare', 'destroy', 'disaster', 'found', 'halt', 'move', 'neutral', 'policy', 'protect', 'stay', 'temper', 'treaty', 'trek', 'unity']);
  }, 300_000);

  it('seed 49:停在一次"城早已建成、到了原定年份才立国"以前、接着推 50 年,和一口气推完一样', () => {
    const w = fuzzWorld(49);
    // 按条件现找:第 1200 年以后、城已建成二十年以上才立的国(不是大迁徙落脚立的);停在它前面二三十年
    const scheduled = (civ: Civ, e: Civ['annals'][number], after: number) =>
      e.kind === 'found' && e.cause === undefined && e.year > after && (civ.settlements[e.settlement]?.founded ?? e.year) < e.year - 20;
    const full = generateCiv(w);
    const hit = full.annals.find((e) => scheduled(full, e, 1200));
    expect(hit, '一口气推完里有这样一次立国').toBeDefined();
    const stop = Math.floor(hit!.year / 10) * 10 - 20;
    const play: PlayState = { year: stop, commands: [] };
    const civ = playCiv(w, {}, play);
    const cmds: Intervention[] = [];
    const r = playTurn(w, civ, {}, play, cmds, 50);
    expect(r.rejected).toEqual([]);
    const one = generateCiv(w, { interventions: r.play.commands, endYear: playStop(stop + 50) });
    const found = one.annals.filter((e) => scheduled(one, e, stop));
    expect(found.length).toBeGreaterThan(0);
    same(r.civ, one, `seed 49 第 ${stop} 年`);
  }, 120_000);
});

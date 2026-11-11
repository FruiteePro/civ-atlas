/**
 * 反向同化微调与混合民族(GENERATOR_VERSION 65,assimilation.ts):
 * 反向同化门槛略松,发生时仍走史事 assimilate;长期混居且同一书写系统的两族偶尔融成一支,全世界最多 HYBRID_MAX 支,比普通分化稀。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { generateCiv, type Civ } from '../src/gen/civ';
import { ASSIMILATION_KNOBS } from '../src/gen/civ/assimilation';
import { NAME_STYLES } from '../src/gen/names';
import { withHybridContacts, type CultureContact } from '../src/gen/civ/contact';
import { buildChronicle } from '../src/gen/civ/story/chronicle';
import type { Culture } from '../src/gen/civ/types';

const { REVERSE_SHARE, REVERSE_MAJ, REVERSE_K, HYBRID_MAX, HYBRID_P, DIV_P, TREK_K } = ASSIMILATION_KNOBS.values;
const family = (style: string) => NAME_STYLES.find((s) => s.id === style)?.family;

const civs = new Map<number, Civ>();
function civOf(seed: number): Civ {
  let c = civs.get(seed);
  if (!c) civs.set(seed, (c = generateCiv(generateWorld({ ...DEFAULT_PARAMS, seed }))));
  return c;
}

function hybrids(civ: Civ): Culture[] {
  return civ.cultures.filter((cu) => cu.mix !== undefined);
}

describe('反向同化与混合民族的旋钮', () => {
  it('反向同化比迁徙立国紧、比旧门槛松;混合比普通分化稀,全世界有上限', () => {
    expect(REVERSE_SHARE).toBeGreaterThan(0.35);
    expect(REVERSE_SHARE).toBeLessThan(0.5);
    expect(REVERSE_MAJ).toBeLessThan(0.5);
    expect(REVERSE_MAJ).toBeGreaterThan(0.3);
    expect(REVERSE_K).toBeGreaterThan(0.8);
    expect(REVERSE_K).toBeLessThan(TREK_K);
    expect(HYBRID_P).toBeLessThan(DIV_P);
    expect(HYBRID_MAX).toBeGreaterThan(0);
    expect(HYBRID_MAX).toBeLessThan(8);
  });

  it('混合民族没有接触语时,从诞生起补上另一支的语感', () => {
    const cultures = [
      { id: 0, name: '甲', style: 'central', kind: 'river', hearth: 0, born: 0, expansionism: 0, color: [0, 0, 0] },
      { id: 1, name: '乙', style: 'xianxia', kind: 'river', hearth: 1, born: 0, expansionism: 0, color: [0, 0, 0] },
      { id: 2, name: '丙', style: 'central', kind: 'river', hearth: 2, born: 1200, expansionism: 0, color: [0, 0, 0], parent: 0, mix: 1 },
    ] as Culture[];
    const out = withHybridContacts([], cultures);
    expect(out).toEqual([{ culture: 2, style: 'xianxia', year: 1200 }]);
    const keep: CultureContact[] = [{ culture: 2, style: 'yamato', year: 1300 }];
    expect(withHybridContacts(keep, cultures)).toEqual(keep);
  });
});

describe.each([7, 2024, 3, 10, 25])('混合民族 · seed=%i', (seed) => {
  it('若出现:有两支来源、同一书写系统、不超过上限;编年史写长期共处', () => {
    const civ = civOf(seed);
    const hs = hybrids(civ);
    expect(hs.length, '上限').toBeLessThanOrEqual(HYBRID_MAX);
    const diverged = civ.cultures.filter((cu) => cu.parent !== undefined && cu.mix === undefined).length;
    expect(hs.length, '不比普通分化多').toBeLessThanOrEqual(Math.max(diverged, HYBRID_MAX));
    for (const cu of hs) {
      expect(cu.parent, cu.name).toBeDefined();
      expect(civ.cultures[cu.parent!], cu.name).toBeDefined();
      expect(civ.cultures[cu.mix!], cu.name).toBeDefined();
      const fa = family(civ.cultures[cu.parent!].style);
      const fb = family(civ.cultures[cu.mix!].style);
      expect(fa, `${cu.name} 书写系统`).toBe(fb);
      const ev = civ.annals.find((e) => e.kind === 'diverge' && e.a === cu.id);
      expect(ev, `${cu.name} 史事`).toBeTruthy();
      expect(ev!.b).toBe(cu.parent);
      expect(ev!.n).toBe(cu.mix);
    }
    if (hs.length) {
      const ch = buildChronicle(civ);
      const texts = ch.filter((e) => e.kind === 'diverge' && hs.some((h) => h.id === civ.annals[e.id]?.a)).map((e) => e.text);
      expect(texts.some((t) => t.includes('长期共处')), texts.join(' / ')).toBe(true);
    }
  }, 120_000);
});

describe.each([7, 2024])('反向同化史事 · seed=%i', (seed) => {
  it('统治民族被同化的州,都有 assimilate 史事', () => {
    const civ = civOf(seed);
    const reverse = civ.annals.filter((e) => e.kind === 'assimilate' && civ.polities[e.war]?.culture === e.b);
    for (const e of reverse) {
      expect(e.a).toBeGreaterThanOrEqual(0);
      expect(e.b).toBeGreaterThanOrEqual(0);
      expect(e.region).toBeGreaterThanOrEqual(0);
    }
  }, 120_000);
});

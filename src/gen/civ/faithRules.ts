/**
 * 信仰对同化、邦交、开战意愿的加权:同教相吸、异教相斥,神权在这条轴上更强。
 * 差距由 religion.ts 挂在 PolityModel.faithGap 上(0 = 同一信仰,0.5 = 同一大教的不同派,1 = 异教,−1 = 不明)。
 * 各国拿来比的信仰:有国教用国教,否则用国都所在州的信仰。
 */
import type { Year } from './types';
import type { Polity } from './types';
import { capitalAt } from './growth';
import { regimeAt } from './regime';
import type { PolityModel } from './polities';

/** 两种信仰的差距:0 = 同一信仰,0.5 = 同一大教的不同派,1 = 不同宗教,−1 = 不明 / 还没有 */
export function faithGap(pm: PolityModel, f: number, g: number): number {
  if (f < 0 || g < 0) return -1;
  if (f === g) return 0;
  return pm.faithGap?.(f, g) ?? -1;
}

/** 国家此刻拿来比的信仰:有国教用国教,否则用国都所在州的信仰 */
export function polityFaith(pm: PolityModel, p: Polity, t: Year): number {
  const sf = pm.stateFaith?.(p.id) ?? -1;
  if (sf >= 0) return sf;
  const cap = pm.settlements[capitalAt(p, t)]?.region;
  return cap !== undefined ? (pm.faithAt?.(cap) ?? -1) : -1;
}

/** 神权在信仰这条轴上的倍数(不是神权 = 1) */
export function faithScale(p: Polity, t: Year, theo: number): number {
  return regimeAt(p, t) === 'theocracy' ? theo : 1;
}

function clampMul(m: number): number {
  return m < 0.45 ? 0.45 : m > 1.85 ? 1.85 : m;
}

/** 同向倍数(同化、结盟、归附、受降、援盟):同教 > 1,异教 < 1;不明 = 1 */
export function faithAlignMul(gap: number, same: number, far: number, scale: number): number {
  if (!(gap >= 0) || !(scale > 0)) return 1;
  return clampMul(gap === 0 ? 1 + same * scale : 1 - far * scale * gap);
}

/** 相斥倍数(开战、自立):同教 < 1,异教 > 1;不明 = 1 */
export function faithOpposeMul(gap: number, same: number, far: number, scale: number): number {
  if (!(gap >= 0) || !(scale > 0)) return 1;
  return clampMul(gap === 0 ? 1 - same * scale : 1 + far * scale * gap);
}

/** 两国此刻的信仰差距(任一方不明 = −1) */
export function polityFaithGap(pm: PolityModel, a: Polity, b: Polity, t: Year): number {
  return faithGap(pm, polityFaith(pm, a, t), polityFaith(pm, b, t));
}

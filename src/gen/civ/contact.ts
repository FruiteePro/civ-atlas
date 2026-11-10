/**
 * 接触语的触发:推演结束后,从归属日志里看哪个民族被另一种同一书写系统的语感统治得够久。
 * 只读历史,不改推演。一族最多记一种接触语(先达到门槛的那一对);统治结束以后后来的名字仍用这门接触语,不退回纯底层。
 *
 * 门槛:一个统治民族语感与被统治民族不同、但书写系统相同(都是西幻音译,或都是汉字圈)的国家,
 * 连续占着该民族至少 8 州,或(该民族当时不足 16 州时)占其过半且不少于 4 州,满 250 年。
 * 同一语感的母族 / 方言支不算接触(那种走方言)。长期杂居这条路这次不做,避免满图都是杂交名。
 *
 * 山海湖岛的地名仍按当地民族的语感 / 方言起(地理实体没有"出现年份"可对齐),不走接触语。
 */
import { NAME_STYLES } from '../names';
import { subSeed } from './engine/rand';
import { Layer, type ChangeLog, type Culture, type Polity, type Year } from './types';

/** 外族连续统治满这么多年才成接触语 */
export const CONTACT_RULE_YEARS = 250;
/** 占着至少这么多州就算够大(大族即使不到过半也对) */
export const CONTACT_MIN_REGIONS = 8;
/** 小族(当时不足这么多州)可改走过半门槛,但不少于 CONTACT_MAJORITY_FLOOR 州 */
export const CONTACT_MAJORITY_CAP = 16;
/** 过半这条路至少要占几州:两州的短暂占领不算 */
export const CONTACT_MAJORITY_FLOOR = 4;

/** 一个民族在某一年之后起名改走接触语:统治层是哪种语感、从哪一年起 */
export interface CultureContact {
  /** 被统治的民族 */
  culture: number;
  /** 统治层语感 id */
  style: string;
  /** 连续统治满门槛的那一年;这以后为这一族起的名才用接触语 */
  year: Year;
}

/** 这一对接触语的盐:只看底层民族和上层语感,和起名先后无关 */
export function contactSalt(cu: Culture, superStyle: string): number {
  return subSeed(0x51edbeef, `contact:${cu.id}:${cu.hearth}:${cu.style}:${superStyle}`);
}

/** 这一族在 year 这一年该不该改走接触语(已触发且年份已到) */
export function contactAt(contacts: readonly CultureContact[], cultureId: number, year: Year): CultureContact | undefined {
  const c = contacts.find((x) => x.culture === cultureId);
  return c && year >= c.year ? c : undefined;
}

/** 当时占着的州数够不够得上门槛 */
export function contactSizeGate(ruled: number, total: number): boolean {
  if (ruled >= CONTACT_MIN_REGIONS) return true;
  return total > 0 && total < CONTACT_MAJORITY_CAP && ruled >= CONTACT_MAJORITY_FLOOR && ruled * 2 >= total;
}

const familyOf = (style: string) => NAME_STYLES.find((s) => s.id === style)?.family;

/**
 * 从归属日志里找出各族的接触语(每种底层民族最多一种,先达到门槛的那一对)。
 * 要在语感已经分好以后调用。endYear 以前一直占领到头的,也算满年数。
 */
export function detectContacts(
  cultures: readonly Culture[],
  polities: readonly Polity[],
  log: Readonly<ChangeLog>,
  R: number,
  endYear: Year,
): CultureContact[] {
  if (!cultures.length || !polities.length || R <= 0) return [];
  const nC = cultures.length;
  const styleOf = cultures.map((cu) => cu.style);
  const family = styleOf.map((s) => familyOf(s));
  const pStyle: string[] = polities.map((p) => (p.culture >= 0 && p.culture < nC ? styleOf[p.culture] : ''));

  const cultureOf = new Int16Array(R).fill(-1);
  const polityOf = new Int16Array(R).fill(-1);
  const total = new Int32Array(nC);
  // ruled[c] = 各族土地上,按统治层语感占着的州数(只用到出现过的语感,用 Map 即可)
  const ruled: Map<string, number>[] = Array.from({ length: nC }, () => new Map());
  const since = new Map<string, number>(); // `${c}|${style}` → 门槛开始满足的年份
  const out: CultureContact[] = [];
  const fired = new Set<number>();

  const styleOfRegion = (r: number): string => {
    const p = polityOf[r];
    return p >= 0 && p < pStyle.length ? pStyle[p] : '';
  };

  const inc = (c: number, st: string, d: number) => {
    if (c < 0 || c >= nC || !st) return;
    const m = ruled[c];
    m.set(st, (m.get(st) ?? 0) + d);
  };

  const applyCulture = (r: number, next: number) => {
    const prev = cultureOf[r];
    const st = styleOfRegion(r);
    if (prev >= 0 && prev < nC) {
      total[prev]--;
      inc(prev, st, -1);
    }
    cultureOf[r] = next;
    if (next >= 0 && next < nC) {
      total[next]++;
      inc(next, st, 1);
    }
  };

  const applyPolity = (r: number, next: number) => {
    const c = cultureOf[r];
    const old = styleOfRegion(r);
    polityOf[r] = next;
    const neu = styleOfRegion(r);
    if (c >= 0 && old !== neu) {
      inc(c, old, -1);
      inc(c, neu, 1);
    }
  };

  const keyOf = (c: number, st: string) => `${c}|${st}`;

  const fire = (c: number, st: string, start: number) => {
    out.push({ culture: c, style: st, year: start + CONTACT_RULE_YEARS });
    fired.add(c);
  };

  const consider = (c: number, st: string, n: number, tot: number, t: Year): boolean => {
    if (!st || st === styleOf[c] || familyOf(st) !== family[c]) return false;
    const k = keyOf(c, st);
    if (contactSizeGate(n, tot)) {
      if (!since.has(k)) since.set(k, t);
      else if (t - since.get(k)! >= CONTACT_RULE_YEARS) {
        fire(c, st, since.get(k)!);
        return true;
      }
    } else {
      // 这一年才丢掉的,先看满没满 250 年(中间可能没有归属变化,不能漏掉门槛那年)
      if (since.has(k) && t - since.get(k)! >= CONTACT_RULE_YEARS) {
        fire(c, st, since.get(k)!);
        since.delete(k);
        return true;
      }
      since.delete(k);
    }
    return false;
  };

  const check = (t: Year) => {
    for (let c = 0; c < nC; c++) {
      if (fired.has(c) || !family[c] || !styleOf[c]) continue;
      const seen = new Set<string>();
      let done = false;
      for (const [st, n] of ruled[c]) {
        seen.add(st);
        if (consider(c, st, n, total[c], t)) {
          done = true;
          break;
        }
      }
      if (done) continue;
      for (const k of since.keys()) {
        if (!k.startsWith(`${c}|`)) continue;
        const st = k.slice(`${c}|`.length);
        if (seen.has(st)) continue;
        if (consider(c, st, 0, total[c], t)) break;
      }
    }
  };

  let i = 0;
  const { size, year, region, layer, value } = log;
  while (i < size) {
    const t = year[i];
    while (i < size && year[i] === t) {
      const r = region[i];
      if (r >= 0 && r < R) {
        if (layer[i] === Layer.Culture) applyCulture(r, value[i]);
        else if (layer[i] === Layer.Polity) applyPolity(r, value[i]);
      }
      i++;
    }
    check(t);
  }
  if (Number.isFinite(endYear)) check(endYear);
  out.sort((a, b) => a.culture - b.culture);
  return out;
}

/**
 * 方言对词库的偏转:同一套语感里,按一个稳定的盐把词根、词尾、通名的权重挪一挪,
 * 并让这一支多抽一批"独有"的词根(母族的默认生成器不偏用它们)。
 * 盐由民族分化的方位和身份算出(见 civ/naming.ts 的 cultureDialect),这里只认整数。
 * 不改语感 id,也不往字库里加新字。
 */
import { keyed } from '../util';
import type { Weighted } from './spec';

/** 把数组转过 offset 位(浅拷贝,不改原数组) */
export function rotate<T>(items: readonly T[], offset: number): T[] {
  const n = items.length;
  if (n <= 1) return items.slice();
  const k = ((offset % n) + n) % n;
  return k ? items.slice(k).concat(items.slice(0, k)) : items.slice();
}

/**
 * 按盐挑出一小批词(约占四分之一)多放几份,这一支就偏用它们;其余仍留着,听起来还是同一门语言。
 * lane 区分词根 / 中间音节 / 人名用字等不同表,免得都转到同一处。
 */
export function preferSlice<T>(items: readonly T[], salt: number, lane = 0): T[] {
  const n = items.length;
  if (n <= 1) return items.slice();
  const rot = rotate(items, Math.floor(keyed(salt, lane) * n));
  const reserved = Math.max(2, Math.min(12, Math.round(n * 0.28)));
  const head = rot.slice(0, reserved);
  const tail = rot.slice(reserved);
  return [...head, ...head, ...head, ...tail];
}

/** 字串版的 preferSlice(东方用字、姓) */
export function preferChars(s: string, salt: number, lane = 0): string {
  return preferSlice([...s], salt, lane).join('');
}

/** 把权重轮到别的项上,通名、词尾的口味就偏一点(浅拷贝,不改原数组) */
export function shiftWeights<T>(xs: readonly Weighted<T>[], salt: number, lane = 0): Weighted<T>[] {
  const n = xs.length;
  if (n <= 1) return xs.map((x) => ({ item: x.item, w: x.w }));
  const rot = rotate(xs, Math.floor(keyed(salt, lane) * n));
  const woff = 1 + Math.floor(keyed(salt, lane, 1) * (n - 1));
  const weights = rotate(
    xs.map((x) => x.w),
    woff,
  );
  return rot.map((x, i) => ({ item: x.item, w: weights[i] }));
}

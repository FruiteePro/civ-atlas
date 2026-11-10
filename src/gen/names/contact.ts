/**
 * 接触语:同一书写系统里两种语感叠在一起以后的词库。
 * 底层(substrate)可先做过方言偏转,再按主次比例掺进统治层(superstrate)的词根、词尾,并加一小批只属于这一对的过渡成分,
 * 听起来像一门新语言,而不是两套招牌轮流出现。不改语感 id,也不把拉丁转写和汉字圈混在一起(调用方先把好关)。
 *
 * 主次大约 七三 / 六四,按名字种类再偏一点:
 * - 日常州名、山海河和通名多留底层;
 * - 国号、都城、官号更借统治层;
 * - 人名中等掺和(见 persons.ts)。
 */
import { keyed, mulberry32, subSeed, type Rng } from '../util';
import { NAME_KINDS, type Candidate, type NameKind, type Part, type Weighted } from './spec';
import { preferSlice, shiftWeights } from './dialect';
import type { WesternStyle } from './western';
import { easternCandidate, type EasternStyle } from './eastern';

/** 这一对接触语的盐和统治层语感;official = 国号、都城,更偏向统治层 */
export interface StyleContact {
  /** 统治层语感 id(与底层同一书写系统、不同语感) */
  style: string;
  /** 这一对接触语的盐(底层民族 + 上层语感,稳定) */
  salt: number;
  /** 国号、都城、官号:更偏向统治层;不给 = 日常地名的主次 */
  official?: boolean;
}

/** 底层词该占几成:日常地名约七成,城名约六成,国号都城约三成半 */
export function substrateShare(kind: NameKind, official = false): number {
  if (official || kind === 'state') return 0.35;
  if (kind === 'city') return official ? 0.35 : 0.55;
  return 0.7;
}

/** 按比例把两套部件拼成一套(可再加过渡词根)。浅拷贝,不改原数组 */
export function mixParts(sub: readonly Part[], sup: readonly Part[], salt: number, subRatio: number, lane: number, trans = false): Part[] {
  if (!sub.length && !sup.length) return [];
  if (!sup.length) return preferSlice(sub, salt, lane);
  if (!sub.length) return preferSlice(sup, salt, lane);
  const subP = preferSlice(sub, salt, lane);
  const supP = preferSlice(sup, salt, lane + 100);
  const n = Math.max(8, subP.length, supP.length);
  const nSub = Math.max(2, Math.round(n * subRatio));
  const nSup = Math.max(2, Math.round(n * (1 - subRatio)));
  const take = (arr: readonly Part[], k: number) => {
    const out: Part[] = [];
    for (let i = 0; i < k; i++) out.push(arr[i % arr.length]);
    return out;
  };
  const extra = trans ? transitionalStems(sub, sup, salt, lane, 5) : [];
  return [...take(subP, nSub), ...take(supP, nSup), ...extra, ...extra];
}

/** 按比例把两套带权词尾拼成一套,过渡词尾约占一成 */
export function mixWeighted(
  sub: readonly Weighted<Part>[],
  sup: readonly Weighted<Part>[],
  salt: number,
  subRatio: number,
  lane: number,
  trans = false,
): Weighted<Part>[] {
  const ss = sub.length ? shiftWeights(sub, salt, lane) : [];
  const pp = sup.length ? shiftWeights(sup, salt, lane + 100) : [];
  const sum = (xs: readonly Weighted<Part>[]) => xs.reduce((a, x) => a + x.w, 0) || 1;
  const transW = trans ? transitionalEnds(sub, sup, salt, lane) : [];
  const tw = transW.reduce((a, x) => a + x.w, 0);
  const tPart = transW.length ? 0.12 : 0;
  const rest = 1 - tPart;
  const subScale = (sum(ss) ? (subRatio * rest) / sum(ss) : 0);
  const supScale = (sum(pp) ? ((1 - subRatio) * rest) / sum(pp) : 0);
  const tScale = tw ? tPart / tw : 0;
  return [
    ...ss.map((x) => ({ item: x.item, w: x.w * subScale })),
    ...pp.map((x) => ({ item: x.item, w: x.w * supScale })),
    ...transW.map((x) => ({ item: x.item, w: x.w * tScale })),
  ].filter((x) => x.w > 0 && (x.item.l || x.item.zh));
}

/** 西幻:底层词库(可已是方言)掺进统治层,通名和词尾按种类分主次;译音仍用底层的口音 */
export function westernWithContact(sub: WesternStyle, sup: WesternStyle, salt: number, official = false): WesternStyle {
  const kinds = {} as WesternStyle['kinds'];
  NAME_KINDS.forEach((kind, i) => {
    const subR = substrateShare(kind, official);
    const sr = sub.kinds[kind];
    const pr = sup.kinds[kind];
    kinds[kind] = {
      ends: mixWeighted(sr.ends, pr.ends, salt, subR, i + 3, true),
      mid: sr.mid * subR + pr.mid * (1 - subR),
      stems: mixParts(sr.stems ?? sub.stems, pr.stems ?? sup.stems, salt, subR, i + 13, true),
    };
  });
  const everyday = substrateShare('region', official);
  return {
    ...sub,
    stems: mixParts(sub.stems, sup.stems, salt, everyday, 1, true),
    mids: mixParts(sub.mids, sup.mids, salt, everyday, 2, false),
    kinds,
  };
}

/** 从两套词根里切出这一对独有的过渡词根(底层字头 + 上层字尾,让转写去读) */
function transitionalStems(sub: readonly Part[], sup: readonly Part[], salt: number, lane: number, n: number): Part[] {
  const out: Part[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const a = sub[Math.floor(keyed(salt, lane, i) * sub.length)];
    const b = sup[Math.floor(keyed(salt, lane, i, 1) * sup.length)];
    if (!a?.l || !b?.l) continue;
    const l = blendLatin(a.l, b.l);
    if (l.length < 3 || seen.has(l) || l === a.l || l === b.l) continue;
    seen.add(l);
    out.push({ l });
  }
  return out;
}

/** 这一对独有的过渡词尾:上层的音、偶而借底层的固定译法通名 */
function transitionalEnds(sub: readonly Weighted<Part>[], sup: readonly Weighted<Part>[], salt: number, lane: number): Weighted<Part>[] {
  const out: Weighted<Part>[] = [];
  const seen = new Set<string>();
  const subItems = sub.map((x) => x.item);
  const supItems = sup.map((x) => x.item);
  if (!subItems.length || !supItems.length) return out;
  for (let i = 0; i < 12 && out.length < 4; i++) {
    const a = subItems[Math.floor(keyed(salt, lane, 30, i) * subItems.length)];
    const b = supItems[Math.floor(keyed(salt, lane, 31, i) * supItems.length)];
    const l = blendLatin(a.l || 'a', b.l || 'en').replace(/^./, (c) => c.toLowerCase());
    if (l.length < 2 || seen.has(l)) continue;
    seen.add(l);
    const gen = a.gen || b.gen ? (a.zh && a.gen ? a : b.zh && b.gen ? b : undefined) : undefined;
    out.push({ item: gen && keyed(salt, lane, 32, i) < 0.35 ? { l: b.l || l, zh: gen.zh, gen: true } : { l }, w: 1 });
  }
  return out;
}

function blendLatin(a: string, b: string): string {
  const an = a.toLowerCase();
  const bn = b.toLowerCase();
  const aCut = firstVowel(an);
  const bCut = firstVowel(bn);
  let s = (aCut > 0 ? an.slice(0, aCut) : an.slice(0, Math.max(1, Math.ceil(an.length / 2)))) + (bCut >= 0 ? bn.slice(bCut) : bn.slice(Math.floor(bn.length / 2)));
  s = s.replace(/[^a-z]/g, '');
  if (s.length < 3) s = (an + bn).replace(/[^a-z]/g, '').slice(0, 6);
  return s;
}

function firstVowel(s: string): number {
  return s.search(/[aeiouy]/);
}

/** 东方:从两套语感各起一个候选,专名和通名按主次拆开再拼,偶而用这一对独有的过渡用字 */
export function easternContactCandidate(
  sub: EasternStyle,
  sup: EasternStyle,
  kind: NameKind,
  rng: Rng,
  reserved: readonly string[],
  official = false,
): Candidate | null {
  const a = easternCandidate(sub, kind, rng);
  const b = easternCandidate(sup, kind, rng);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const subR = substrateShare(kind, official);
  const everyday = kind === 'region' || kind === 'mountain' || kind === 'sea' || kind === 'river';
  const stemSub = rng() < subR;
  const genSub = everyday ? rng() < Math.max(subR, 0.75) : rng() < (official ? 0.35 : 0.45);
  const stemSrc = stemSub ? a : b;
  const genSrc = genSub ? a : b;
  let core = stripGeneric(stemSrc);
  let generic = genSrc.generic;
  if (rng() < 0.16 && reserved.length >= 2) {
    const i = Math.floor(rng() * reserved.length);
    const j = Math.floor(rng() * reserved.length);
    if (i !== j) core = reserved[i] + reserved[j];
  }
  let zh: string;
  if (generic) zh = core + generic;
  else if (![...stemSrc.zh].length || [...stemSrc.zh].length !== [...(stemSub ? a : b).zh].length) zh = mixChars(a.zh, b.zh, stemSub);
  else zh = mixChars(a.zh, b.zh, stemSub);
  if ([...zh].length < 2) zh = stemSrc.zh;
  return { zh, generic: generic && zh.endsWith(generic) ? generic : undefined, tokens: uniqueTokens(stemSrc.tokens, genSrc.tokens, core) };
}

/** 从两套东方语感里抽出这一对偏爱的过渡用字(采样,结果只随盐变) */
export function contactChars(sub: EasternStyle, sup: EasternStyle, salt: number): string[] {
  const freq = new Map<string, number>();
  const rng = mulberry32(subSeed(salt, 'east-contact-chars'));
  for (const st of [sub, sup]) {
    for (const kind of NAME_KINDS) {
      for (let i = 0; i < 40; i++) {
        const c = easternCandidate(st, kind, rng);
        if (!c) continue;
        for (const ch of stripGeneric(c)) freq.set(ch, (freq.get(ch) ?? 0) + 1);
      }
    }
  }
  const ranked = [...freq.keys()].sort((a, b) => freq.get(b)! - freq.get(a)! || (a < b ? -1 : 1));
  if (!ranked.length) return [];
  const off = Math.floor(keyed(salt, 7) * ranked.length);
  const rot = ranked.slice(off).concat(ranked.slice(0, off));
  return rot.slice(0, Math.max(6, Math.min(12, Math.ceil(rot.length * 0.18))));
}

function stripGeneric(c: Candidate): string {
  if (c.generic && c.zh.endsWith(c.generic) && c.zh.length > c.generic.length) return c.zh.slice(0, -c.generic.length);
  return c.zh;
}

function mixChars(a: string, b: string, leadA: boolean): string {
  const ca = [...(leadA ? a : b)];
  const cb = [...(leadA ? b : a)];
  if (!ca.length) return cb.join('');
  if (cb.length <= 1) return ca.join('');
  return ca[0] + cb.slice(1).join('').slice(0, Math.max(1, ca.length - 1));
}

function uniqueTokens(...lists: Array<readonly string[] | string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of lists) {
    const items = typeof x === 'string' ? (x ? [x] : []) : x;
    for (const t of items) {
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 6);
}

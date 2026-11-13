/**
 * 改制:国中流行的思潮和现行政体对不上(亨廷顿:社会变得比制度快就动荡)、国用不足、刚打了败仗,朝廷就议改制;
 * 议不成、动荡大的起兵革命;共和国禁军强、国用窘迫时统兵的将军政变;新制不到五十年、朝廷窘迫时复辟。
 * 挂在议事(council.ts)的看内政上:议事够格的国家(州数、立国年数、不在打仗)每回先看这里,出了一件就不再议别的(一回只出一件)。
 *
 * **政体**(regime.ts):在位表的每一段(Polity.dynasties)是王室的一朝,或改制开的共和(regime = republic)、军政府(junta)、神权(theocracy)。
 * 改共和、政变、还政、复辟、立神权、废神权都往 Polity.dynasties 加一段,在位表跟着重排(polities.ts 的 dynastyReign):
 *   共和、军政府的执政有任期(rulers.ts 照共和一系排),神权按教职终身继任,都没有王室;复辟迎回旧王室的那一段记 house(国名词根、旗照那一朝)。
 * 议政、参与两样(界面的「议政」「参与」两条,讨论稿的维度 2、3)由议事、改制的史事重建(councilRules.ts 的 Rules.charter、franchise)。
 *
 * **思潮**(ideology.ts,各国国中各说的接受度,最近算的那一步):
 *   推力 push = 共治 + 民权 + PUSH_EQ × 均产 − PUSH_SKY × 天命(天命之说撑着君主;共治、民权要众人议政)。
 *   窘迫 crisis = 国用不足(0–1)+ 败仗(DEFEAT_YEARS 年内被别国打下的州,LOST_FULL 州算满 1)。
 *
 * **有君主的国家**(王室的一段,不是海洋城邦共和一系):推力到 PUSH_MIN 才议;议哪一件:
 *   ① 还没设议事会、议会的:小国(不到 SMALL 州)共治比民权盛就直接议废君立共和(城中众人共议,像罗马逐王),不然议立宪;
 *   ② 设了议事会 / 议会的:共治 + 民权到 ABOLISH_MIN、又窘迫,议废君;能议政的人还能多(参与不到全体成年人)、民权 + 均产到 WIDEN_MIN,议扩大参与;
 *      还没设议会、民权到 RIGHT_MIN 的接着议立宪。
 *   分 x = X_0 + X_PUSH × (推力 − PUSH_MIN) + X_CRISIS × 窘迫 − X_SKY × (天命 − SKY_REF) − X_ARMY × 禁军(军制 > 0 的那几成)
 *          − POLAR × (动荡 − POLAR_U,不到不扣;两边越吵越僵)+ 随机(± JITTER / 2);
 *   废君再减 ABOLISH_HARD + ABOLISH_BIG × min(1, 州数 ÷ BIG_SIZE)(比立宪难,大国更难)。
 *   x 过 DONE 办成、过 HALF 妥协(立宪、废君:只设议事会;已经设了的算搁置)、过 SHELVE 搁置,再低谈崩(扩大参与谈崩算搁置)。
 *   民权不到 RIGHT_MIN 的立宪最多妥协(设议事会、不限君权;办成才设议会,政体名成立宪王国 / 帝国)。
 *   **谈崩**:动荡到 REVOLT_U 才有人起兵(不然算搁置),在国中城民最多的那州(不是国都、SETTLE 年没换过国家)起事 ——
 *     打得进国都(y = REV_0 + REV_U × (动荡 − REVOLT_U) + REV_PUSH × 推力 − REV_ARMY × 禁军 + 随机 > 0)= 革命:整国改共和(记 reform n = 0,
 *     起兵的人做首任执政);打不进 = 那州连同近处几州(至少 REBEL_MIN 州,最多国土的 REV_SHARE)据地自立为共和国(split,cause = revolution);
 *     地方起不了兵(干预禁止分裂、州刚换过国家……)= 搁置。
 *   办成废君、革命以后能议政的:推力到 OPEN_PUSH 的至少到有产者(Annal.opt),不然只有贵族(贵族共和国);革命再多一档。
 * **共和、军政府**:
 *   ③ 政变(共和那几段;改出来的、海洋城邦共和一系的都算):窘迫、禁军(军制 > 0)或败仗,上回改制满 REFORM_GAP 年 ——
 *      赔率 COUP_ODDS × (1 + COUP_ARMY × 禁军)× (1 + 窘迫)(海洋城邦共和一系乘 SEA_COUP),掷中就将军夺权、改军政府(记 reform n = 1)。
 *   ④ 复辟(共和、军政府;本国原来有君主、改制不到 RESTORE_YEARS 年):窘迫(或天命之说比共治 + 民权还盛),
 *      天命之说还在(到 RESTORE_SKY,军政府不要)——
 *      赔率 RESTORE_ODDS × (1 + 窘迫)× (1 + 天命);掷中:改制不到 HOUSE_YEARS 年的迎回旧王室(house),
 *      再晚的旧王室没人了,此刻的执政 / 将军自立为君(当成换了一朝,记 reform n = 2,b = −1)。
 *   ⑤ 还政(军政府满 RETURN_AGE 年):议事,x = RET_0 + RET_PUSH × (共治 + 民权)− RET_WAR × (好战 − 50) / 50 + 随机;办成复行共和、搁置。
 *   ⑥ 扩大参与(共和那几段):同 ②。
 *   ⑦ 立神权(王室的一段、共和那几段;军政府不走这条;王室的一段先看①②的世俗改制,这一回没有要议的才看这条):
 *      国教不是民间信仰、本国信国教的州到 THEO_FAITH,上回改制满 REFORM_GAP 年 ——
 *      赔率 THEO_ODDS × (1 + 国教占比超过门槛的那一截,再乘天命)× 世俗倍数(secularMul:集权、大国、设了议会抵得住;
 *      割据、最低一档、新分出、动荡、窘迫、新朝初立容易)× 政体倍数(君主 1、改出来的共和 THEO_REPUBLIC、海洋城邦共和 THEO_SEA)
 *      × 入世倍数(ENGAGE_0 + ENGAGE_K × 国教的入世程度);掷中就废君号 / 废执政,立教宗、大祭司或国师主国(记 reform n = 3)。
 *      别的进路(教团夺权、教众起事、起事自立立神权国)在 theocracy.ts。
 *   ⑧ 废神权(神权那一段):满 THEO_LEAVE 年 —— 赔率 THEO_LEAVE_ODDS × (1 + 共治民权)× (1 − max(0, 国教占比 − LEAVE_FAITH0))
 *      × (1 + 窘迫)× (LEAVE_E0 − LEAVE_EK × 入世程度);本国原来有君主的也可走上面的复辟;掷中废神权、复行共和(记 reform n = 4)。
 *
 * **政体脾气**:改出来的共和国执政少开战、军政府的执政好战、神权少开战偏内治(rulers.ts 的 COMMONWEALTH_SHIFT、JUNTA_SHIFT、THEOCRACY_SHIFT,加在共和一系的倾向偏移上);
 *   改制开的一段不算"改朝换代之乱"(wars.ts、treaties.ts 的乘乱),但和改朝换代一样从头算"当朝几年"(动荡、国用宽限)。
 *
 * **不存内存状态**:政体在 Polity.dynasties,议政、参与、上回改制的年份由史事重建(resumeCouncil)。
 * 随机数:keyed4(subSeed(seed, 'civ-reform'), 国家锚, 第几次看内政, 用途),和处理顺序无关。纯计算,不碰 DOM。
 */
import { Layer, type Annal, type AnnalCause, type Polity, type RulerLeanings, type Year } from './types';
import { keyed4 } from './engine/rand';
import type { CivSim } from './engine/sim';
import { dynastyReign, rulerOf, type PolityModel } from './polities';
import { politicsCheckTime, type PoliticsModel } from './politics';
import type { WarModel } from './wars';
import type { ControlModel } from './control';
import { capitalAt, populationAt } from './growth';
import { drawLeanings, reignBorn } from './rulers';
import { Issue, Outcome, REFORM_COUP, REFORM_LAICIZE, REFORM_RESTORE, REFORM_REVOLUTION, REFORM_THEOCRACY, REVOLT_CHARTER, REVOLT_FRANCHISE, applyReform, type Rules } from './councilRules';
import { segRegime } from './regime';
import { faithSimOf } from './religion';
import { ideoModelOf, nationalNow } from './ideology';
import { civApi } from './api';
import { defineKnobs } from './engine/knobs';

// ---- 调参(以 20 个种子的统计为准,见 scripts/reform-stats.ts) ----
/** 这一段的旋钮(名字、官方的值;推演照这个世界的那套数算,见 engine/knobs.ts) */
export const REFORM_KNOBS = defineKnobs('reform', {
  /** 推力:均产算几成、天命扣几成;到 PUSH_MIN 才议改制 */
  PUSH_EQ: 0.5,
  PUSH_SKY: 0.6,
  PUSH_MIN: 0.2,
  /** 天命之说到这么多算寻常(多了扣分、少了加分) */
  SKY_REF: 0.4,
  /** 还没设议事会的小国(不到 SMALL 州)共治盛就直接议废君;大国先议立宪 */
  SMALL: 20,
  /** 立宪要办成(设议会)民权至少多少;不够最多妥协(设议事会) */
  RIGHT_MIN: 0.12,
  /** 败仗:几年内被打下的州、几州算满 */
  DEFEAT_YEARS: 30,
  LOST_FULL: 6,
  /** 议废君:共治 + 民权至少多少(设了议事会、议会以后还要窘迫) */
  ABOLISH_MIN: 0.4,
  /** 议扩大参与:民权 + 均产至少多少 */
  WIDEN_MIN: 0.35,
  /** 改制的分 */
  X_0: 0.05,
  X_PUSH: 1,
  X_CRISIS: 0.2,
  X_SKY: 0.6,
  X_ARMY: 0.25,
  /** 废君比立宪难:先扣 ABOLISH_HARD,国土越大越难(到 BIG_SIZE 州扣满 ABOLISH_BIG) */
  ABOLISH_HARD: 0.2,
  ABOLISH_BIG: 0.3,
  BIG_SIZE: 40,
  JITTER: 0.8,
  /** 动荡到 POLAR_U 以上,两边越吵越僵:每多 1 扣 POLAR 分(谈崩、起兵多一点) */
  POLAR_U: 0.5,
  POLAR: 0.4,
  /** 门槛:办成、妥协、搁置(再低谈崩) */
  DONE: 0.25,
  HALF: 0,
  SHELVE: -0.5,
  /** 谈崩起兵:动荡至少多少;打不打得进国都 */
  REVOLT_U: 0.6,
  REV_0: -0.2,
  REV_U: 0.6,
  REV_PUSH: 0.6,
  REV_ARMY: 0.4,
  /** 打不进国都、据地自立:至少几州(和削藩谈崩一样)、最多占国土几成 */
  REBEL_MIN: 5,
  REV_SHARE: 0.3,
  /** 起事的州这么多年没换过国家(和分裂、割据一样) */
  SETTLE: 30,
  /** 办成废君 / 革命以后,推力到这么多的至少到有产者能议政 */
  OPEN_PUSH: 0.45,
  /** 政变、复辟、还政:上回改制至少隔几年 */
  REFORM_GAP: 12,
  /** 政变的赔率 */
  COUP_ODDS: 0.06,
  COUP_ARMY: 2,
  SEA_COUP: 0.3,
  /** 复辟:改制多少年以内、天命至少多少;赔率;旧王室还有人的年数 */
  RESTORE_YEARS: 50,
  RESTORE_SKY: 0.1,
  RESTORE_ODDS: 0.45,
  HOUSE_YEARS: 35,
  /** 还政:军政府满几年才议;分 */
  RETURN_AGE: 15,
  RET_0: -0.1,
  RET_PUSH: 0.8,
  RET_WAR: 0.3,
  /** 政变的将军、革命起兵的人:年纪(随机)、倾向偏移(将军好战) */
  LEADER_AGE: [36, 58] as [number, number],
  /** 立神权:本国信国教的州至少多少;赔率;天命再乘多少(窘迫并进了"世俗弱",见 secularMul) */
  THEO_FAITH: 0.45,
  THEO_ODDS: 0.03,
  THEO_SKY: 0.6,
  /**
   * 世俗强弱(神权设计稿第 2、5 节):强 = STRONG_CENTRAL × 收归朝廷几样 ÷ 3 + STRONG_SIZE × min(1, 州数 ÷ BIG_SIZE) + STRONG_CHARTER × 设了议事会 / 议会;
   * 弱 = min(WEAK_MAX, WEAK_LORD × 割据的州占几成 + WEAK_TRIBE × 还在最低一档 + WEAK_YOUNG × 新分出的国(YOUNG_YEARS 年内)
   *        + WEAK_UNREST × min(1, 动荡 ÷ 2) + WEAK_BROKE × 窘迫 + WEAK_NEW × 新朝初立(NEW_YEARS 年内));
   * 倍数 = (1 − SEC_RESIST × 强)× (1 + SEC_SUSCEPT × 弱)
   */
  STRONG_CENTRAL: 0.5,
  STRONG_SIZE: 0.3,
  STRONG_CHARTER: 0.2,
  WEAK_LORD: 2,
  WEAK_TRIBE: 0.6,
  WEAK_YOUNG: 0.6,
  YOUNG_YEARS: 120,
  WEAK_UNREST: 0.6,
  WEAK_BROKE: 0.4,
  WEAK_NEW: 0.3,
  NEW_YEARS: 60,
  WEAK_MAX: 1.5,
  SEC_RESIST: 0.85,
  SEC_SUSCEPT: 1,
  /** 政体倍数:改出来的共和、海洋城邦共和一系(军政府不立神权) */
  THEO_REPUBLIC: 0.3,
  THEO_SEA: 0.15,
  /** 入世倍数 = ENGAGE_0 + ENGAGE_K × 国教的入世程度(religion.ts 的 faithEngage) */
  ENGAGE_0: 0.25,
  ENGAGE_K: 1.5,
  /**
   * 废神权:满 THEO_LEAVE 年才看;赔率 THEO_LEAVE_ODDS × (1 + 共治 + 民权)× (1 − max(0, 国教占比 − LEAVE_FAITH0))× (1 + 窘迫)
   * × (LEAVE_E0 − LEAVE_EK × 入世程度)
   */
  /**
   * 起事自立立神权国(politics.ts 的 secede:普通自立、割据自立、大崩解的继承国;复国、宗室争位、革命据地的不算):
   * 起事那片州的主流信仰和母国国教不同 —— 机会 REBEL_THEO × 异教程度(异教 1、同教异派 0.5)× (1 + 母国动荡)
   * × (大崩解 REBEL_THEO_COLLAPSE)× 入世倍数,最多 REBEL_THEO_MAX
   */
  REBEL_THEO: 0.08,
  REBEL_THEO_COLLAPSE: 1.5,
  REBEL_THEO_MAX: 0.35,
  /**
   * 教团专权、夺位(神权设计稿第 8 节;regency.ts 看王朝没换代时问 clericSeize):王国以上、国教占比到 THEO_FAITH、这些年有危机 ——
   * 机会 CLERIC_P × 入世倍数 × 世俗倍数(最多 CLERIC_MAX)出一位国师 / 大祭司专权;他到期 CLERIC_USURP 的机会夺位立神权,
   * 其余伏诛 / 卒于位(不改历史,只挡住这一回的大臣大将专权)
   */
  CLERIC_P: 0.15,
  CLERIC_MAX: 0.4,
  CLERIC_USURP: 0.3,
  /**
   * 教众革命:议立宪 / 废君谈崩起兵时,国教入世到 ZEALOT_E、天命之说盛过共治 + 民权 —— 有
   * min(ZEALOT_MAX, ZEALOT_K × 入世程度 × 2 × max(0, 国教占比 − ZEALOT_SHARE0))的机会是教众起事:打进国都立神权,打不进据地立神权国
   */
  ZEALOT_E: 0.5,
  ZEALOT_K: 0.5,
  ZEALOT_SHARE0: 0.3,
  ZEALOT_MAX: 0.6,
  /** 神权里的世俗革命:共治 + 民权到 SECULAR_PUSH、动荡到 REVOLT_U 才有人起兵(打分照 revolt,天命那一项换成国教占比) */
  SECULAR_PUSH: 0.4,
  /**
   * 大祭司交接之际(新的大祭司接任不到 PONTIFF_WINDOW 年、看内政时):机会 PONTIFF × (1 + 动荡)× (1.3 − 0.6 × 入世程度);
   * 掷中:旧王室还有人(废君 HOUSE_YEARS 年内)迎回复辟,不然有兵权的将军政变,再不然世俗大臣废神权
   */
  PONTIFF: 0.1,
  PONTIFF_WINDOW: 40,
  /**
   * 政体一变就有一头不服(教团夺位、教众起事、神权里的政变 / 革命 / 交接之际夺权):机会 DISSENT × e^(DISSENT_K × (动荡 − DISSENT_U0))
   * × (1 + 异教程度 / 入世程度);不服的那片州(DISSENT_MIN–DISSENT_MAX 州,最多国土 DISSENT_FRAC)据地自立:
   * 教团上台 = 信别的教、离国都远的那头立世俗国;世俗派上台 = 国教最盛的那头(圣城优先)立残余的神权国
   */
  DISSENT: 0.15,
  DISSENT_K: 1.2,
  DISSENT_U0: 1,
  DISSENT_MIN: 3,
  DISSENT_MAX: 10,
  DISSENT_FRAC: 0.25,
  THEO_LEAVE: 40,
  THEO_LEAVE_ODDS: 0.15,
  LEAVE_FAITH0: 0.5,
  LEAVE_E0: 1.3,
  LEAVE_EK: 0.6,
});
const GENERAL_SHIFT = { war: 15, expand: 5 };
const REBEL_SHIFT = { develop: 15, war: 5 };
const CLERIC_SHIFT = { develop: 5, war: -8, expand: -5 };

// 随机数用途(keyed4 第四位)
const U_JIT = 1;
const U_REV = 2;
const U_COUP = 3;
const U_RESTORE = 4;
const U_AGE = 5;
const U_THEO = 6;
const U_THEO_LEAVE = 7;
const U_CLERIC = 8;
const U_CLERIC_END = 9;
const U_ZEALOT = 10;
const U_THEO_COUP = 11;
const U_PONTIFF = 13;
const U_DISSENT = 14;
const U_DISSENT_R = 15;
/** keyed4 最后一位:看内政 0、作者干预 1、看王朝(教团专权)2、大祭司交接 3 */
const R_DYNASTY = 2;
const R_PONTIFF = 3;
/** 作者干预立神权:keyed4 第三位 = 这个数 + 第几条干预(和看内政的第几次错开) */
const U_AUTHOR_IV = 1 << 24;
/** 倾向的随机数从这里起(drawLeanings 的用途号加上去) */
const U_LEAN = 64;

/** 议事那边传过来的(council.ts 的 check 里算好的) */
/** 这张表的值(一套数里取出来的) */
export type ReformKnobs = typeof REFORM_KNOBS.values;

export interface ReformCtx {
  sim: CivSim;
  pm: PolityModel;
  pol: PoliticsModel;
  wm: WarModel;
  cm: ControlModel;
  /** subSeed(seed, 'civ-reform') */
  base: number;
  P: Polity;
  /** 第几次看内政 */
  k: number;
  t: Year;
  rules: Rules;
  /** 别的国家的规矩(革命据地自立的新国家立国就设议会) */
  rulesOf: (p: number) => Rules;
  /** 动荡、国用不足(0–1) */
  u: number;
  broke: number;
  capR: number;
  ready: (i: Issue) => boolean;
  /** 记一条议事(opt = 之后能议政的有几档) */
  record: (i: Issue, out: Outcome, region: number, opt?: number) => void;
}

/** 推演里:国家 p 被打下的州(DEFEAT_YEARS 年内,别国打下的;一州只算一次) */
function lostLately(wm: WarModel, p: number, t: Year): number {
  const { DEFEAT_YEARS } = wm.pm.knobs.get(REFORM_KNOBS);
  const seen = new Set<number>();
  for (let i = wm.wars.length - 1; i >= 0; i--) {
    const w = wm.wars[i];
    if (!w || (w.a !== p && w.b !== p)) continue;
    if (w.end !== undefined && t - w.end >= DEFEAT_YEARS) continue;
    for (const e of w.takes) if (e.by !== p && t - e.year < DEFEAT_YEARS) seen.add(e.region);
  }
  return seen.size;
}

/** 看一回改制;出了一件事(议了、起兵、政变、复辟)= true,议事那边就不再议别的 */
export function reformCheck(cx: ReformCtx): boolean {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { PUSH_EQ, PUSH_SKY, LOST_FULL, PUSH_MIN, SMALL, ABOLISH_MIN, WIDEN_MIN, RIGHT_MIN, X_0, X_PUSH, X_CRISIS, X_SKY, SKY_REF, X_ARMY, JITTER, ABOLISH_HARD, ABOLISH_BIG, BIG_SIZE, POLAR, POLAR_U, DONE, HALF, SHELVE, REFORM_GAP, RESTORE_YEARS, RESTORE_SKY, RESTORE_ODDS, HOUSE_YEARS, COUP_ODDS, COUP_ARMY, SEA_COUP, RETURN_AGE, RET_0, RET_PUSH, RET_WAR } = K;
  const { sim, pm, P, k, t } = cx;
  const p = P.id;
  const seg = (P.dynasties?.length ?? 1) - 1;
  const regime = segRegime(P, seg);
  const im = ideoModelOf(sim);
  const sh = im ? nationalNow(im, p) : null;
  const sky = sh ? sh[0] : 0;
  const share = sh ? sh[2] : 0;
  const right = sh ? sh[4] : 0;
  const equal = sh ? sh[6] : 0;
  const push = share + right + PUSH_EQ * equal - PUSH_SKY * sky;
  const lost = lostLately(cx.wm, p, t);
  const crisis = cx.broke + Math.min(1, lost / LOST_FULL);
  const army = Math.max(0, cx.rules.army);
  const R = (use: number) => keyed4(cx.base, pm.ptag[p], k, use, 0);
  const since = t - cx.rules.reformed;

  if (regime === 'crown') {
    // 先看世俗改制(立宪、废君、扩大参与);这一回没有要议的,才看立神权 —— 世俗改革正盛的国家不会同时被教团接管
    const r = cx.rules;
    let issue: Issue | null = null;
    if (push >= PUSH_MIN) {
      if (r.charter === 0) issue = share > right && pm.size[p] < SMALL ? Issue.Abolish : Issue.Charter;
      else if (share + right >= ABOLISH_MIN && crisis > 0) issue = Issue.Abolish;
      else if (r.franchise < 3 && right + equal >= WIDEN_MIN) issue = Issue.Widen;
      else if (r.charter < 2 && right >= RIGHT_MIN) issue = Issue.Charter;
    }
    if (issue === null || !cx.ready(issue)) return tryTheocracy(cx, regime, sky, since, R);
    let x = X_0 + X_PUSH * (push - PUSH_MIN) + X_CRISIS * crisis - X_SKY * (sky - SKY_REF) - X_ARMY * army + JITTER * (R(U_JIT) - 0.5);
    if (issue === Issue.Abolish) x -= ABOLISH_HARD + ABOLISH_BIG * Math.min(1, pm.size[p] / BIG_SIZE);
    if (issue !== Issue.Widen) x -= POLAR * Math.max(0, cx.u - POLAR_U);
    let out = x > DONE ? Outcome.Done : x > HALF ? Outcome.Half : x > SHELVE ? Outcome.Shelve : Outcome.Break;
    // 民权还不盛:立宪最多设议事会;已经设了议事会的,妥协就是维持现状
    if (issue === Issue.Charter && out === Outcome.Done && right < RIGHT_MIN) out = Outcome.Half;
    if (out === Outcome.Half && r.charter >= 1) out = Outcome.Shelve;
    if (issue === Issue.Widen && out === Outcome.Half) out = Outcome.Shelve;
    if (out === Outcome.Break) {
      const zealot = issue !== Issue.Widen && sky > share + right && zealotOdds(cx) > R(U_ZEALOT);
      return (issue !== Issue.Widen && revolt(cx, issue, push, R, zealot ? 'zealot' : undefined)) || (cx.record(issue, Outcome.Shelve, cx.capR), true);
    }
    const opt = issue === Issue.Abolish && out === Outcome.Done ? openness(K, push, r.franchise, 0) : undefined;
    cx.record(issue, out, cx.capR, opt);
    if (issue === Issue.Abolish && out === Outcome.Done) openSeg(cx, { regime: 'republic' });
    return true;
  }

  // 共和、军政府、神权:复辟、政变、还政、立神权、废神权、扩大参与
  // 复辟:窘迫,或者天命之说比共治、民权还盛(人心思旧);神权也能复辟
  if (since >= REFORM_GAP && (crisis > 0 || sky > share + right) && P.lineage !== 'republic') {
    const crown = lastCrown(P, seg);
    const abolished = crown >= 0 ? P.dynasties![crown + 1].year : -Infinity;
    if (t - abolished < RESTORE_YEARS && (regime === 'junta' || regime === 'theocracy' || sky >= RESTORE_SKY)) {
      const odds = RESTORE_ODDS * (1 + crisis) * (1 + sky);
      if (R(U_RESTORE) < odds) {
        const now = rulerOf(pm, p, t);
        const house = t - abolished < HOUSE_YEARS ? (P.dynasties![crown].house ?? crown) : -1;
        if (house >= 0 || !now.crown) {
          note(cx, { b: house, region: cx.capR, settlement: capitalAt(P, t), n: REFORM_RESTORE });
          if (house >= 0) openSeg(cx, { house });
          else openSeg(cx, { usurper: { born: reignBorn(now), leanings: { ...now.leanings } } });
          return true;
        }
      }
    }
  }
  if (regime === 'republic' && since >= REFORM_GAP && crisis > 0 && (army > 0 || lost > 0)) {
    const odds = COUP_ODDS * (1 + COUP_ARMY * army) * (1 + crisis) * (P.lineage === 'republic' ? SEA_COUP : 1);
    if (R(U_COUP) < odds / (1 + odds)) {
      note(cx, { b: -1, region: cx.capR, settlement: capitalAt(P, t), n: REFORM_COUP });
      openSeg(cx, { regime: 'junta', usurper: leader(cx, R, GENERAL_SHIFT) });
      return true;
    }
  }
  if (regime === 'republic' && tryTheocracy(cx, regime, sky, since, R)) return true;
  if (regime === 'theocracy') {
    const e = stateEngage(cx);
    // 世俗将军政变(照共和国的政变,× 出世的教团更容易交权)
    if (since >= REFORM_GAP && crisis > 0 && (army > 0 || lost > 0)) {
      const odds = COUP_ODDS * (1 + COUP_ARMY * army) * (1 + crisis) * leaveMul(K, e);
      if (R(U_THEO_COUP) < odds / (1 + odds)) {
        note(cx, { b: -1, region: cx.capR, settlement: capitalAt(P, t), n: REFORM_COUP, cause: 'secular' });
        openSeg(cx, { regime: 'junta', usurper: leader(cx, R, GENERAL_SHIFT) });
        dissent(cx, 'secular', R);
        return true;
      }
    }
    // 世俗革命:共治、民权盛,动荡大,有人起兵
    if (since >= REFORM_GAP && share + right >= K.SECULAR_PUSH && revolt(cx, null, share + right - K.PUSH_SKY * stateFaithShare(cx), R, 'secular')) return true;
    // 大祭司交接之际
    if (since >= REFORM_GAP && pontiffSeize(cx)) return true;
    if (tryLaicize(cx, share, right, crisis, since, R)) return true;
    return false;
  }
  if (regime === 'junta') {
    const age = t - P.dynasties![seg].year;
    if (age >= RETURN_AGE && cx.ready(Issue.Return)) {
      const ruler = rulerOf(pm, p, t).leanings;
      const x = RET_0 + RET_PUSH * (share + right) - (RET_WAR * (ruler.war - 50)) / 50 + JITTER * (R(U_JIT) - 0.5);
      const out = x > 0 ? Outcome.Done : Outcome.Shelve;
      cx.record(Issue.Return, out, cx.capR);
      if (out === Outcome.Done) openSeg(cx, { regime: 'republic' });
      return true;
    }
    return false;
  }
  // 共和:扩大参与
  if (regime === 'republic' && cx.rules.franchise < 3 && right + equal >= WIDEN_MIN && cx.ready(Issue.Widen)) {
    const x = X_0 + X_PUSH * push + X_CRISIS * crisis + JITTER * (R(U_JIT) - 0.5);
    cx.record(Issue.Widen, x > DONE ? Outcome.Done : Outcome.Shelve, cx.capR);
    return true;
  }
  return false;
}

/** 办成废君、革命以后能议政的有几档(at least = 现在的;革命再多 extra 档) */
function openness(K: ReformKnobs, push: number, now: number, extra: number): number {
  const { OPEN_PUSH } = K;
  return Math.min(3, Math.max(now, push >= OPEN_PUSH ? 1 : 0) + extra);
}

/** 本国信国教的州占几成(没有国教、只剩民间信仰 = 0) */
function stateFaithShare(cx: ReformCtx): number {
  const fs = faithSimOf(cx.sim);
  if (!fs) return 0;
  const fid = fs.stateFaith(cx.P.id);
  if (fid < 0 || fs.folk(fid)) return 0;
  const lands = cx.pm.lands[cx.P.id];
  if (!lands.length) return 0;
  let hit = 0;
  for (const r of lands) if (fs.faith[r] === fid) hit++;
  return hit / lands.length;
}

/** 立神权:国教既盛,废君号或废执政,立教宗 / 大祭司 / 国师主国 */
function tryTheocracy(cx: ReformCtx, regime: 'crown' | 'republic', sky: number, since: number, R: (use: number) => number): boolean {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { REFORM_GAP, THEO_FAITH, THEO_ODDS, THEO_SKY } = K;
  if (since < REFORM_GAP) return false;
  const share = stateFaithShare(cx);
  if (share < THEO_FAITH) return false;
  const fill = THEO_FAITH >= 1 ? 1 : (share - THEO_FAITH) / (1 - THEO_FAITH);
  const odds = THEO_ODDS * (1 + fill * (1 + THEO_SKY * sky)) * secularMul(cx) * regimeMul(K, cx.P, regime) * engageMul(K, stateEngage(cx));
  if (R(U_THEO) >= odds / (1 + odds)) return false;
  note(cx, { b: -1, region: cx.capR, settlement: capitalAt(cx.P, cx.t), n: REFORM_THEOCRACY });
  openSeg(cx, { regime: 'theocracy', usurper: leader(cx, R, CLERIC_SHIFT) });
  return true;
}

/** 立神权的政体倍数:君主 1、改出来的共和 THEO_REPUBLIC、海洋城邦共和一系 THEO_SEA(军政府不走这条) */
export function regimeMul(K: ReformKnobs, P: Polity, regime: 'crown' | 'republic' | 'junta' | 'theocracy'): number {
  if (regime === 'crown') return 1;
  if (regime === 'republic') return P.lineage === 'republic' ? K.THEO_SEA : K.THEO_REPUBLIC;
  return 0;
}

/** 入世倍数:ENGAGE_0 + ENGAGE_K × 入世程度(出世的教 ×0.3 左右、入世的 ×1.6 左右) */
export function engageMul(K: ReformKnobs, engage: number): number {
  return K.ENGAGE_0 + K.ENGAGE_K * engage;
}

/** 世俗夺权、废神权的倍数:LEAVE_E0 − LEAVE_EK × 入世程度(出世的教团掌权更容易交权) */
export function leaveMul(K: ReformKnobs, engage: number): number {
  return Math.max(0, K.LEAVE_E0 - K.LEAVE_EK * engage);
}

/** 本国国教的入世程度(没有国教、民间信仰 = 0) */
export function stateEngage(cx: Pick<ReformCtx, 'pm' | 'P'>): number {
  const f = cx.pm.stateFaith?.(cx.P.id) ?? -1;
  return f >= 0 ? (cx.pm.faithEngage?.(f) ?? 0) : 0;
}

/**
 * 世俗强弱的倍数(见 REFORM_KNOBS 的 STRONG_* / WEAK_*):集权、大国、设了议会的抵得住教团;
 * 割据多、还是最低一档、新分出来、动荡、窘迫、新朝初立的容易被教团接管。强国 ×0.15 左右,弱国到 ×2.5
 */
export function secularMul(cx: Pick<ReformCtx, 'pm' | 'cm' | 'P' | 't' | 'rules' | 'u' | 'broke'>): number {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { pm, P, t, rules: r } = cx;
  const p = P.id;
  const n = pm.size[p];
  const central = (r.tax >= 2 ? 1 : r.tax === 1 ? 0.5 : 0) + Math.max(0, r.army) + Math.max(0, r.office);
  const strong = K.STRONG_CENTRAL * Math.min(1, central / 3) + K.STRONG_SIZE * Math.min(1, n / K.BIG_SIZE) + K.STRONG_CHARTER * (r.charter >= 1 ? 1 : 0);
  let lord = 0;
  if (n > 0 && cx.cm.mark(p, t)) {
    let k = 0;
    for (const q of pm.lands[p]) if (cx.cm.inLord(q)) k++;
    lord = k / n;
  }
  const d = P.dynasties;
  const seg = d && d.length ? d[d.length - 1].year : P.founded;
  const weak = Math.min(
    K.WEAK_MAX,
    K.WEAK_LORD * lord +
      K.WEAK_TRIBE * (pm.tier[p] <= 0 ? 1 : 0) +
      K.WEAK_YOUNG * (P.parent !== undefined && P.parent >= 0 && t - P.founded < K.YOUNG_YEARS ? 1 : 0) +
      K.WEAK_UNREST * Math.min(1, Math.max(0, cx.u) / 2) +
      K.WEAK_BROKE * Math.min(1, cx.broke) +
      K.WEAK_NEW * (d && d.length > 1 && t - seg < K.NEW_YEARS ? 1 : 0),
  );
  return (1 - K.SEC_RESIST * strong) * (1 + K.SEC_SUSCEPT * weak);
}

/** 废神权、复行共和(本国原来有君主的也可走复辟,这里只管回到共和) */
function tryLaicize(cx: ReformCtx, share: number, right: number, crisis: number, since: number, R: (use: number) => number): boolean {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { THEO_LEAVE, THEO_LEAVE_ODDS, LEAVE_FAITH0 } = K;
  if (since < THEO_LEAVE) return false;
  const faith = stateFaithShare(cx);
  const odds = THEO_LEAVE_ODDS * (1 + share + right) * (1 - Math.max(0, faith - LEAVE_FAITH0)) * (1 + crisis) * leaveMul(K, stateEngage(cx));
  if (R(U_THEO_LEAVE) >= odds / (1 + odds)) return false;
  note(cx, { b: -1, region: cx.capR, settlement: capitalAt(cx.P, cx.t), n: REFORM_LAICIZE });
  openSeg(cx, { regime: 'republic' });
  return true;
}

/** 作者干预立 / 废神权:那时本来就是(立)、本来就不是(废)神权(史事 intervene 的 b 列) */
export const IV_THEO_SAME = -4;

/** 作者干预立 / 废神权要的那几样(council.ts 给;不看内政、不掷赔率) */
export type AuthorTheocracyCtx = Pick<ReformCtx, 'sim' | 'pm' | 'P' | 't' | 'rules' | 'base' | 'capR'>;

/**
 * 作者干预立神权(end = false:君主国、共和、军政府都改立教职主国)/ 废神权(end = true:复行共和)。
 * 先看能不能(返回史事 intervene 的 b 列:−1 能 / IV_THEO_SAME);do_ = true 时真改:记一条 reform(n = 立 / 废神权,和推演里的一样,
 * 接着推时规矩照史事重建)、在位表加一段。教宗 / 大祭司的生年、倾向按"国家锚 + 第几条干预"取,和处理顺序无关
 */
export function authorTheocracy(cx: AuthorTheocracyCtx, end: boolean, iv: number, do_: boolean): number {
  const seg = (cx.P.dynasties?.length ?? 1) - 1;
  const theo = segRegime(cx.P, seg) === 'theocracy';
  if (theo !== end) return IV_THEO_SAME;
  if (!do_) return -1;
  const R = (use: number) => keyed4(cx.base, cx.pm.ptag[cx.P.id], U_AUTHOR_IV + iv, use, 1);
  note(cx, { b: -1, region: cx.capR, settlement: capitalAt(cx.P, cx.t), n: end ? REFORM_LAICIZE : REFORM_THEOCRACY });
  openSeg(cx, end ? { regime: 'republic' } : { regime: 'theocracy', usurper: leader(cx, R, CLERIC_SHIFT) });
  return -1;
}

/** 第 seg 段往前最近的一段王室(没有 = −1) */
function lastCrown(P: Polity, seg: number): number {
  const d = P.dynasties;
  if (!d) return -1;
  for (let i = seg; i >= 0; i--) if (!d[i].regime) return i;
  return -1;
}

/** 政变的将军、革命起兵的人:生年、倾向 */
function leader(cx: AuthorTheocracyCtx, R: (use: number) => number, shift: Partial<Record<'expand' | 'war' | 'develop' | 'trade', number>>) {
  const { LEADER_AGE } = cx.pm.knobs.get(REFORM_KNOBS);
  const age = LEADER_AGE[0] + (LEADER_AGE[1] - LEADER_AGE[0]) * R(U_AGE);
  return { born: Math.round((cx.t - age) * 256) / 256, leanings: drawLeanings((use) => R(U_LEAN + use), 'republic', cx.P.kind, shift) };
}

/** 记一条史事 reform,规矩跟着改(和接着推时由史事重建的一样,councilRules.ts 的 applyReform) */
function note(cx: AuthorTheocracyCtx, f: Pick<Annal, 'b' | 'region' | 'settlement' | 'n'> & { opt?: number; cause?: AnnalCause }): void {
  cx.sim.record('reform', { a: cx.P.id, ...f });
  applyReform(cx.rules, { year: cx.t, n: f.n, opt: f.opt });
}

/** 往在位表加一段(改共和、政变、还政、复辟):国都照旧;在位表重排,这一段的第一位下一刻起在位 */
function openSeg(cx: AuthorTheocracyCtx, seg: { regime?: 'republic' | 'junta' | 'theocracy'; house?: number; usurper?: { born: Year; leanings: RulerLeanings } }): void {
  const { P, t } = cx;
  if (!P.dynasties) P.dynasties = [{ year: P.founded, name: '', seat: P.capital }];
  P.dynasties.push({
    year: t,
    name: '',
    seat: capitalAt(P, t),
    ...(seg.usurper ? { usurper: seg.usurper } : {}),
    ...(seg.regime ? { regime: seg.regime } : {}),
    ...(seg.house !== undefined ? { house: seg.house } : {}),
  });
  dynastyReign(cx.sim, cx.pm, P.id, t);
}

/**
 * 议立宪 / 废君谈崩、动荡大:有人起兵。打进国都 = 革命(整国改共和);打不进 = 据地自立为共和国;起不了兵 = false(那边记搁置)
 */
function revolt(cx: ReformCtx, issue: Issue | null, push: number, R: (use: number) => number, mode?: 'zealot' | 'secular'): boolean {
  const { REVOLT_U, SETTLE, REV_0, REV_U, REV_PUSH, REV_ARMY, JITTER, REBEL_MIN, REV_SHARE } = cx.pm.knobs.get(REFORM_KNOBS);
  const { sim, pm, pol, wm, cm, P, t, capR } = cx;
  const api = civApi(sim);
  const p = P.id;
  if (cx.u < REVOLT_U || wm.iv?.unites(p, t)) return false;
  // 起事的州:城民最多的那州(不是国都、SETTLE 年没换过国家、地方起得了兵)
  let rise = -1;
  let best = 0;
  for (const q of pm.lands[p]) {
    const c = pm.cityOf[q];
    if (q === capR || c < 0 || t - wm.since[q] < SETTLE || wm.iv?.locked(q, t) || !cm.canRaise(p, q, t)) continue;
    const h = populationAt(pm.settlements[c], t);
    if (h > best) {
      best = h;
      rise = q;
    }
  }
  if (rise < 0) return false;
  const army = Math.max(0, cx.rules.army);
  const y = REV_0 + REV_U * (cx.u - REVOLT_U) + REV_PUSH * push - REV_ARMY * army + JITTER * (R(U_REV) - 0.5);
  const opt = openness(cx.pm.knobs.get(REFORM_KNOBS), push, cx.rules.franchise, 1);
  if (y > 0) {
    if (issue !== null) cx.record(issue, Outcome.Break, rise);
    if (mode === 'zealot') {
      // 教众起事打进国都:立神权(起兵的人做首任大祭司)
      note(cx, { b: -1, region: rise, settlement: pm.cityOf[rise], n: REFORM_THEOCRACY, cause: 'zealot' });
      openSeg(cx, { regime: 'theocracy', usurper: leader(cx, R, CLERIC_SHIFT) });
      dissent(cx, 'cleric', R);
      return true;
    }
    note(cx, { b: -1, region: rise, settlement: pm.cityOf[rise], n: REFORM_REVOLUTION, opt, ...(mode ? { cause: mode } : {}) });
    openSeg(cx, { regime: 'republic', usurper: leader(cx, R, REBEL_SHIFT) });
    if (mode === 'secular') dissent(cx, 'secular', R);
    return true;
  }
  // 打不进国都:起事的州连同近处几州(同国、SETTLE 年没换过国家、不是国都)据地自立
  if (!api.politics.secede || !api.politics.cutOff || !api.politics.biggestCity) return false;
  const reg = pm.terrain.regions;
  const owner = sim.owners[Layer.Polity];
  const cap = Math.max(REBEL_MIN, Math.floor(REV_SHARE * pm.size[p]));
  const group = [rise];
  const seen = new Set(group);
  for (let h = 0; h < group.length && group.length < cap; h++) {
    const q = group[h];
    for (let e = reg.adjStart[q]; e < reg.adjStart[q + 1] && group.length < cap; e++) {
      const j = reg.adj[e];
      if (seen.has(j)) continue;
      seen.add(j);
      if (owner[j] !== p || j === capR || t - wm.since[j] < SETTLE || wm.iv?.locked(j, t)) continue;
      group.push(j);
    }
  }
  group.sort((a, b) => a - b);
  const sid = api.politics.biggestCity(group, t);
  const full = sid >= 0 ? api.politics.cutOff(p, group, t, group.length * 2 + 4) : null;
  if (!full || full.length < REBEL_MIN || full.includes(capR)) return false;
  if (issue !== null) cx.record(issue, Outcome.Break, rise);
  if (mode === 'zealot') {
    // 教众打不进国都:据地立神权国
    api.politics.secede(p, full, sid, rise, t, 'split', 'zealot', { dynasties: [{ year: t, name: '', seat: sid, regime: 'theocracy' }] });
    return true;
  }
  const q = api.politics.secede(p, full, sid, rise, t, 'split', 'revolution', { lineage: P.lineage, dynasties: [{ year: t, name: '', seat: sid, regime: 'republic' }] });
  // 新国家立国就设议会、有产者能议政(和接着推时由那条 split 重建的一样,councilRules.ts 的 replayRule)
  const nr = cx.rulesOf(q.id);
  nr.charter = REVOLT_CHARTER;
  nr.franchise = Math.max(nr.franchise, REVOLT_FRANCHISE);
  nr.reformed = t;
  return true;
}

/**
 * 起事自立的那片州(group)要不要立神权国(见 REFORM_KNOBS 的 REBEL_THEO):u01 = 这一回的随机数(0–1),u = 母国此刻的动荡。
 * 主流信仰是大教 / 教派、和母国国教不同才有机会
 */
export function rebelTheocracy(pm: PolityModel, parent: number, group: readonly number[], collapse: boolean, u: number, u01: number): boolean {
  const K = pm.knobs.get(REFORM_KNOBS);
  if (!pm.faithAt || !pm.stateFaith || !pm.faithGap || !pm.faithEngage || !(K.REBEL_THEO > 0)) return false;
  const count = new Map<number, number>();
  let top = -1;
  let best = 0;
  for (const r of group) {
    const f = pm.faithAt(r);
    if (f < 0) continue;
    const n = (count.get(f) ?? 0) + 1;
    count.set(f, n);
    if (n > best || (n === best && f < top)) {
      best = n;
      top = f;
    }
  }
  const e = top >= 0 ? pm.faithEngage(top) : 0;
  if (!(e > 0)) return false;
  const gap = pm.faithGap(top, pm.stateFaith(parent));
  const diff = gap < 0 ? 1 : gap;
  if (!(diff > 0)) return false;
  const p = Math.min(K.REBEL_THEO_MAX, K.REBEL_THEO * diff * (1 + Math.max(0, u)) * (collapse ? K.REBEL_THEO_COLLAPSE : 1) * engageMul(K, e));
  return u01 < p;
}

/** 教众革命的机会(见 REFORM_KNOBS 的 ZEALOT_*):国教不够入世 = 0 */
function zealotOdds(cx: ReformCtx): number {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const e = stateEngage(cx);
  if (e < K.ZEALOT_E) return 0;
  return Math.min(K.ZEALOT_MAX, K.ZEALOT_K * e * 2 * Math.max(0, stateFaithShare(cx) - K.ZEALOT_SHARE0));
}

/** 教团专权要的(council.ts 给):和看内政的一样,k = 第几次看王朝 */
export type ClericCtx = Pick<ReformCtx, 'sim' | 'pm' | 'pol' | 'wm' | 'cm' | 'P' | 't' | 'rules' | 'base' | 'capR' | 'u' | 'broke'> & { k: number };

/**
 * 看王朝没换代、这些年有危机(regency.ts 的 strong):国教盛的王国有机会出一位国师 / 大祭司专权(见 REFORM_KNOBS 的 CLERIC_*)。
 * 返回出没出(出了就不再出大臣、大将专权);他到期夺位的,此刻记一条 reform(n = 立神权,cause = cleric)、在位表加一段神权
 */
export function clericSeize(cx: ClericCtx): boolean {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { pm, P, t } = cx;
  const rcx = { ...cx, ready: () => false, record: () => {}, rulesOf: () => cx.rules } as ReformCtx;
  const share = stateFaithShare(rcx);
  if (share < K.THEO_FAITH) return false;
  const e = stateEngage(cx);
  if (!(e > 0)) return false;
  const R = (use: number) => keyed4(cx.base, pm.ptag[P.id], cx.k, use, R_DYNASTY);
  const p = Math.min(K.CLERIC_MAX, K.CLERIC_P * engageMul(K, e) * secularMul(rcx));
  if (R(U_CLERIC) >= p) return false;
  // 到期伏诛 / 卒于位;作者"保住王室"的这一回也夺不了位
  if (R(U_CLERIC_END) >= K.CLERIC_USURP || (pm.iv && pm.iv.keeps(P.id, t) >= 0)) return true;
  note(rcx, { b: -1, region: cx.capR, settlement: capitalAt(P, t), n: REFORM_THEOCRACY, cause: 'cleric' });
  openSeg(rcx, { regime: 'theocracy', usurper: leader(rcx, R, CLERIC_SHIFT) });
  dissent(rcx, 'cleric', R);
  return true;
}

/** 大祭司交接之际(见 REFORM_KNOBS 的 PONTIFF*):此刻在任的大祭司是这一段第二位以后、接任不到 PONTIFF_WINDOW 年;每一位只掷一次 */
function pontiffSeize(cx: ReformCtx): boolean {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { pm, P, t } = cx;
  const now = rulerOf(pm, P.id, t);
  if (now.j === 0 || now.crown || !(t - now.from < K.PONTIFF_WINDOW)) return false;
  const R = (use: number) => keyed4(cx.base, pm.ptag[P.id], now.k, use, R_PONTIFF);
  // 同一位大祭司在任时看过几回内政也只掷一次:他接任以后头一回看内政(上一回看内政在他接任以前)才掷
  if (politicsCheckTime(cx.pol, P.id, cx.k - 1) >= now.from) return false;
  const odds = K.PONTIFF * (1 + Math.max(0, cx.u)) * leaveMul(K, stateEngage(cx));
  if (R(U_PONTIFF) >= odds / (1 + odds)) return false;
  const seg = (P.dynasties?.length ?? 1) - 1;
  const crown = lastCrown(P, seg);
  const abolished = crown >= 0 ? P.dynasties![crown + 1].year : -Infinity;
  const at = { region: cx.capR, settlement: capitalAt(P, t) };
  if (crown >= 0 && P.lineage !== 'republic' && t - abolished < K.HOUSE_YEARS) {
    const house = P.dynasties![crown].house ?? crown;
    note(cx, { b: house, ...at, n: REFORM_RESTORE, cause: 'pontiff' });
    openSeg(cx, { house });
  } else if (cx.rules.army > 0) {
    note(cx, { b: -1, ...at, n: REFORM_COUP, cause: 'pontiff' });
    openSeg(cx, { regime: 'junta', usurper: leader(cx, R, GENERAL_SHIFT) });
  } else {
    note(cx, { b: -1, ...at, n: REFORM_LAICIZE, cause: 'pontiff' });
    openSeg(cx, { regime: 'republic' });
  }
  dissent(cx, 'secular', R);
  return true;
}

/**
 * 政体一变,不服的那一头据地自立(见 REFORM_KNOBS 的 DISSENT*;记 split,cause = dissent):
 * up = cleric 教团上台(信别的教、离国都远的那头立世俗国)/ secular 世俗派上台(国教最盛的那头立残余的神权国,圣城所在的州优先)
 */
function dissent(cx: AuthorTheocracyCtx & Partial<Pick<ReformCtx, 'wm' | 'u'>>, up: 'cleric' | 'secular', R: (use: number) => number): void {
  const K = cx.pm.knobs.get(REFORM_KNOBS);
  const { sim, pm, P, t, capR } = cx;
  const api = civApi(sim);
  const wm = cx.wm;
  const p = P.id;
  if (!wm || !pm.faithAt || !pm.faithGap || !api.politics.secede || !api.politics.cutOff || !api.politics.biggestCity || wm.iv?.unites(p, t)) return;
  const n = pm.size[p];
  if (n < 2 * K.DISSENT_MIN) return;
  // 国教:上台以前的(教团上台以前国教就是它;世俗派上台时国教还是那一教)
  const fid = pm.stateFaith?.(p) ?? -1;
  if (fid < 0) return;
  const e = pm.faithEngage?.(fid) ?? 0;
  const u = cx.u ?? api.politics.unrest?.(P, t) ?? 0;
  const dist = pm.capDist[p];
  const reg = pm.terrain.regions;
  const owner = sim.owners[Layer.Polity];
  const { SETTLE } = K;
  const fits = (r: number): boolean => {
    const f = pm.faithAt!(r);
    if (up === 'cleric') return f >= 0 && pm.faithGap!(f, fid) !== 0;
    return f === fid;
  };
  // 起事的州:教团上台 = 信别的教、离国都最远的;世俗派上台 = 圣城(本国还占着),不然信国教、离国都最远的
  let rise = -1;
  let best = -Infinity;
  let gapSum = 0;
  let hits = 0;
  const holy = up === 'secular' ? holyRegion(cx, fid) : -1;
  for (const q of pm.lands[p]) {
    if (q === capR || pm.cityOf[q] < 0 || t - wm.since[q] < SETTLE || wm.iv?.locked(q, t) || !fits(q)) continue;
    hits++;
    if (up === 'cleric') gapSum += Math.max(0, pm.faithGap!(pm.faithAt!(q), fid));
    const v = q === holy ? Infinity : (dist[q] < Infinity ? Math.min(4, dist[q] / 12) : 4) + keyed4(cx.base, pm.ptag[p], reg.seat[q], Math.floor(t), U_DISSENT_R);
    if (v > best) {
      best = v;
      rise = q;
    }
  }
  if (rise < 0 || hits < K.DISSENT_MIN) return;
  const diff = up === 'cleric' ? gapSum / hits : e;
  const odds = K.DISSENT * Math.exp(K.DISSENT_K * (u - K.DISSENT_U0)) * (1 + diff);
  if (R(U_DISSENT) >= odds / (1 + odds)) return;
  const cap = Math.min(K.DISSENT_MAX, Math.max(K.DISSENT_MIN, Math.floor(K.DISSENT_FRAC * n)));
  const group = [rise];
  const seen = new Set(group);
  for (let h = 0; h < group.length && group.length < cap; h++) {
    const q = group[h];
    for (let k = reg.adjStart[q]; k < reg.adjStart[q + 1] && group.length < cap; k++) {
      const j = reg.adj[k];
      if (seen.has(j)) continue;
      seen.add(j);
      if (owner[j] !== p || j === capR || t - wm.since[j] < SETTLE || wm.iv?.locked(j, t) || !fits(j)) continue;
      group.push(j);
    }
  }
  if (group.length < K.DISSENT_MIN) return;
  group.sort((a, b) => a - b);
  const sid = api.politics.biggestCity(group, t);
  const full = sid >= 0 ? api.politics.cutOff(p, group, t, group.length * 2 + 4) : null;
  if (!full || full.length < K.DISSENT_MIN || full.includes(capR)) return;
  api.politics.secede(p, full, sid, rise, t, 'split', 'dissent', up === 'secular' ? { dynasties: [{ year: t, name: '', seat: sid, regime: 'theocracy' }] } : {});
}

/** 国教(或它所属大教)的圣城所在的州,本国此刻占着、不是国都;没有 = −1 */
function holyRegion(cx: AuthorTheocracyCtx, fid: number): number {
  const fs = faithSimOf(cx.sim);
  if (!fs) return -1;
  const g = fs.list[fs.rootOf(fid)];
  const sid = g?.holy;
  if (sid === undefined) return -1;
  const r = cx.pm.settlements[sid]?.region ?? -1;
  return r >= 0 && cx.sim.owners[Layer.Polity][r] === cx.P.id && r !== cx.capR ? r : -1;
}


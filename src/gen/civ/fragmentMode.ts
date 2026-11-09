/**
 * 大分裂模式评估:根据中央强弱与割据集中度,决定崩解时切成「割据分治 / 中间态 / 碎裂」。
 * 纯计算,不碰推演引擎;unrest.ts 的 collapse / fragmentOnDestroy 调用。
 *
 * Phase 1:用现成的管辖 c、remote、割据座与地盘、异族占比、王朝年龄、国土规模。
 * powers 以割据座(及必要时远方大城)为种子切大块 —— 不要求割据已占大片国土。
 */
export type FragmentMode = 'powers' | 'mixed' | 'shatter';
/** 作者 / AI 指定:auto = 走评估 */
export const FRAGMENT_MODE_CHOICES = ['auto', 'powers', 'mixed', 'shatter'] as const;
export type FragmentModeChoice = (typeof FRAGMENT_MODE_CHOICES)[number];

/** 写入史事 collapse / intervene 的 Annal.opt */
export const FRAGMENT_MODE_OPT: Record<FragmentMode, number> = { powers: 0, mixed: 1, shatter: 2 };

export function fragmentModeFromOpt(opt: number | undefined): FragmentMode | undefined {
  // 低 2 位 = 模式;bit 4 = 作者「禁止母国收复」
  if (opt === undefined) return undefined;
  const m = opt & 3;
  if (m === 0) return 'powers';
  if (m === 1) return 'mixed';
  if (m === 2) return 'shatter';
  return undefined;
}

export function fragmentModeLabel(mode: FragmentMode): string {
  return mode === 'powers' ? '割据分治' : mode === 'shatter' ? '碎裂' : '分崩';
}

/** 灭国 / 大崩解页「怎么崩」选项(名 + 一句说明;与 fragmentModeLabel 用词一致) */
export const FRAGMENT_MODE_UI: readonly { key: FragmentModeChoice; name: string; desc: string }[] = [
  { key: 'auto', name: '自动', desc: '按中央强弱与割据多少判定' },
  { key: 'powers', name: '割据分治', desc: '切成少数几大块，如北魏→东西魏' },
  { key: 'mixed', name: '分崩', desc: '三到六块，大小不均' },
  { key: 'shatter', name: '碎裂', desc: '裂成许多小国，如西晋之后' },
];

/** 各模式切分默认(shatter 与 UNREST_KNOBS.FRAGMENT_* 对齐:0.25 / 2) */
export const FRAGMENT_MODE_PARAMS: Record<
  FragmentMode,
  {
    mergeDist: number;
    minSizeBase: number;
    /** minSize = max(minSizeBase, floor(N * minSizeFrac)) */
    minSizeFrac: number;
    keep: readonly [number, number];
    pieces: readonly [number, number];
  }
> = {
  powers: { mergeDist: 0.5, minSizeBase: 8, minSizeFrac: 1 / 12, keep: [0.35, 0.5], pieces: [2, 4] },
  mixed: { mergeDist: 0.35, minSizeBase: 3, minSizeFrac: 1 / 30, keep: [0.25, 0.4], pieces: [3, 6] },
  shatter: { mergeDist: 0.25, minSizeBase: 2, minSizeFrac: 1 / 40, keep: [0.2, 0.35], pieces: [5, 12] },
};

export interface FragmentAssessInput {
  /** 国土州数 */
  N: number;
  /** 各州管辖均值 0–1(割据地盘可按 0 计) */
  meanC: number;
  /** 异族州占比 */
  foreignShare: number;
  /** 当朝年数(可负,按 0 处理) */
  age: number;
  /** 各处割据地盘州数,从大到小 */
  lordDomains: readonly number[];
  /** 对应割据座州号(与 lordDomains 对齐) */
  lordSeats: readonly number[];
  /** 可选:动荡 / 危机,作弱修正 */
  unrest?: number;
  strain?: number;
}

export interface FragmentAssessment {
  centerStrength: number;
  magnateConcentration: number;
  mode: FragmentMode;
  targetPieces: number;
  keep: readonly [number, number];
  mergeDist: number;
  minSize: number;
  activeLords: number;
  meanC: number;
  foreignShare: number;
  N: number;
  lordSeats: number[];
  lordDomains: number[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** 评估中央强弱、割据集中度 → 模式与目标块数(软目标) */
export function assessFragment(input: FragmentAssessInput): FragmentAssessment {
  const N = Math.max(0, input.N | 0);
  const meanC = clamp01(input.meanC);
  const foreignShare = clamp01(input.foreignShare);
  const age = Math.max(0, input.age);
  const domains = [...input.lordDomains].sort((a, b) => b - a);
  const seats = input.lordSeats.slice(0, domains.length);
  const activeLords = domains.length;
  const lordCells = domains.reduce((a, b) => a + b, 0);
  const lordShare = N ? Math.min(1, lordCells / N) : 0;
  const top2 = (domains[0] ?? 0) + (domains[1] ?? 0);
  const top2Share = N ? Math.min(1, top2 / N) : 0;
  const herfindahl = (() => {
    if (!domains.length) return 0;
    const s = lordCells || 1;
    return domains.reduce((a, b) => a + (b / s) ** 2, 0);
  })();

  const ageFactor = Math.min(1, Math.max(0, (age - 150) / 400));
  const sizeFactor = Math.min(1, Math.max(0, Math.log(Math.max(N, 1) / 30) / Math.log(6)));
  const unrestBump = Math.min(0.15, Math.max(0, ((input.unrest ?? 0) - 1.5) * 0.05));
  const strainBump = Math.min(0.1, Math.max(0, (input.strain ?? 0) * 0.05));

  // 中央:管辖高、割据少、未过度膨胀 / 老迈、异族少
  const centerStrength = clamp01(
    0.55 * meanC + 0.25 * (1 - lordShare) + 0.1 * (1 - sizeFactor) + 0.1 * (1 - ageFactor) - 0.15 * foreignShare - unrestBump - strainBump,
  );

  // 集中度:少数割据(座即可,不要求地盘大);无割据时偏低
  const magnateConcentration = activeLords
    ? clamp01(0.35 * Math.min(1, activeLords / 2) * (activeLords <= 3 ? 1 : 0.35) + 0.35 * herfindahl + 0.15 * top2Share + 0.15 * (activeLords <= 3 ? 1 : 0))
    : clamp01(0.15 * (1 - meanC) * sizeFactor);

  // 阈值按实验 D 调过:自然崩解约 powers ~15% / shatter ~40% / mixed 其余。
  // powers:有 1–3 处割据座可当种子,中央尚有一定掌控(不要求割据已控大片);门槛自 0.55 降至 0.42。
  let mode: FragmentMode;
  if (activeLords >= 1 && activeLords <= 3 && centerStrength >= 0.42) {
    mode = 'powers';
  } else if (
    activeLords >= 4 ||
    (N >= 80 && centerStrength < 0.48 && (meanC < 0.45 || foreignShare > 0.35)) ||
    (activeLords === 0 && N >= 90 && centerStrength < 0.5 && meanC < 0.55)
  ) {
    mode = 'shatter';
  } else {
    mode = 'mixed';
  }

  const params = FRAGMENT_MODE_PARAMS[mode];
  let targetPieces: number;
  if (mode === 'powers') {
    // 2–4;国土大(≥80)时至少 3
    const floor = N >= 80 ? 3 : activeLords >= 2 ? 3 : 2;
    targetPieces = Math.min(params.pieces[1], Math.max(params.pieces[0], floor));
  } else if (mode === 'shatter') {
    targetPieces = Math.min(params.pieces[1], Math.max(params.pieces[0], Math.round(N / 8)));
  } else {
    // mixed 3–6
    targetPieces = Math.min(params.pieces[1], Math.max(params.pieces[0], Math.round(N / 25)));
  }
  const minSize = Math.max(params.minSizeBase, Math.floor(N * params.minSizeFrac));

  return {
    centerStrength,
    magnateConcentration,
    mode,
    targetPieces,
    keep: params.keep,
    mergeDist: params.mergeDist,
    minSize,
    activeLords,
    meanC,
    foreignShare,
    N,
    lordSeats: seats.slice(),
    lordDomains: domains,
  };
}

/** 解析作者指定;auto / 缺省 → 用评估结果 */
export function resolveFragmentMode(
  choice: FragmentModeChoice | undefined,
  assessed: FragmentAssessment,
  pieces?: number,
): { mode: FragmentMode; targetPieces: number; mergeDist: number; minSize: number; keep: readonly [number, number] } {
  const mode: FragmentMode = !choice || choice === 'auto' ? assessed.mode : choice;
  const params = FRAGMENT_MODE_PARAMS[mode];
  const soft = pieces !== undefined && pieces >= 2 ? Math.min(12, Math.max(2, Math.round(pieces))) : assessed.mode === mode ? assessed.targetPieces : Math.round((params.pieces[0] + params.pieces[1]) / 2);
  // 若作者指定了模式但没给 pieces,用该模式表的中位;指定了 pieces 则作软目标
  const targetPieces =
    pieces !== undefined && pieces >= 2
      ? soft
      : mode === assessed.mode
        ? assessed.targetPieces
        : Math.min(params.pieces[1], Math.max(params.pieces[0], soft));
  return {
    mode,
    targetPieces,
    mergeDist: params.mergeDist,
    minSize: Math.max(params.minSizeBase, Math.floor(assessed.N * params.minSizeFrac)),
    keep: params.keep,
  };
}

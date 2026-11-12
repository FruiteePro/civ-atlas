/**
 * AI 导演在界面上的那一份(核心见 ai/director.ts):设置存在本机(每个世界通用),这一次推演里上次看过是哪一年、
 * 是不是正在问 AI。逐年推演每走完一步(Stepwise.tsx)调 aiDirAfterStep:该看一眼就问,问着的时候不请算下一步
 * (aiDirBusy,播放头慢慢停在"现在");收下了命令 = 交给 App 照新的进度从第 0 年重推(stepwiseActions().aiReplay)。
 * 关着、没写目标、没设 AI、超时、回的不合格:什么也不做,照常往下推。
 */
import { useSyncExternalStore } from 'react';
import type { World } from '../gen/world';
import type { Civ } from '../gen/civ/types';
import { cleanPlay, type Intervention } from '../gen/edits';
import { spaced, yearAt } from '../gen/era';
import { AI_DIR_DEFAULTS, aiDirDue, aiDirPropose, cleanAiDir, type AiDirSettings } from '../ai/director';
import { getEdits } from './editsStore';
import { getStepwise, stepwiseActions } from './stepwiseStore';
import { showToast } from './Toast';

const KEY = 'wf.aiDirector';

function load(): AiDirSettings {
  try {
    return typeof localStorage !== 'undefined' ? cleanAiDir(JSON.parse(localStorage.getItem(KEY) ?? 'null')) : { ...AI_DIR_DEFAULTS };
  } catch {
    return { ...AI_DIR_DEFAULTS };
  }
}

interface AiDirState {
  settings: AiDirSettings;
  /** 正在问 AI */
  busy: boolean;
  /** 上次看过到哪一年(这一次逐年推演里;null = 还没看过,从起演那年算) */
  last: number | null;
  /** 最近一次的结果(界面上写一句) */
  said: string | null;
}

let S: AiDirState = { settings: load(), busy: false, last: null, said: null };
const subs = new Set<() => void>();
const patch = (p: Partial<AiDirState>) => {
  S = { ...S, ...p };
  for (const f of subs) f();
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function getAiDir(): AiDirState {
  return S;
}
export function useAiDir(): AiDirState {
  return useSyncExternalStore(subscribe, getAiDir, getAiDir);
}
/** 正在问 AI(这时不请算下一步) */
export function aiDirBusy(): boolean {
  return S.busy;
}

/** 改设置(清理过再存) */
export function setAiDir(p: Partial<AiDirSettings>) {
  const settings = cleanAiDir({ ...S.settings, ...p });
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 存不下:这一次照样用
  }
  patch({ settings });
}

/** 换了世界、另开了一次逐年推演:上次看过的年份作废 */
export function resetAiDir() {
  patch({ last: null, said: null });
}

/** 提示条上那一句:下了几条、从哪年起重推 */
function saidText(cmds: readonly Intervention[], from: number): string {
  const e = getEdits();
  return `AI 导演下了 ${cmds.length} 条命令，从${spaced(yearAt(Math.floor(from), e.era))}起重推`;
}

let seq = 0;

/**
 * 走完一步(推到 now 年;since = 这一步从哪年起,big = 这一步里有几件头等大事):该看一眼就问 AI。
 * 问回来时进度、世界变了(下了令、倒回去、切了支线、换了世界)= 这次的不要
 */
export function aiDirAfterStep(world: World, civ: Civ, now: number, big: number): void {
  const s = S.settings;
  const st = getStepwise();
  if (!st.on || S.busy) return;
  const start = st.start;
  let last = S.last;
  if (last === null || last > now || last < start) last = start;
  if (last !== S.last) patch({ last });
  if (!aiDirDue(s, last, now, big)) return;
  const edits = getEdits();
  const play0 = cleanPlay(edits.play);
  if (!play0) return;
  const id = ++seq;
  const since = last;
  patch({ busy: true });
  void aiDirPropose({ world, civ, edits, since, now, settings: s }).then((r) => {
    if (id !== seq) return;
    const same = JSON.stringify(cleanPlay(getEdits().play) ?? null) === JSON.stringify(play0) && getStepwise().on && getStepwise().now === now;
    patch({ busy: false, last: now });
    if (!r || !same) return patch({ said: r ? null : 'AI 导演看了一眼，这次没有下令' });
    const text = saidText(r.commands, r.from);
    if (!stepwiseActions()?.aiReplay(r.play, `${text}：从头推到${spaced(yearAt(now, getEdits().era))}`)) return;
    patch({ said: text });
    showToast({ id: 'ai-director', kind: 'ok', dot: true, text, more: r.commands.map((v) => v.note ?? '').filter(Boolean), ttl: 7000 });
  });
}

/** 测试用:恢复默认、清掉状态 */
export function _resetAiDir() {
  seq++;
  S = { settings: { ...AI_DIR_DEFAULTS }, busy: false, last: null, said: null };
}

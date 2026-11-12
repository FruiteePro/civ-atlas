/**
 * AI 导演(逐年推演里的一个开关;不是镜头那个"导播",那个见 ui/directorPlan.ts)。
 *
 * 开着时每隔 N 年(或这一步出了头等大事)看一眼这一段的简况,在这一段里(上次看过以后到"现在")
 * 提 0–3 条带年份的命令,格式同作者下的干预(Intervention,带 ai = true 和一句缘由 note)。
 * 收下的命令按时刻并进 WorldEdits.play.commands,从其中最早的那一刻起重推(和带着这串命令从第 0 年
 * 一口气推到现在一样);之后读档、切支线、重推都只看 play.commands,不再问 AI。
 *
 * 两种:导演 = 只管戏剧性和节奏,不偏袒任何一国(风格:稳健 / 乱世 / 反转);目标 = 作者写一句目标,
 * 往那边推。关着、目标模式没写目标:什么也不做。没设 AI、超时、回的东西不合格:这一次什么也不做,照常往下推。
 *
 * 上限:每次最多 perStep 条、最近一百年里最多 perCentury 条(算上以前 AI 下的),种类只在白名单里。
 * 这个文件不碰界面和推演线程:界面见 ui/aiDirectorStore.ts。
 */
import type { World } from '../gen/world';
import type { Civ } from '../gen/civ/types';
import { regimeAt } from '../gen/civ/regime';
import { fullChronicle } from '../gen/civ/story/religionText';
import { MAJOR } from '../gen/civ/story/chronicle';
import { capitalAt, ownersAt } from '../gen/readers/openQuery';
import {
  YEAR_TICKS,
  cleanBranches,
  cleanPlay,
  commandAt,
  commandYear,
  playAt,
  playFromOf,
  playState,
  ticksAt,
  type Intervention,
  type InterventionKind,
  type PlayState,
  type WorldEdits,
} from '../gen/edits';
import { aiChat } from './client';
import type { AiRequest } from './types';
import { REWRITE_OPS, bordersAt, nameAt, parseRewrite } from './prompts/rewrite';

export const AI_DIR_FEATURE = 'AI 导演';

export type AiDirMode = 'director' | 'goal';
export type AiDirStyle = 'steady' | 'chaos' | 'twist';
export const AI_DIR_STYLES: readonly AiDirStyle[] = ['steady', 'chaos', 'twist'];
export const AI_DIR_STYLE_LABEL: Readonly<Record<AiDirStyle, string>> = { steady: '稳健', chaos: '乱世', twist: '反转' };
const STYLE_HINT: Readonly<Record<AiDirStyle, string>> = {
  steady: '稳健:少动手,只在格局长期僵住、或一国独大到没有悬念时轻轻推一把;优先保护、结盟、禁止扩张这类温和的命令',
  chaos: '乱世:喜欢群雄并起、战火不断;多用宣战、大崩解、禁止统一以外的手段让局面碎裂,但别把整个世界一下子打空',
  twist: '反转:喜欢出人意料的转折:强国突然衰落、弱国绝地翻盘、宿敌结盟;每次只做一两处关键的反转',
};
/** 下手的轻重:1 保守 2 适中 3 激进(提示词里怎么说、温度多少) */
export const AI_DIR_AGGR_LABEL: Readonly<Record<1 | 2 | 3, string>> = { 1: '保守', 2: '适中', 3: '激进' };
const AGGR_HINT: Readonly<Record<1 | 2 | 3, string>> = {
  1: '多数时候什么也不做(edits 留空)最好;只有确实需要时才下一条',
  2: '局面平淡、或该有转折时下一两条;局面本来就热闹就不动',
  3: '可以积极下令,但仍然要讲得出道理',
};

/** AI 导演能下的几种命令(parseRewrite 认得的历史命令;改名、改地形不算) */
export const AI_DIR_KINDS: readonly InterventionKind[] = ['protect', 'unity', 'halt', 'ally', 'declare', 'move', 'cede', 'found', 'destroy', 'collapse', 'theocracy'];
/** 默认的白名单:不灭国、不立国、不划地(动静太大的要作者自己勾) */
export const AI_DIR_KINDS_DEFAULT: readonly InterventionKind[] = ['protect', 'unity', 'halt', 'ally', 'declare', 'collapse'];

/** 每次最多几条(硬上限) */
export const AI_DIR_STEP_MAX = 3;
export const AI_DIR_EVERY_MIN = 10;
export const AI_DIR_EVERY_MAX = 2000;
export const AI_DIR_CENTURY_MAX = 20;
export const AI_DIR_GOAL_MAX = 120;
export const AI_DIR_TIMEOUT_MIN = 5000;
export const AI_DIR_TIMEOUT_MAX = 120000;

export interface AiDirSettings {
  on: boolean;
  mode: AiDirMode;
  /** 目标模式的那一句目标 */
  goal: string;
  /** 每隔几年看一眼 */
  every: number;
  /** 出了头等大事也看一眼 */
  onBig: boolean;
  style: AiDirStyle;
  aggr: 1 | 2 | 3;
  /** 每次最多几条(0–3) */
  perStep: number;
  /** 最近一百年里最多几条 */
  perCentury: number;
  /** 能下的几种 */
  kinds: InterventionKind[];
  /** 等 AI 多久(毫秒),超时这一次什么也不做 */
  timeoutMs: number;
}

export const AI_DIR_DEFAULTS: Readonly<AiDirSettings> = {
  on: false,
  mode: 'director',
  goal: '',
  every: 100,
  onBig: true,
  style: 'steady',
  aggr: 2,
  perStep: 2,
  perCentury: 3,
  kinds: [...AI_DIR_KINDS_DEFAULT],
  timeoutMs: 30000,
};

const clampInt = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** 目标清理:一行,去首尾空白,最多 AI_DIR_GOAL_MAX 个字 */
export function cleanGoal(x: unknown): string {
  if (typeof x !== 'string') return '';
  return [...x.replace(/\s+/g, ' ').trim()].slice(0, AI_DIR_GOAL_MAX).join('').trim();
}

/** 设置清理(存在本机的、界面上改的都过一遍);不合格的项换默认 */
export function cleanAiDir(raw: unknown): AiDirSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = AI_DIR_DEFAULTS;
  const kinds = Array.isArray(o.kinds) ? AI_DIR_KINDS.filter((k) => (o.kinds as unknown[]).includes(k)) : [...d.kinds];
  const aggr = o.aggr === 1 || o.aggr === 2 || o.aggr === 3 ? o.aggr : d.aggr;
  return {
    on: o.on === true,
    mode: o.mode === 'goal' ? 'goal' : 'director',
    goal: cleanGoal(o.goal),
    every: clampInt(o.every, AI_DIR_EVERY_MIN, AI_DIR_EVERY_MAX, d.every),
    onBig: typeof o.onBig === 'boolean' ? o.onBig : d.onBig,
    style: AI_DIR_STYLES.includes(o.style as AiDirStyle) ? (o.style as AiDirStyle) : d.style,
    aggr,
    perStep: clampInt(o.perStep, 0, AI_DIR_STEP_MAX, d.perStep),
    perCentury: clampInt(o.perCentury, 0, AI_DIR_CENTURY_MAX, d.perCentury),
    kinds,
    timeoutMs: clampInt(o.timeoutMs, AI_DIR_TIMEOUT_MIN, AI_DIR_TIMEOUT_MAX, d.timeoutMs),
  };
}

/** 开着、有事可做:开关开着,能下至少一条、至少一种;目标模式还得写了目标 */
export function aiDirActive(s: AiDirSettings): boolean {
  return s.on && s.perStep > 0 && s.perCentury > 0 && s.kinds.length > 0 && (s.mode === 'director' || !!cleanGoal(s.goal));
}

/** 该不该看一眼:上次看过(last 年;没看过 = 起演那年)以后过了 every 年,或者(勾了)这一步有头等大事 */
export function aiDirDue(s: AiDirSettings, last: number, now: number, big: number): boolean {
  if (!aiDirActive(s) || now <= last) return false;
  return now - last >= s.every - 1e-9 || (s.onBig && big > 0);
}

/** 一年调用几次的估计(界面上写"推一千年约调用几次"):每 every 年一次,勾了大事的按每 300 年多一次粗估 */
export function aiDirCallEstimate(s: AiDirSettings, years = 1000): number {
  if (!aiDirActive(s)) return 0;
  return Math.ceil(years / s.every) + (s.onBig ? Math.ceil(years / 300) : 0);
}

/**
 * 能下命令的最早那一刻(格):起演那年、当前这一支分出来的那一刻、别的几支和这一支分开的那一刻里最晚的
 * (更早的命令是几支共用的,AI 不改它)
 */
export function aiDirFloor(edits: WorldEdits): number {
  let f = ticksAt(playFromOf(edits));
  const bs = cleanBranches(edits.branches, edits.play);
  if (bs?.forkAt !== undefined) f = Math.max(f, ticksAt(bs.forkAt, bs.forkTick ?? 0));
  for (const b of bs?.list ?? []) f = Math.max(f, ticksAt(b.from, b.fromTick ?? 0));
  return f;
}

/** 最近一百年(到 now 年为止)里 AI 下过几条 */
export function aiDirRecent(play: PlayState, now: number): number {
  return play.commands.filter((v) => v.ai && commandYear(v) > now - 100 && commandYear(v) <= now).length;
}

/** 这一段的窗口(年,两头都含):since 和能下的最早那一刻里晚的那个 → now */
export function aiDirWindow(edits: WorldEdits, since: number, now: number): { from: number; to: number } {
  return { from: Math.max(since, aiDirFloor(edits) / YEAR_TICKS), to: now };
}

/** 给 AI 看的简况:现在的几大国(编号、国名、州数、政体、邻国)和这一段的大事。很短:几十行 */
export function aiDirSummary(world: World, civ: Civ, since: number, now: number, maxPolities = 12, maxEvents = 14): string {
  void world;
  const Y = Math.floor(Math.min(now, civ.endYear));
  const own = ownersAt(civ, Y);
  const size = new Map<number, number>();
  for (let r = 0; r < civ.regions.count; r++) if (own.polity[r] >= 0) size.set(own.polity[r], (size.get(own.polity[r]) ?? 0) + 1);
  const total = [...size.values()].reduce((a, b) => a + b, 0);
  const top = [...size.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, maxPolities);
  const out: string[] = [`# 第 ${Y} 年的简况(在世 ${size.size} 国,有主 ${total} 州)`, '## 几大国'];
  for (const [id, n] of top) {
    const p = civ.polities[id];
    const near = [...bordersAt(civ, own.polity, id, Y)].sort((a, b) => a - b).slice(0, 6);
    const cap = civ.settlements[capitalAt(p, Y)];
    out.push(
      `P${id} ${nameAt(p, Y)} · ${n} 州 · ${regimeAt(p, Y)} · 立国 ${Math.floor(p.founded)} 年` +
        (cap ? ` · 国都 C${cap.id} ${cap.name}` : '') +
        (near.length ? ` · 邻国 ${near.map((q) => `P${q}`).join('、')}` : ''),
    );
  }
  const ev = fullChronicle(civ)
    .filter((e) => e.year >= since && e.year < now && e.importance >= MAJOR - 1)
    .sort((a, b) => b.importance - a.importance || a.year - b.year || a.id - b.id)
    .slice(0, maxEvents)
    .sort((a, b) => a.year - b.year || a.id - b.id);
  out.push(`## 第 ${Math.floor(since)}—${Y} 年的大事`);
  if (ev.length) for (const e of ev) out.push(`${Math.floor(e.year)} ${e.text}`);
  else out.push('没有大事');
  return out.join('\n');
}

export interface AiDirAsk {
  summary: string;
  settings: AiDirSettings;
  /** 窗口(年,两头都含) */
  from: number;
  to: number;
  /** 这一次最多几条(每次上限和百年上限里小的那个) */
  max: number;
}

/** 这一次的请求(role = intervention:用设置里"干预"那一路的服务商,settingsForCall 照它选) */
export function aiDirRequest(a: AiDirAsk): AiRequest {
  const s = a.settings;
  const lo = Math.ceil(a.from - 1e-9);
  const hi = Math.floor(a.to);
  const goal = cleanGoal(s.goal);
  const system = [
    '你是「文明与地图」逐年推演里的 AI 导演。这是一颗虚构星球的历史,由规则一步步推演;你在旁边看,偶尔下几条命令改变走向。',
    s.mode === 'goal'
      ? `作者的目标:${goal}。你的命令要让历史朝这个目标走,但要循序渐进、合乎情理,不要一步到位。`
      : `你只管戏剧性和节奏,不偏袒任何一国、任何民族。风格:${STYLE_HINT[s.style]}。`,
    `下手的轻重:${AGGR_HINT[s.aggr]}。`,
    '',
    '## 能用的命令(只能用下面这几种 op)',
    REWRITE_OPS.split('\n')
      .filter((l) => s.kinds.some((k) => l.startsWith(`- ${k} `)))
      .join('\n'),
    '',
    '## 规则',
    `1. 最多 ${a.max} 条;可以一条也不下(edits 留空)。`,
    `2. from 必须是整数年份,在 ${lo} 到 ${hi} 之间(含);那一年这国必须在世。`,
    '3. 国家、城只能用简况里的编号(P3、C12),不要编。',
    '4. 每条带 why:一句话(20 字以内)说为什么这样下,会写进编年史。',
    '5. 只回一个 JSON 对象,不要别的文字:{"reply":"一句话","edits":[{"op":"declare","country":"P3","other":"P5","from":1200,"why":"…"}]}',
  ].join('\n');
  return {
    feature: AI_DIR_FEATURE,
    title: `第 ${lo}—${hi} 年`,
    role: 'intervention',
    json: true,
    temperature: s.aggr === 1 ? 0.4 : s.aggr === 2 ? 0.7 : 0.9,
    maxTokens: 800,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: a.summary },
    ],
  };
}

export interface AiDirPick {
  /** 收下的命令(按时刻先后;带 ai 和 note) */
  commands: Intervention[];
  /** 没收的,一条一句原因(调用记录里看) */
  dropped: string[];
}

/**
 * 核对 AI 回的:不合格(看不懂、对不上编号、年份不对)的、不在白名单里的、不在窗口里的不收;超过上限的后面的不收。
 * 回的东西整个看不懂 = 一条也不收
 */
export function aiDirPick(text: string, world: World, civ: Civ, edits: WorldEdits, a: Pick<AiDirAsk, 'settings' | 'from' | 'to' | 'max'>): AiDirPick {
  const r = parseRewrite(text, { world, civ, year: a.to, edits, lock: 'terrain' });
  if (!r.ok) return { commands: [], dropped: [r.message] };
  const fromT = Math.ceil(a.from * YEAR_TICKS - 1e-6);
  const toT = Math.round(a.to * YEAR_TICKS);
  const out: Intervention[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const it of r.items) {
    const c = it.change;
    if (!c || c.kind !== 'intervention') {
      dropped.push(`${it.text}:${it.problem ?? '不是历史命令'}`);
      continue;
    }
    const v = c.v;
    const at = commandAt(v);
    if (!a.settings.kinds.includes(v.kind)) dropped.push(`${it.text}:这一种没勾`);
    else if (at < fromT || at > toT) dropped.push(`${it.text}:不在这一段里`);
    else if (seen.has(JSON.stringify(v))) dropped.push(`${it.text}:重复`);
    else if (out.length >= a.max) dropped.push(`${it.text}:超过上限`);
    else {
      seen.add(JSON.stringify(v));
      const note = (it.why ?? '').trim();
      out.push({ ...v, ai: true, ...(note ? { note: [...note].slice(0, 40).join('') } : {}) } as Intervention);
    }
  }
  out.sort((x, y) => commandAt(x) - commandAt(y));
  return { commands: out, dropped };
}

/**
 * 收下的命令并进进度:最早那一刻以前的照旧,以后的(原来的和新的)按时刻排(同一刻原来的在前);进度不变。
 * 返回新的进度和要从哪一刻(格)起重推;没有命令 / 不在逐年推演 / 比进度还晚 = null
 */
export function aiDirMerge(play: PlayState, commands: readonly Intervention[]): { play: PlayState; from: number } | null {
  if (!commands.length) return null;
  const now = playAt(play);
  if (commands.some((v) => commandAt(v) > now)) return null;
  const E = Math.min(...commands.map(commandAt));
  const keep = play.commands.filter((v) => commandAt(v) < E);
  const later = [...play.commands.filter((v) => commandAt(v) >= E), ...commands].map((v, i) => ({ v, i }));
  later.sort((a, b) => commandAt(a.v) - commandAt(b.v) || a.i - b.i);
  const next = cleanPlay(playState(play.year, play.tick ?? 0, [...keep, ...later.map((x) => x.v)]));
  return next ? { play: next, from: E } : null;
}

export interface AiDirResult {
  play: PlayState;
  /** 从哪一年(带小数)起重推 */
  from: number;
  commands: Intervention[];
  dropped: string[];
}

/** 等 AI 多久:超时 = 取消那次调用,这一次什么也不做 */
export function aiDirTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T | null> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  outer?.addEventListener('abort', stop);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => {
    timer = setTimeout(() => {
      ac.abort();
      res(null);
    }, ms);
  });
  return Promise.race([p(ac.signal), late]).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener('abort', stop);
  });
}

/**
 * 看一眼、提命令:since → now 这一段(年,两头都含)。没开、没事可做、没设 AI、超时、出错、回的不合格、一条也没收:null(照常往下推)。
 * 不抛错。收下了:新的进度(并进了命令),界面拿去从 from 起重推
 */
export async function aiDirPropose(
  input: { world: World; civ: Civ; edits: WorldEdits; since: number; now: number; settings: AiDirSettings },
  opts: { signal?: AbortSignal } = {},
): Promise<AiDirResult | null> {
  const { world, civ, edits, settings } = input;
  const play = cleanPlay(edits.play);
  if (!play || !aiDirActive(settings)) return null;
  const w = aiDirWindow(edits, input.since, input.now);
  if (w.to <= w.from) return null;
  const max = Math.min(settings.perStep, settings.perCentury - aiDirRecent(play, input.now), AI_DIR_STEP_MAX);
  if (max <= 0) return null;
  const ask: AiDirAsk = { summary: aiDirSummary(world, civ, w.from, w.to), settings, from: w.from, to: w.to, max };
  let text: string | null;
  try {
    const r = await aiDirTimeout((signal) => aiChat(aiDirRequest(ask), { signal }), settings.timeoutMs, opts.signal);
    text = r ? r.text : null;
  } catch {
    text = null;
  }
  if (text === null || opts.signal?.aborted) return null;
  const pick = aiDirPick(text, world, civ, edits, ask);
  const m = aiDirMerge(play, pick.commands);
  return m ? { play: m.play, from: m.from / YEAR_TICKS, commands: pick.commands, dropped: pick.dropped } : null;
}

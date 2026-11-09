/**
 * 大崩解干预页:国家干预页点「大崩解」,卡片换成这一页。
 * 核心留下,其余按切分模式裂成继承国(自动 / 割据分治 / 分崩 / 碎裂);国家不亡。
 */
import { useState, type KeyboardEvent } from 'react';
import type { Civ } from '../gen/civ/types';
import { polityAlive } from '../gen/readers/openQuery';
import { type FragmentModeChoice, type Intervention, polityKey } from '../gen/edits';
import { fragmentModeLabel } from '../gen/civ/fragmentMode';
import { spaced, yearAt, yearSpanAt } from '../gen/era';
import { useEra } from './editsStore';
import { useNarrow } from './device';
import { queueIntervention } from './pendingStore';
import { nextYear, useStepwise } from './stepwiseStore';
import { STEP_LOOK_WHY, StepEffectTime, useStepView } from './Stepwise';
import { defaultYear, nameAt } from './Interventions';
import { YearRow, useYearInput } from './panelParts';
import { LifeHead, useNationLife } from './LifeHead';
import { closeCmdPage } from './panelStore';
import './newIv.css';

export function CollapsePage({ civ, id, year, from }: { civ: Civ; id: number; year: number; from?: number }) {
  const era = useEra();
  const phone = useNarrow();
  const sw = useStepwise();
  const step = sw.on;
  const look = useStepView().look;
  const p = civ.polities[id];
  const key = polityKey(civ, id);
  const lo = Math.ceil(p.founded);
  const last = Math.ceil(civ.endYear) - 1;
  const hi = Math.max(lo, Math.min(last, p.ended !== undefined ? Math.ceil(p.ended) - 1 : last));
  const [msg, setMsg] = useState<string | null>(null);
  const clear = () => setMsg(null);
  const yi = useYearInput(from ?? defaultYear(p, year), lo, hi, clear);
  const y = step ? nextYear(sw) : yi.y;
  const name = nameAt(p, y);
  const shown = nameAt(p, year);
  const [fragMode, setFragMode] = useState<FragmentModeChoice>('auto');
  const [pieces, setPieces] = useState('');
  const [noReclaim, setNoReclaim] = useState(false);
  const life = useNationLife(['collapse'], id);

  const why = (() => {
    if (step && look !== null) return STEP_LOOK_WHY;
    if (!step && !yi.valid) return `年份要在${spaced(yearSpanAt(lo, hi, era))}之间`;
    if (!polityAlive(p, y)) return y < p.founded ? `${yearAt(y, era)}还没立国` : `${yearAt(y, era)}已亡`;
    return null;
  })();

  const fragLabel = fragMode === 'auto' ? '自动' : fragmentModeLabel(fragMode);

  const go = () => {
    if (why) return;
    const piecesN = pieces.trim() === '' ? undefined : Math.min(12, Math.max(2, Math.round(Number(pieces))));
    const v: Intervention = {
      kind: 'collapse',
      a: key,
      from: y,
      mode: fragMode,
      ...(piecesN !== undefined && Number.isFinite(piecesN) ? { pieces: piecesN } : {}),
      ...(noReclaim ? { noReclaim: true } : {}),
    };
    const err = queueIntervention(
      v,
      `${shown}:大崩解（${fragLabel}${noReclaim ? '，禁收复' : ''}）`,
      { self: id, target: null, shown },
    );
    if (err) return setMsg(err);
    closeCmdPage();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closeCmdPage();
  };

  const story = `【干预】${name}大崩解（${fragLabel}），核心留下，其余裂成数国`;

  return (
    <div className="cr-page" onKeyDown={onKey}>
      <div className="cp-body cr-form" data-collapse="form">
        {life && <LifeHead t={life} />}
        {step ? (
          <StepEffectTime phone={phone} />
        ) : (
          <div className="cp-from">
            <span className="cp-k">哪一年崩解</span>
            <YearRow yi={yi} label="崩解年份" />
            <span className="cp-note">这年之前的历史不变，之后重新推演。国家本身不亡，国都一带留下。</span>
          </div>
        )}
        <div className="cp-form">
          <span className="cp-form-title">怎么崩</span>
          <div className="cp-dur" role="radiogroup" aria-label="怎么崩">
            {(
              [
                ['auto', '自动'],
                ['powers', '割据分治'],
                ['mixed', '分崩'],
                ['shatter', '碎裂'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={fragMode === k}
                className={fragMode === k ? 'on' : ''}
                data-act={`collapse-frag-${k}`}
                onClick={() => (setFragMode(k), clear())}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="cp-note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>目标块数（可选）</span>
            <input
              className="cp-year"
              data-act="collapse-pieces"
              inputMode="numeric"
              placeholder="自动"
              value={pieces}
              onChange={(e) => (setPieces(e.target.value.replace(/[^\d]/g, '')), clear())}
              style={{ width: 64 }}
            />
          </label>
          <label className="cp-note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              data-act="collapse-no-reclaim"
              checked={noReclaim}
              onChange={(e) => (setNoReclaim(e.target.checked), clear())}
            />
            <span>禁止母国收复（永久不许对继承国开战夺回）</span>
          </label>
          <span className="cp-note">
            {name} 按「{fragLabel}」崩解
            {pieces.trim() ? `（尽量靠近 ${pieces} 块）` : ''}；国都一带留给原来的国家，其余自立
            {noReclaim ? '；禁止母国收复' : ''}。
          </span>
        </div>
        <div className="iv-sum" data-collapse="sum">
          <span>国家</span>
          <span>不亡，留下核心</span>
          {!phone && (
            <>
              <span>编年史</span>
              <span>{story}</span>
            </>
          )}
        </div>
        {(msg || why) && <div className="cp-msg">{msg ?? why}</div>}
      </div>
      <div className="cp-foot mk-foot">
        <button className="cp-btn" data-act="collapse-back" onClick={closeCmdPage}>
          返回
        </button>
        <button className="cp-btn primary" data-act="collapse-go" disabled={!!why} onClick={go}>
          {step ? '加入' : '加入待推演'}
        </button>
      </div>
    </div>
  );
}

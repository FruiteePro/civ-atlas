/**
 * 世界概览的"外交"页:这一年的结盟、战争、宗藩。点国名 = 收起概览、选中该国并飞到地图。
 * 盟约、宗藩对齐 relationsAt 的顺序;战争对齐编年史里 war 开打、peace / fall 结束。
 * 宗藩按宗主分成一张卡片:先写宗主,再列向它称臣的各国。
 */
import { useMemo } from 'react';
import type { Civ } from '../gen/civ/types';
import { polityAlive, polityName } from '../gen/readers/openQuery';
import { relationsAt } from '../gen/civ/diplomacy';
import { setCivTime, setSelection } from './civView';
import { closeOverview } from './overviewStore';
import { PolityFlag } from './Flag';
import { useEra } from './editsStore';
import { yearShortAt } from '../gen/era';
import './overview.css';

interface DiplomacyPageProps {
  civ: Civ;
  year: number;
}

/** 当前年份的所有联盟关系 */
interface Alliance {
  a: number;
  b: number;
  since: number;
  foe: number;
}

/** 当前年份的所有战争 */
interface War {
  id: number;
  parties: number[];
  start: number;
}

/** 当前年份的所有宗藩关系 */
interface Vassalage {
  lord: number;
  vassal: number;
  since: number;
}

/** 从史事中提取当前年份的外交关系(盟/藩对齐 relationsAt 的顺序语义) */
export function extractDiplomacy(civ: Civ, year: number): { alliances: Alliance[]; wars: War[]; vassalages: Vassalage[] } {
  // 盟约、宗藩:复用引擎同款顺序扫描(结→断→再结、submit→defect 都正确)
  const { liege, pacts } = relationsAt(civ, year);
  const alliances: Alliance[] = pacts.map((p) => ({ a: p.a, b: p.b, since: p.since, foe: p.foe }));
  const vassalages: Vassalage[] = [...liege].map(([vassal, x]) => ({ lord: x.liege, vassal, since: x.since }));

  // 战争:war 开打,peace / fall 结束(与 outline / chronicle 一致)
  const wars: War[] = [];
  const warMap = new Map<number, War>();
  for (const e of civ.annals) {
    if (e.year > year) break;
    if (e.kind === 'war') {
      const wid = e.war ?? -1;
      if (wid >= 0) {
        warMap.set(wid, { id: wid, parties: [e.a, e.b], start: e.year });
      }
    } else if ((e.kind === 'peace' || e.kind === 'fall') && e.war >= 0) {
      warMap.delete(e.war);
    }
  }
  wars.push(...warMap.values());

  return { alliances, wars, vassalages };
}

/** 宗藩按宗主分组:先出现的宗主在前,它的藩属保持原来的顺序 */
export function groupVassalages(vassalages: Vassalage[]): { lord: number; vassals: Vassalage[] }[] {
  const order: number[] = [];
  const by = new Map<number, Vassalage[]>();
  for (const v of vassalages) {
    let list = by.get(v.lord);
    if (!list) {
      list = [];
      by.set(v.lord, list);
      order.push(v.lord);
    }
    list.push(v);
  }
  return order.map((lord) => ({ lord, vassals: by.get(lord)! }));
}

function diploSummary(alliances: number, wars: number, vassalages: number): string {
  const parts = [
    wars ? `${wars} 场战争` : '',
    alliances ? `${alliances} 组结盟` : '',
    vassalages ? `${vassalages} 门宗藩` : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join('，')}。点国名可飞到地图。` : '';
}

function PolityLink({ civ, pid, year }: { civ: Civ; pid: number; year: number }) {
  const P = civ.polities[pid];
  if (!P) return <span className="ov-na">—</span>;

  const name = polityName(P, year);
  const alive = polityAlive(P, year);

  const onClick = () => {
    if (!alive) setCivTime({ year: Math.min(P.ended ?? year, year), playing: false });
    setSelection({ kind: 'polity', id: pid });
    closeOverview();
  };

  return (
    <button className={`ov-pol${alive ? '' : ' dead'}`} onClick={onClick} title={alive ? name : `${name}（已亡）`}>
      <PolityFlag id={pid} year={year} w={18} />
      <span className="ov-pol-name">{name}</span>
    </button>
  );
}

export function DiplomacyPage({ civ, year }: DiplomacyPageProps) {
  const era = useEra();
  const { alliances, wars, vassalages } = useMemo(() => extractDiplomacy(civ, year), [civ, year]);
  const houses = useMemo(() => groupVassalages(vassalages), [vassalages]);
  const hasAny = alliances.length > 0 || wars.length > 0 || vassalages.length > 0;
  const summary = diploSummary(alliances.length, wars.length, vassalages.length);

  return (
    <div className="ov-page ov-diplomacy">
      {hasAny && <p className="ov-diplo-sum">{summary}</p>}
      {!hasAny && (
        <div className="ov-empty">
          <p>{yearShortAt(year, era)}没有外交关系</p>
          <p className="ov-diplo-hint">有结盟、开战或称臣时会出现在下面</p>
        </div>
      )}

      {alliances.length > 0 && (
        <section className="ov-diplo-section">
          <h3 className="ov-diplo-title">
            结盟 <span className="ov-diplo-count">{alliances.length}</span>
          </h3>
          <div className="ov-diplo-list">
            {alliances.map((a, i) => (
              <div key={i} className="ov-diplo-row" data-kind="alliance">
                <div className="ov-diplo-parties">
                  <PolityLink civ={civ} pid={a.a} year={year} />
                  <span className="ov-diplo-rel">结盟</span>
                  <PolityLink civ={civ} pid={a.b} year={year} />
                </div>
                <div className="ov-diplo-meta">
                  {a.foe >= 0 && (
                    <span className="ov-diplo-foe">
                      共御 <PolityLink civ={civ} pid={a.foe} year={year} />
                    </span>
                  )}
                  <span className="ov-diplo-since">{yearShortAt(a.since, era)}起</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {wars.length > 0 && (
        <section className="ov-diplo-section">
          <h3 className="ov-diplo-title">
            战争 <span className="ov-diplo-count">{wars.length}</span>
          </h3>
          <div className="ov-diplo-list">
            {wars.map((w) => (
              <div key={w.id} className="ov-diplo-row" data-kind="war">
                <div className="ov-diplo-parties">
                  <PolityLink civ={civ} pid={w.parties[0]} year={year} />
                  <span className="ov-diplo-rel">交战</span>
                  <PolityLink civ={civ} pid={w.parties[1]} year={year} />
                </div>
                <div className="ov-diplo-meta">
                  <span className="ov-diplo-since">{yearShortAt(w.start, era)}起</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {houses.length > 0 && (
        <section className="ov-diplo-section">
          <h3 className="ov-diplo-title">
            宗藩 <span className="ov-diplo-count">{vassalages.length}</span>
          </h3>
          <div className="ov-diplo-list">
            {houses.map((h) => (
              <div key={h.lord} className="ov-diplo-row" data-kind="vassalage">
                <div className="ov-diplo-liege">
                  <span className="ov-diplo-rel">宗主</span>
                  <PolityLink civ={civ} pid={h.lord} year={year} />
                </div>
                <ul className="ov-diplo-vassals">
                  {h.vassals.map((v) => (
                    <li key={v.vassal} className="ov-diplo-vassal">
                      <PolityLink civ={civ} pid={v.vassal} year={year} />
                      <span className="ov-diplo-rel">称臣</span>
                      <span className="ov-diplo-since">{yearShortAt(v.since, era)}起</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

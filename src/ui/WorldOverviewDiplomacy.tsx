/**
 * 世界概览的"外交"页：展示当前年份的外交关系
 * 
 * - 联盟：结盟国家、共御强邻、结盟年份
 * - 战争：交战双方、开战年份
 * - 藩属：宗主国和藩属国
 * 
 * 点击国家 = 收起概览、选中该国家并飞到地图
 */
import { useMemo } from 'react';
import type { Civ } from '../gen/civ/types';
import { polityAlive, polityName } from '../gen/readers/openQuery';
import { polityTies, type PolityTies } from '../gen/civ/diplomacy';
import { setCivTime, setSelection } from './civView';
import { closeOverview } from './overviewStore';
import { PolityFlag } from './Flag';
import { useEra } from './editsStore';
import { yearShort, type Era } from '../gen/era';
import './overview.css';

interface DiplomacyPageProps {
  civ: Civ;
  year: number;
}

/** 当前年份的所有联盟关系 */
interface Alliance {
  a: number; // 国家A
  b: number; // 国家B
  since: number; // 结盟年份
  foe: number; // 共御强邻（-1=无）
}

/** 当前年份的所有战争 */
interface War {
  id: number; // 战争ID
  parties: number[]; // 参战国家
  start: number; // 开战年份
}

/** 当前年份的所有宗藩关系 */
interface Vassalage {
  lord: number; // 宗主国
  vassal: number; // 藩属国
  since: number; // 建立年份
}

/** 从史事中提取当前年份的外交关系 */
function extractDiplomacy(civ: Civ, year: number): { alliances: Alliance[]; wars: War[]; vassalages: Vassalage[] } {
  const alliances: Alliance[] = [];
  const wars: War[] = [];
  const vassalages: Vassalage[] = [];
  
  // 提取联盟（alliance事件，未被unally断盟）
  const unallied = new Set<string>();
  for (const e of civ.annals) {
    if (e.year > year) break;
    if (e.kind === 'unally') {
      unallied.add(`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`);
    }
  }
  
  for (const e of civ.annals) {
    if (e.year > year) break;
    if (e.kind === 'alliance') {
      const key = `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
      if (!unallied.has(key) && polityAlive(civ.polities[e.a], year) && polityAlive(civ.polities[e.b], year)) {
        alliances.push({ a: e.a, b: e.b, since: e.year, foe: e.foe ?? -1 });
      }
    }
  }
  
  // 提取战争（war事件，未结束）
  const warMap = new Map<number, War>();
  for (const e of civ.annals) {
    if (e.year > year) break;
    if (e.kind === 'war') {
      const wid = e.war ?? -1;
      if (wid >= 0) {
        warMap.set(wid, { id: wid, parties: [e.a, e.b], start: e.year });
      }
    }
    // TODO: 战争结束事件（peace等）应该移除战争
  }
  wars.push(...warMap.values());
  
  // 提取宗藩关系（submit事件，未被defect断绝）
  const defected = new Set<string>();
  for (const e of civ.annals) {
    if (e.year > year) break;
    if (e.kind === 'defect') {
      defected.add(`${e.b}-${e.a}`); // b脱离a
    }
  }
  
  for (const e of civ.annals) {
    if (e.year > year) break;
    if (e.kind === 'submit') {
      const key = `${e.a}-${e.b}`; // a臣服于b
      if (!defected.has(key) && polityAlive(civ.polities[e.a], year) && polityAlive(civ.polities[e.b], year)) {
        vassalages.push({ lord: e.b, vassal: e.a, since: e.year });
      }
    }
  }
  
  return { alliances, wars, vassalages };
}

function PolityLink({ civ, pid, year, era }: { civ: Civ; pid: number; year: number; era: Era | undefined }) {
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
    <button 
      className={`ov-pol${alive ? '' : ' dead'}`}
      onClick={onClick}
      title={alive ? name : `${name}（已亡）`}
    >
      <PolityFlag id={pid} year={year} w={16} />
      <span className="ov-pol-name">{name}</span>
    </button>
  );
}

export function DiplomacyPage({ civ, year }: DiplomacyPageProps) {
  const era = useEra();
  const { alliances, wars, vassalages } = useMemo(() => extractDiplomacy(civ, year), [civ, year]);
  
  // 按类型分组显示
  const hasAny = alliances.length > 0 || wars.length > 0 || vassalages.length > 0;
  
  return (
    <div className="ov-page ov-diplomacy">
      {!hasAny && (
        <div className="ov-empty">
          <p>当前年份（{yearShort(year, era)}）没有外交关系</p>
          <p className="ov-hint">联盟、战争和宗藩关系会在这里显示</p>
        </div>
      )}
      
      {alliances.length > 0 && (
        <section className="ov-diplo-section">
          <h3 className="ov-diplo-title">
            联盟 <span className="ov-diplo-count">（{alliances.length}）</span>
          </h3>
          <div className="ov-diplo-list">
            {alliances.map((a, i) => (
              <div key={i} className="ov-diplo-row" data-kind="alliance">
                <div className="ov-diplo-parties">
                  <PolityLink civ={civ} pid={a.a} year={year} era={era} />
                  <span className="ov-diplo-sep">⚭</span>
                  <PolityLink civ={civ} pid={a.b} year={year} era={era} />
                </div>
                <div className="ov-diplo-meta">
                  {a.foe >= 0 && (
                    <span className="ov-diplo-foe">
                      共御 <PolityLink civ={civ} pid={a.foe} year={year} era={era} />
                    </span>
                  )}
                  <span className="ov-diplo-since">自 {yearShort(a.since, era)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {wars.length > 0 && (
        <section className="ov-diplo-section">
          <h3 className="ov-diplo-title">
            战争 <span className="ov-diplo-count">（{wars.length}）</span>
          </h3>
          <div className="ov-diplo-list">
            {wars.map((w) => (
              <div key={w.id} className="ov-diplo-row" data-kind="war">
                <div className="ov-diplo-parties">
                  {w.parties.map((pid, i) => (
                    <div key={i}>
                      <PolityLink civ={civ} pid={pid} year={year} era={era} />
                      {i < w.parties.length - 1 && <span className="ov-diplo-sep">⚔</span>}
                    </div>
                  ))}
                </div>
                <div className="ov-diplo-meta">
                  <span className="ov-diplo-since">自 {yearShort(w.start, era)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {vassalages.length > 0 && (
        <section className="ov-diplo-section">
          <h3 className="ov-diplo-title">
            宗藩 <span className="ov-diplo-count">（{vassalages.length}）</span>
          </h3>
          <div className="ov-diplo-list">
            {vassalages.map((v, i) => (
              <div key={i} className="ov-diplo-row" data-kind="vassalage">
                <div className="ov-diplo-parties">
                  <PolityLink civ={civ} pid={v.vassal} year={year} era={era} />
                  <span className="ov-diplo-sep">臣服于</span>
                  <PolityLink civ={civ} pid={v.lord} year={year} era={era} />
                </div>
                <div className="ov-diplo-meta">
                  <span className="ov-diplo-since">自 {yearShort(v.since, era)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

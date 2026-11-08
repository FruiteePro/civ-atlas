import { generateWorld, DEFAULT_PARAMS } from './src/gen/world';
import { generateCiv } from './src/gen/civ';
import { ownersAt } from './src/gen/civ/engine/timeline';

const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
const civ = generateCiv(w);

console.log('=== 分析第一次崩溃 ===');
const collapse = civ.annals.find(e => e.kind === 'collapse');
if (collapse) {
  const P = civ.polities[collapse.a];
  console.log(`崩溃: pid=${collapse.a} year=${collapse.year} kind=${collapse.b}`);
  
  // 崩溃前的领土
  const beforeOwners = ownersAt(civ, collapse.year - 0.01).polity;
  const territories = [];
  for (let r = 0; r < beforeOwners.length; r++) {
    if (beforeOwners[r] === collapse.a) territories.push(r);
  }
  
  console.log(`  崩溃前领土: ${territories.length}个州`);
  
  // 检查有多少个城市
  let cityCount = 0;
  let cityPopTotal = 0;
  for (const s of civ.settlements) {
    if (territories.includes(s.region) && (s.ended === undefined || s.ended > collapse.year)) {
      cityCount++;
      // 近似人口（不精确但足够判断）
      cityPopTotal += s.capacity || 0;
    }
  }
  
  console.log(`  有城市的州: ${cityCount}个, 总容量: ${cityPopTotal}`);
  
  // 检查散回部落的州
  const afterOwners = ownersAt(civ, collapse.year + 0.01).polity;
  let tribalCount = 0;
  for (const r of territories) {
    if (afterOwners[r] === -1) tribalCount++;
  }
  
  console.log(`  散回部落的州: ${tribalCount}个`);
  console.log(`  保留给母国的州: ${territories.length - tribalCount}个`);
}

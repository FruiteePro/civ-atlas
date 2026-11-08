import { generateWorld, DEFAULT_PARAMS } from './src/gen/world';
import { generateCiv } from './src/gen/civ';
import { ownersAt } from './src/gen/civ/engine/timeline';

const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
const civ = generateCiv(w);

const collapse = civ.annals.find(e => e.kind === 'collapse' && e.b === 2);
if (collapse) {
  console.log(`分析kind=2崩溃: pid=${collapse.a} year=${collapse.year}`);
  
  const beforeOwners = ownersAt(civ, collapse.year - 0.01).polity;
  const territories = [];
  for (let r = 0; r < beforeOwners.length; r++) {
    if (beforeOwners[r] === collapse.a) territories.push(r);
  }
  
  let withCity = 0;
  const cityRegions: number[] = [];
  for (const s of civ.settlements) {
    if (territories.includes(s.region) && (s.ended === undefined || s.ended > collapse.year)) {
      withCity++;
      cityRegions.push(s.region);
    }
  }
  
  console.log(`  总领土: ${territories.length}个州`);
  console.log(`  有城的州: ${withCity}个`);
  console.log(`  有城的州编号: ${cityRegions.slice(0, 10).join(',')}${cityRegions.length > 10 ? '...' : ''}`);
}

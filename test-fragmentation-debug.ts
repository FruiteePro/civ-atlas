import { generateWorld, DEFAULT_PARAMS } from './src/gen/world';
import { generateCiv } from './src/gen/civ';

const w = generateWorld({ ...DEFAULT_PARAMS, seed: 2024 });
const civ = generateCiv(w);

console.log('=== 崩溃事件分析 ===');
const collapses = civ.annals.filter(e => e.kind === 'collapse');
console.log(`总崩溃数: ${collapses.length}`);

for (let i = 0; i < Math.min(3, collapses.length); i++) {
  const c = collapses[i];
  const P = civ.polities[c.a];
  console.log(`\n崩溃 ${i}: pid=${c.a} year=${c.year} kind=${c.b} successors=${c.war}`);
  console.log(`  母国: ${P.name} 立国=${P.founded} 亡于=${P.ended}`);
  
  // 找后续split事件
  const idx = civ.annals.indexOf(c);
  let splitCount = 0;
  for (let j = idx + 1; j < Math.min(idx + 10, civ.annals.length); j++) {
    const e = civ.annals[j];
    if (e.kind === 'split' && e.cause === 'collapse' && e.b === c.a) {
      splitCount++;
      const successor = civ.polities[e.a];
      console.log(`    继承国 ${splitCount}: ${successor.name} (${e.a})`);
    }
  }
  
  if (splitCount === 0 && c.b < 2) {
    console.log(`    ⚠️ kind=${c.b}但没有split事件！`);
  }
}

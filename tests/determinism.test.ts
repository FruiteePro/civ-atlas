/**
 * 同一个种子在任何电脑上都生成逐位一致的世界:
 * 地形、文明的**全部数据**(每个类型化数组逐字节、每个小数按 64 位原样,名字也算)按字段各算一个指纹,钉住。
 * CI(x64 Linux)和本地(Apple 芯片 macOS)都要过 —— 推演里 Math.pow / exp / log 算出来、之后要比较或存下来的量
 * 都舍入到 24 位(gen/civ/rand.ts 的 round24),最后一位的差别不会漏进世界里。
 *
 * 对不上时,失败信息里是"哪几个字段变了"。生成算法有意改了(GENERATOR_VERSION 加一)时更新期望值:
 *   PRINT_FINGERPRINT=1 npx vitest run tests/determinism.test.ts
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, generateWorld } from '../src/gen/world';
import { generateCiv } from '../src/gen/civ';

const f64 = new Float64Array(1);
const f64b = new Uint8Array(f64.buffer);

/** 一个值的指纹:类型化数组逐字节,数按 64 位原样,对象按键名排序 */
function print(v: unknown): string {
  const h = createHash('sha1');
  const feed = (x: unknown): void => {
    if (x === null || x === undefined) return void h.update(`~${x}`);
    if (ArrayBuffer.isView(x)) {
      h.update(`<${x.constructor.name}:${x.byteLength}>`);
      return void h.update(new Uint8Array(x.buffer, x.byteOffset, x.byteLength));
    }
    if (Array.isArray(x)) {
      h.update(`[${x.length}`);
      x.forEach(feed);
      return void h.update(']');
    }
    if (typeof x === 'object') {
      for (const k of Object.keys(x as object).sort()) {
        h.update(`.${k}`);
        feed((x as Record<string, unknown>)[k]);
      }
      return;
    }
    if (typeof x === 'number') {
      f64[0] = x;
      h.update('n');
      return void h.update(f64b);
    }
    h.update(`${typeof x}:${String(x)}`);
  };
  feed(v);
  return h.digest('hex').slice(0, 12);
}

/** 地形、文明各字段的指纹(字段名前加 world. / civ.) */
function fingerprint(seed: number): Record<string, string> {
  const w = generateWorld({ ...DEFAULT_PARAMS, cells: 12000, seed });
  const civ = generateCiv(w);
  const out: Record<string, string> = {};
  for (const k of Object.keys(w).sort()) out[`world.${k}`] = print((w as unknown as Record<string, unknown>)[k]);
  for (const k of Object.keys(civ).sort()) {
    // 地图上画的关隘(Place.kind = 'pass')是后加的:别的地名单算一份(加关隘时它一个字没变),关隘另算一份
    if (k === 'places') {
      out['civ.places'] = print(civ.places.filter((p) => p.kind !== 'pass'));
      out['civ.places.pass'] = print(civ.places.filter((p) => p.kind === 'pass'));
    } else out[`civ.${k}`] = print((civ as unknown as Record<string, unknown>)[k]);
  }
  return out;
}

/**
 * 期望值是 GENERATOR_VERSION 24 算的(civ.religion 是后加的字段,加它时别的字段一个没变;地图上画的关隘(civ.places 里的 pass,算在 civ.places.pass)也是后加的,加它时别的字段、别的地名一个没变,后来关隘又记上在那里据险断后的史事(Place.pass.stands),也只变了 civ.places.pass;10 加了邦交、11 加了君主性格和扩张算账,历史都重排;12 只改了 civ.people:多了名臣,将领有了字号、籍贯、官职,撞名的将领换了名字;13 改了宜居度和城的人口上限,地形一个字段没变,历史重排;多了 civ.capNorm;14 处理了封闭内海、贴着海的湖、湖心小块地,地形局部变了、历史重排;15 立国更早、多了边缘立国和民族分化,历史重排;civ.development 是后加的字段,加它时别的字段一个没变;16 有了航海时代,历史重排;17 发展度反过来影响人口、打仗和远航,各国自己进航海时代,历史重排;18 降水分夏冬两半年算、河多了,地形不变,气候、河流、历史重排;19 仗短而狠、乘胜连下、前线拉锯,历史重排;20 有了饥荒、民变、大崩解,历史重排;23 推完以后的整理只看每样东西出现以前的历史,归属、日志、史事、检查点一个没变,民族、州、城、国家、人物、地名、道路、信仰重排,多了 civ.capSpacing;24 推演里走过的航线不通到遗址,只有 civ.routes 变了;36 君主有了诸子、王子领兵、争储,宗室据地自立,历史重排;39 有了立约与中立地,历史重排;40 有了掌实权的人和两国宗室联姻,历史重排;41 开战看内政,历史重排;42 亡国之君先出奔中立地,疆域兴亡不变,只多了出奔的史事(civ.annals、civ.people、civ.development 里记的史事条数、civ.places.pass 里记的史事下标跟着变);43 战争节奏(议和了还会再打、仗打得密、罢兵割地),历史重排;44 亡国之君出奔邻国,疆域兴亡不变,只多了出奔的史事(和 42 一样只变了 civ.annals、civ.people、civ.development、civ.places.pass);46 有了大迁徙,历史重排,多了 civ.migrations;48 大迁徙的方位按整条路线定,只变了 civ.migrations;50 一部分人物换成女的,只变了 civ.people(性别、名字、字、西幻的序数);51 将门世家、复国之君接上故国世系,只变了 civ.people(多了父子、补的宗室,名字、籍贯、编号跟着变)和 civ.religion(里面记的君主编号);civ.ideology(思潮,只算不用)是后加的字段,加它时别的字段一个没变;53 调了思潮的数(传播、退潮),只变了 civ.ideology;54 思潮的快照从每 100 年一份改成每 20 年一份,只变了 civ.ideology;55 改制(立宪、废君立共和、革命、政变、复辟,读思潮)进推演,历史重排;56 滚雪球(破都纳降、连续吞并),历史重排;57 有了湿地(低平积水的陆地块成了湿地,难住难走),地形、气候、河一个字段没变,world.biome 和历史重排;同一版里还修了接着推会改掉先前人物的几处(太后的丈夫、预定继承人的名字、改名的将领名臣),只变了 civ.people 和 civ.religion;59 将领名臣避重名时多试几轮,只变了 civ.people;60 民族更密、分化稍易,地形一个字段没变,历史重排;61 加厚十二种语感词库,地形、历史一个字段没变,只有带名字的字段变了(civ.cultures、civ.people、civ.places、civ.places.pass、civ.polities、civ.regions、civ.religion、civ.settlements、civ.trade);62 六种新语感接入,语感对口分变了,地形、疆域、兴亡一个字段没变,只有带名字的字段和人物变了(civ.cultures、civ.people、civ.places、civ.places.pass、civ.polities、civ.regions、civ.religion、civ.settlements、civ.trade);63 分化出来的民族按母族语感做方言,地形、疆域、兴亡一个字段没变,只有分化支的默认名字变了(civ.people、civ.polities、civ.regions、civ.religion、civ.settlements;族名、山海地名不变);64 同一书写系统里外族统治够久后,被统治民族后来的地名、国号、人名走接触语,地形、疆域、兴亡一个字段没变,只有带名字的字段变了(civ.people、civ.polities;有的种子还有 civ.regions、civ.settlements、civ.trade))；65 反向同化略松、长期混居且同一书写系统的两族偶尔融成一支新民族,地形一个字段没变,历史重排；66 国内少数族早年日常自治更松,中古以后日常收紧,危机里自立、复国、割据按占地和是否异教另加一截,地形一个字段没变,历史重排；67 各语感教名、民间通名加厚,地形、疆域、兴亡一个字段没变,只有 civ.religion 变了；68 起神权是单独一种政体,国教既盛时可立教宗 / 大祭司 / 国师主国,地形一个字段没变,历史重排。经纬度换算、沿大圆走、球面三角形面积这些三角函数都舍入到 24 位,
 * 推演里的超越函数也一样,所以各 CPU、各浏览器逐位一致
 */
const EXPECTED: Record<number, Record<string, string>> = {
  7: {
    'world.biome': 'c00f0e77874c',
    'world.climate': 'd66f2d1ccdb0',
    'world.currents': '12874885f306',
    'world.elevation': 'f01aa0301717',
    'world.flux': 'b2ed8d63c492',
    'world.height': 'fd7f315bb385',
    'world.history': 'c6e74f54fbd3',
    'world.maxElevation': 'e1e7e5545349',
    'world.mesh': 'c2903f932177',
    'world.params': 'd5d90d26a425',
    'world.precipitation': 'b28a1616b918',
    'world.riverThreshold': '5cd46994cd42',
    'world.rivers': 'dab6acc2c8e1',
    'world.seaIce': 'b525553d04bc',
    'world.tect': '3ceab03d7b8c',
    'world.temperature': '72dda8cb251f',
    'world.volcanoes': '1184f5b8d4b6',
    'world.water': '3b5ac6e5ff00',
    'world.waterLevel': '35508e445f12',
    'world.width': '2fd8ac4eb585',
    'civ.annals': 'bcdaf293f498',
    'civ.capNorm': 'fc9e5d7240d6',
    'civ.capSpacing': 'd1ee46b5e8ad',
    'civ.checkpoints': '6055805b71fc',
    'civ.culture': '3e1f1e5df5f7',
    'civ.cultures': 'c820e2f08907',
    'civ.development': '1e8d6fb31c4b',
    'civ.endYear': 'c1d83dcab0a1',
    'civ.habitat': '6098ba1d2eb9',
    'civ.ideology': 'bdcb307daaf2',
    'civ.log': 'b7f58cfe04b1',
    'civ.migrations': '23f357c5fb85',
    'civ.people': 'a79d0c19fa30',
    'civ.places': '29f642b1c639',
    'civ.places.pass': 'bdcd4a28a466',
    'civ.polities': 'b5dc3b52e43e',
    'civ.polity': 'e60209637f56',
    'civ.polityYears': 'e5d380617183',
    'civ.regions': '5c3b5104170b',
    'civ.religion': '599cdee17ea1',
    'civ.routes': '9db1bead12db',
    'civ.sailFrom': '5bd9534e2395',
    'civ.seed': '0096064c9137',
    'civ.settlements': 'ea05a3d82776',
    'civ.spreadYears': '64101778cdf0',
    'civ.trade': '28fe41fed29c',
    'civ.viable': '139cfad50334',
  },
  555: {
    'world.biome': 'f2ac9283c3b1',
    'world.climate': '80fc89f4397e',
    'world.currents': 'a72b7b25c092',
    'world.elevation': 'c7fce070eac0',
    'world.flux': '2a85dab2ca5d',
    'world.height': 'fd7f315bb385',
    'world.history': '0062cb3dd341',
    'world.maxElevation': '1f608fcaeec9',
    'world.mesh': '078ef2351116',
    'world.params': '812ced2cd033',
    'world.precipitation': '50516b576134',
    'world.riverThreshold': '4d0838ba97f9',
    'world.rivers': 'bf362e700894',
    'world.seaIce': '348ee892db40',
    'world.tect': '1067700095d3',
    'world.temperature': '53ea8de0446e',
    'world.volcanoes': '1184f5b8d4b6',
    'world.water': '050e7112dd1c',
    'world.waterLevel': '52d96cb0744c',
    'world.width': '2fd8ac4eb585',
    'civ.annals': '111ea47d0b78',
    'civ.capNorm': 'ea294355a9bc',
    'civ.capSpacing': '8fda3225da8f',
    'civ.checkpoints': 'f158b04c7f7e',
    'civ.culture': '2d3ba32915fc',
    'civ.cultures': '2ac88b158952',
    'civ.development': 'd24385c91740',
    'civ.endYear': 'c1d83dcab0a1',
    'civ.habitat': 'e1db4fed3a88',
    'civ.ideology': 'ed7d99fd15e2',
    'civ.log': '42bf1263387e',
    'civ.migrations': 'e470b8ae1212',
    'civ.people': '86dc529e023d',
    'civ.places': 'b2840f0e9365',
    'civ.places.pass': '645d536ca3ed',
    'civ.polities': '36bbba117cde',
    'civ.polity': 'e2f26cf56e09',
    'civ.polityYears': 'e5d380617183',
    'civ.regions': 'c02ce060d7cb',
    'civ.religion': 'd71c4b10120e',
    'civ.routes': '2053b755f5b4',
    'civ.sailFrom': '5bd9534e2395',
    'civ.seed': '6b5deaaf6a3b',
    'civ.settlements': '4069f83def8b',
    'civ.spreadYears': 'fbd57f466ab4',
    'civ.trade': '3fbce3567354',
    'civ.viable': '139cfad50334',
  },
  2024: {
    'world.biome': 'abeabc59fc8f',
    'world.climate': 'de99136bdcb4',
    'world.currents': '41ded18e783d',
    'world.elevation': '3371d4f88502',
    'world.flux': 'eb38bf365d77',
    'world.height': 'fd7f315bb385',
    'world.history': '15db6dec2bfa',
    'world.maxElevation': 'd1ba197be798',
    'world.mesh': 'bfa5bc2bb9fd',
    'world.params': '192477c360fd',
    'world.precipitation': '9136b576c0bb',
    'world.riverThreshold': 'e2e2f2922c0a',
    'world.rivers': '1f198061413e',
    'world.seaIce': '036578bd5088',
    'world.tect': '46e2825b8bd6',
    'world.temperature': '66911484f50e',
    'world.volcanoes': '1184f5b8d4b6',
    'world.water': '78ebae4644e5',
    'world.waterLevel': 'eb3f3f7cdd31',
    'world.width': '2fd8ac4eb585',
    'civ.annals': 'f5697724e8d0',
    'civ.capNorm': '887e27087868',
    'civ.capSpacing': '8fda3225da8f',
    'civ.checkpoints': '22f4006ef860',
    'civ.culture': '3e83cfb06887',
    'civ.cultures': '39b0804ea089',
    'civ.development': '671b7db379f1',
    'civ.endYear': 'c1d83dcab0a1',
    'civ.habitat': '2d1bad8242f7',
    'civ.ideology': '3e2e928caca5',
    'civ.log': '871a3625b4d2',
    'civ.migrations': '74598a32603f',
    'civ.people': 'fac2f74fe86e',
    'civ.places': 'b4b2b33281a9',
    'civ.places.pass': '522c3e1d95d3',
    'civ.polities': 'fe1db76089c6',
    'civ.polity': 'a2b61673afda',
    'civ.polityYears': 'e5d380617183',
    'civ.regions': '6e34b844db55',
    'civ.religion': '7831ef2891ef',
    'civ.routes': '09b20aaf065d',
    'civ.sailFrom': '5bd9534e2395',
    'civ.seed': '3ff6de7b7854',
    'civ.settlements': '632317ebf836',
    'civ.spreadYears': 'd78e8df8194d',
    'civ.trade': '640c2a9fee97',
    'civ.viable': '139cfad50334',
  },
};;

describe('同一个种子在任何电脑上都是同一个世界', () => {
  it.each([2024, 7, 555])('seed %i(12k 地块):地形、文明全部数据的指纹逐字段对得上', (seed) => {
    const fp = fingerprint(seed);
    if (process.env.PRINT_FINGERPRINT) console.log(`${seed}: ${JSON.stringify(fp, null, 2)}`);
    expect(fp).toEqual(EXPECTED[seed]);
  }, 60_000);
});

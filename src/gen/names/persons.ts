/**
 * 人名生成器:君主、统帅的名字,和地名用同一套语感。
 *
 * - 西幻风:先拼拉丁字母原形(词根 + 可选的中间音节 + 词尾),再按这种语感的译音表转成中文(Aldric → 阿尔德里克)。
 * - 东方风:中原、仙侠、和风、海东是"姓 + 名"(名一两个字);边塞是西域音译式的名(两三个字);山海是上古式的两字名。都不带姓的语感,姓为空串。
 * - 女名(femaleGiven):东方各语感另有一套用字;西幻词根照用、换女名的词尾,译音时按中文译女名的习惯换几个字
 *   (ia → 娅、na → 娜、li → 莉、ri → 丽、va → 娃、wen → 雯……,词尾的 s / th 写"丝")。
 *
 * 按键取:同一个 seed + 语感 + 用途 + 键 → 同一个名字,和调用先后无关(键 = 国家的位置锚、第几位……,见 gen/civ/people.ts)。
 * 不查重:调用方自己挑(同一朝的君主不重名时换下一个键)。
 * 接触语(createPersonNamer 的 contact):底层可先做过方言,再按约六四掺进统治层的词根、词尾和一批过渡成分;带不带姓仍跟底层。
 *
 * 人名只在编年史、面板里出现,不上地图:这个文件的字不收进地图字体的字表(见 scripts/lib/charset.ts)。
 * 纯计算,不碰 DOM;随机数来自 subSeed(seed, 'persons:风格')。
 */
import { keyed, mulberry32, subSeed, type Rng } from '../util';
import { WESTERN_STYLES } from './western';
import { transcribe, type TranscribeOptions } from './transcribe';
import { latinBlocked, zhBlocked } from './filters';
import { list, parts, pick, wpick, type Part, type Weighted } from './spec';
import { preferChars, preferSlice, shiftWeights } from './dialect';
import { mixParts, mixWeighted, type StyleContact } from './contact';

export interface PersonNamer {
  readonly style: string;
  readonly family: 'western' | 'eastern';
  /** 这种语感的人名带不带姓(中原、仙侠、和风、海东带;边塞、山海、西幻不带) */
  readonly surnamed: boolean;
  /** 姓;不带姓的语感 = 空串 */
  surname(...key: number[]): string;
  /** 名(带姓的语感不含姓) */
  given(...key: number[]): string;
  /** 女名(带姓的语感不含姓;和 given 是两套随机数,同一个键起的男名、女名互不相干) */
  femaleGiven(...key: number[]): string;
}

// ---------------------------------------------------------------------------
// 西幻:拉丁原形 + 音译

interface WesternPersonStyle {
  stems: Part[];
  mids: Part[];
  /** 插中间音节的概率 */
  mid: number;
  ends: Weighted<Part>[];
}

/** 各语感的人名构词表(词根、中间音节、词尾都是自拟的,不照搬真实的名人、他人作品里的角色) */
const WESTERN_PERSONS: Record<string, WesternPersonStyle> = {
  imperial: {
    stems: list('aur fab flav jul luc marc max oct sev tib val vesp cass corn drus gall hadr quint serv tit aem anton aquil camil clem decim prim vest hort prisc flor cels silv liv proc tert hon norv pont'),
    mids: list('el en ar il in an or'),
    mid: 0.3,
    ends: parts('ius:4 ian:2 us:2 inus:2 ianus:1 or:1 ens:1 elus:1 anus:1'),
  },
  kingdom: {
    stems: list('ald ed wil rich rob hen ger wal gil theo os al ber her gal leo ray rod tris per lan ste bald arn em od ead cuth wulf kirk glen flint thorn'),
    mids: list('er el an en or'),
    mid: 0.15,
    ends: parts('ric:3 bert:3 win:2 mund:2 ward:2 wald:1 frid:1 an:1 ard:2 gar:1 ulf:1 ain:1 old:1 mer:1 ley:1'),
  },
  nordic: {
    stems: list('har sig ulf bjor ragn tor ein gunn ol hal ket arn ing sven vid sten erl hrol as eyv thor orm brand foss stein liv yng skjold brok'),
    mids: list('e a i'),
    mid: 0.1,
    ends: parts('ald:3 urd:2 var:2 ulf:2 mund:1 ar:2 ir:1 grim:1 vald:1 ketil:1 leif:1 dan:1 stein:1 orn:1'),
  },
  slavic: {
    stems: list('vlad yaro svyato msti bor rad mir stan bole vela dobro lyub sudi miro rosti ole bogu zdeno vito les grom tich vesn orel javor drev'),
    mids: list('o e a'),
    mid: 0.1,
    ends: parts('slav:5 mir:3 polk:1 dan:1 gost:1 voj:1 bor:1 mil:1 rad:1'),
  },
  hellenic: {
    stems: list('ari kle the dem nik kal per lys phil hip xan eu ant tim arch dio her pol sos ast meg glau nire phon helio selen chrys cleo lyra naus'),
    mids: list('o a i on'),
    mid: 0.25,
    ends: parts('as:2 es:3 on:2 os:2 ides:3 ander:1 ippos:1 kles:2 menes:1 stratos:1 machos:1 ion:1'),
  },
  desert: {
    stems: list('rash khal sal mus jaf zay tar nas ham kar mah far sul has bas mun qas hak ab wal nur badr fajr najm raml fayz qays layl rih'),
    mids: list('a i u'),
    mid: 0.1,
    ends: parts('id:3 il:2 im:3 an:2 ud:1 ir:2 af:1 un:1 ar:1 ad:1 uns:1'),
  },
  steppe: {
    stems: list('bat tog kub men ok ar bor kai qut yes tem chag jo ol sub mun bil tol al alt ur bek khas chul nara buya ochi zaya tulg suke baar jir noka yesu khish merkh'),
    mids: list('a u i ai e'),
    mid: 0.1,
    ends: parts('u:3 ul:2 ai:1 ar:2 ei:1 an:2 gul:1 dai:1 tai:1 lun:1 tur:1 tem:1'),
  },
  elven: {
    stems: list('ael sil thal cael ith mir nim fael lir aer vael ser tir fin eir lith nar len myr sael aen ior loe faer loth orme gwen cele raen glin laer'),
    mids: list('a e i an el ie'),
    mid: 0.3,
    ends: parts('ion:3 iel:2 orin:2 is:1 ar:2 en:1 ethil:1 wyn:1 as:2 andir:1 aen:1 or:2 ien:1'),
  },
  indic: {
    stems: list('vira pala kavi rasa hari mitra ravi guna tala suta mahi nila purna kusha bhadra sena vara dina lata naga'),
    mids: list('a i'),
    mid: 0.2,
    ends: parts('an:2 a:1 ev:1 ish:1 as:1 ut:1'),
  },
  persian: {
    stems: list('rosh mehr azar gol yas shad darb visp nav khur far=法尔 dena sur nava boran gash zar spah'),
    mids: list('a i e'),
    mid: 0.15,
    ends: parts('an:3 ar:2 ad:1 sh:1 in:1'),
  },
  nusantara: {
    stems: list('sila rata bulan pasir kayu batu angin sari padi mutia nusa laut bunga'),
    mids: list('a i u'),
    mid: 0.15,
    ends: parts('an:2 in:1 un:1 wan:1'),
  },
  sahel: {
    stems: list('kuma sula fama bala tama wolo sibe kela mori tene daba jala soro kene fara buma loma sewa'),
    mids: list('a e o'),
    mid: 0.15,
    ends: parts('a:3 e:1 o:1 ba:1 la:1'),
  },
};

/** 他人作品里、现实里太有名的西幻名字(拼出来正好撞上就重抽) */
const WESTERN_FAMOUS = new Set(
  'legolas elrond thranduil galadriel celeborn finrod fingolfin feanor turgon glorfindel elendil isildur aragorn arwen gildor haldir earendil ' +
    'julius augustus tiberius hadrian octavian aurelius maximus marcus brutus alaric attila charlemagne harald ragnar sigurd olaf vladimir ' +
    'yaroslav svyatoslav pericles alexander achilles odysseus leonidas themistocles aristides saladin rashid batu kublai temujin ogedei',
);

/** 女名:各语感的词尾(词根、中间音节照男名的用) */
const WESTERN_FEMALE_ENDS: Record<string, Weighted<Part>[]> = {
  imperial: parts('ia:4 ina:2 illa:2 ana:1 iana:1 ella:1 ola:1'),
  kingdom: parts('ena:2 ina:2 ella:2 wen:2 ilda:2 ith:1 is:1 a:1 wyn:1'),
  nordic: parts('hild:3 run:2 dis:2 a:2 gerd:1 frid:1 grid:1'),
  slavic: parts('slava:4 mila:3 na:1 ka:1 ena:1 ra:1'),
  hellenic: parts('ia:3 ippe:1 ea:1 one:1 ene:1 ope:1 isa:1'),
  desert: parts('ida:2 ila:2 ima:2 iya:2 a:1 ah:1 ina:1 ara:1 una:1'),
  steppe: parts('guli:4 ai:1 a:1 ana:1 ra:1 sai:1'),
  elven: parts('iel:2 wen:2 eth:1 ia:2 ith:1 wyn:1 ara:1 rien:1'),
  indic: parts('a:3 i:1 ani:2 vati:1 ini:1'),
  persian: parts('eh:3 ine:2 ana:2 iya:2 yeh:1'),
  nusantara: parts('a:3 i:1 wati:2 ani:1'),
  sahel: parts('ina:3 iya:2 tu:1 we:1 si:1'),
};

/** 女名的译字(盖在各语感的译音表上):中文译女名的习惯 */
const FEMALE_TR: Record<string, string> = {
  ya: '娅',
  na: '娜',
  li: '莉',
  ri: '丽',
  ni: '妮',
  ne: '妮',
  lin: '琳',
  va: '娃',
  vi: '薇',
  we: '薇',
  wen: '雯',
  ma: '玛',
  sa: '莎',
  sha: '莎',
  lu: '露',
  ti: '蒂',
};
/** 个别语感的女名译字(草原 -guli 写"古丽") */
const FEMALE_TR_STYLE: Record<string, Record<string, string>> = {
  steppe: { li: '丽' },
};

/** 他人作品里、现实里太有名的西幻女名 */
const WESTERN_FAMOUS_FEMALE = new Set(
  (
    'galadriel arwen eowyn luthien idril nimrodel celebrian julia livia helena athena medea hera gaia nike olga freya freyja brunhild gudrun ' +
    'sigrun cleopatra zenobia theodora boudica'
  ).split(' '),
);

const VOW = /[aeiouy]/;

/** 两段拼接:元音相撞去掉前一段末尾的元音,辅音挤成一团插一个元音 */
function join(a: string, b: string, link: string): string {
  if (!b) return a;
  const ae = a[a.length - 1];
  const bs = b[0];
  if (VOW.test(ae) && VOW.test(bs)) return a.slice(0, -1) + b;
  const tail = a.match(/[^aeiouy]*$/)![0];
  const head = b.match(/^[^aeiouy]*/)![0];
  if (tail.length + head.length >= 3) return a + link + b;
  return a + b;
}

/** 拼出来的拉丁串像不像人名:三个元音连写、同元音双写、四个辅音连写都不要 */
function latinShapeOk(l: string): boolean {
  if (/[aeiou]{3}/.test(l)) return false;
  if (/(aa|ii|uu|ee|oo|yy)/.test(l)) return false;
  if (/[^aeiouy]{4}/.test(l)) return false;
  return l.length >= 3;
}

function westernPerson(st: WesternPersonStyle, tr: TranscribeOptions, link: string, r: Rng, ends: Weighted<Part>[] = st.ends): string | null {
  let l = pick(r, st.stems).l;
  if (r() < st.mid) l = join(l, pick(r, st.mids).l, link);
  l = join(l, wpick(r, ends).l, link);
  const female = ends !== st.ends;
  if (!latinShapeOk(l) || WESTERN_FAMOUS.has(l) || (female && WESTERN_FAMOUS_FEMALE.has(l)) || latinBlocked(l)) return null;
  let zh = transcribe(l, tr);
  // 女名词尾的 s、th 写"丝"(伊迪丝、托尔迪丝)
  if (female && /(s|th)$/.test(l) && zh.endsWith('斯')) zh = `${zh.slice(0, -1)}丝`;
  const n = [...zh].length;
  // 女名不以"尔"起头(l、r 打头连辅音时译出来的,读着不像名字)
  if (n < 3 || n > 6 || zhBlocked(zh) || (female && zh.startsWith('尔'))) return null;
  return zh;
}

/** 某种语感女名的译音选项(各语感一份,建一次:译音按选项对象记结果) */
const femaleTr = new Map<string, TranscribeOptions>();
function femaleTrOf(styleId: string, tr: TranscribeOptions): TranscribeOptions {
  let o = femaleTr.get(styleId);
  if (!o) femaleTr.set(styleId, (o = { ...tr, table: { ...tr.table, ...FEMALE_TR, ...FEMALE_TR_STYLE[styleId] } }));
  return o;
}

// ---------------------------------------------------------------------------
// 东方:字库组合

interface EasternPersonStyle {
  /** 单姓、复姓(带姓的语感) */
  surnames?: string;
  compound?: string[];
  /** 复姓的机会 */
  compoundChance?: number;
  /** 名:单字名的机会、名的用字 */
  single: number;
  chars: string;
  /** 不带姓的语感:名 = 前字 + 后字(+ 第三字的机会) */
  first?: string;
  third?: number;
  /** 撞上就重抽的现成名字(神话人物等) */
  famous?: string[];
}

const EASTERN_PERSONS: Record<string, EasternPersonStyle> = {
  central: {
    surnames: '李王张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯董萧程曹袁邓许傅沈彭吕苏卢蒋蔡贾魏薛叶阎潘杜戴夏钟汪田任姜范方石姚谭邹熊陆孔白崔康秦江顾侯邵孟段雷钱汤尹易常乔贺丁黎郝龚祁闵卜颜韦骆',
    compound: ['司马', '欧阳', '上官', '慕容', '宇文', '长孙', '独孤', '皇甫', '令狐', '尉迟', '司徒', '拓跋'],
    compoundChance: 0.06,
    single: 0.45,
    chars: '昭恒怀煜晟珩琰瑾璋昱晖熙承弘宏泰康宁靖安定允恪慎谦敬晏曜旻晔炜烨焕桓楷栋渊泓澈涵洵濂浚湛润峻岳崇嵩修仪信俊佑德徽彰显景曦朗明晨昶睿哲彦毅勋骏骥驰鹏翔翊霆霖震鸿晋绍继统绪谟询遥逸远迪琮瑜琛璟钧铉锐镇祁彬翰诚泽梁楠瀚博',
  },
  xianxia: {
    surnames: '沈叶楚萧苏云白洛凌墨顾夜风林温谢江陆宁柳慕司君景燕裴晏冷青离淮秋寒简',
    compound: ['慕容', '南宫', '司空', '东方', '上官', '独孤', '端木', '百里', '闻人', '夏侯'],
    compoundChance: 0.15,
    single: 0.5,
    chars: '玄清尘寒渊霄羽澈墨离辰弦霜夜青冥珏曦霁弈遥衍霆渺沧溟曜烬月星岚雪云风尧泠琅瑶珩璃缈鸾翎昀澜朔予归晚澄',
  },
  frontier: {
    single: 0,
    first: '阿伊苏尉莫贺咄骨吐伏拔达支失毕屈沙钵那罗摩提婆迦耶勒斤颉曷萨乌车鞠纥库独步厍',
    chars: '苾啜利达罗那支伽提斤勒设特毗婆尼斯延陀陵鞬罕密迦拉浑贺禄干',
    third: 0.35,
  },
  mythic: {
    single: 0,
    first: '少太颛帝共祝后伯仲叔季夸句烛应契稷鸿重羲陶皋玄青白赤苍金玉',
    chars: '昊顼喾工融羿益夷父龙芒阴鸿皋陶明光华丘翼鸾桑熊虎鹿辰石羽瑶',
    third: 0,
    famous: ['少昊', '太昊', '帝喾', '共工', '祝融', '后羿', '夸父', '句芒', '烛阴', '伯益', '皋陶', '应龙', '帝俊', '重黎', '太一', '后土'],
  },
  yamato: {
    surnames: '山川森林石高松田原野青藤津浦崎岛',
    compound: ['青木', '石川', '松原', '高山', '川野', '白石', '森川', '津田', '浦野', '山田'],
    compoundChance: 0.35,
    single: 0.2,
    chars: '健勇诚浩翔悠树佑晴朗仁义信忠明辉光宏正和',
  },
  haedong: {
    surnames: '朴韩申洪尹禹安姜崔金李郑赵曹闵成吕',
    single: 0.15,
    chars: '正浩俊民秀贤英哲承宇勇植桓泰勋尚洙晟镐元',
  },
};

/** 这种语感的人名带不带姓。接触语、方言都跟底层,不在这里另判。 */
export function styleSurnamed(styleId: string): boolean {
  return !!EASTERN_PERSONS[styleId]?.surnames;
}

/** 女名(东方;带姓的语感姓照用男名那一张) */
const EASTERN_FEMALE: Record<string, EasternPersonStyle> = {
  central: {
    single: 0.3,
    chars: '婉淑婧嫣妍姝娴瑶琬蘅芷蕙薇萱莹霜凝素柔令仪容宁静婷媛锦绣兰秀玉珠琳琴曼雅慧敏菡茹筠妙宛韵黛绮月贞懿茜珮荷澄秋',
  },
  xianxia: {
    single: 0.3,
    chars: '清雪月灵璃绮萦绾鸢霓汐漪黛弦卿若烟晚歌瑶素芊落紫音霜婳笙璎岚澜棠萝夜晴',
  },
  frontier: {
    single: 0,
    first: '阿伊古帕迪萨娜莎乌塔叶可',
    chars: '丽娜依莎罕兰提雅朵曼姬芙',
    third: 0.3,
  },
  mythic: {
    single: 0,
    first: '女姮宓嫘瑶素青玄白赤金紫',
    chars: '华英姬丹霓鸾凰兰芷桑羽瑶辰',
    third: 0,
    famous: ['女娲', '嫦娥', '羲和', '常羲', '精卫', '瑶姬', '女魃', '宓妃', '娥皇', '女英', '嫘祖', '西王母', '素女', '玄女', '青女'],
  },
  yamato: {
    single: 0.2,
    chars: '美樱奈织葵月花澄香雪叶子慧兰纱',
  },
  haedong: {
    single: 0.15,
    chars: '贤秀英美娜芝兰慧贞淑妍恩雅瑞珠',
  },
};

const chars = (s: string) => [...s];

function easternGiven(st: EasternPersonStyle, r: Rng): string | null {
  let zh: string;
  if (st.first) {
    zh = pick(r, chars(st.first)) + pick(r, chars(st.chars));
    if (r() < (st.third ?? 0)) zh += pick(r, chars(st.chars));
  } else {
    const cs = chars(st.chars);
    zh = pick(r, cs);
    if (r() >= st.single) zh += pick(r, cs);
  }
  const cs = [...zh];
  if (new Set(cs).size !== cs.length) return null;
  if (st.famous?.includes(zh) || zhBlocked(zh)) return null;
  return zh;
}

// ---------------------------------------------------------------------------

/** 32 位整数混合(murmur3 fmix32):把几个整数揉成一个种子 */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 这几个整数键的随机数发生器(use 区分姓 / 名) */
function keyRng(base: number, use: number, key: number[]): Rng {
  let h = fmix((base ^ Math.imul(use + 1, 0x27d4eb2f)) >>> 0);
  for (const k of key) h = fmix((h ^ Math.imul(k | 0, 0x9e3779b1)) >>> 0);
  return mulberry32(h);
}

/** 抽不出合格的名字时(极少见)的兜底 */
const FALLBACK_WEST = '阿尔德';
const FALLBACK_EAST = '昭';
const FALLBACK_WEST_FEMALE = '阿德琳';
const FALLBACK_EAST_FEMALE = '婉';
const TRIES = 60;

/** 有没有这种语感的人名表 */
export function hasPersonStyle(styleId: string): boolean {
  return styleId in WESTERN_PERSONS || styleId in EASTERN_PERSONS;
}

function eastPersonDialect(st: EasternPersonStyle, salt: number, lane = 0): EasternPersonStyle {
  return {
    ...st,
    surnames: st.surnames ? preferChars(st.surnames, salt, lane) : undefined,
    compound: st.compound ? preferSlice(st.compound, salt, lane + 1) : undefined,
    chars: preferChars(st.chars, salt, lane + 2),
    first: st.first ? preferChars(st.first, salt, lane + 3) : undefined,
  };
}

function westPersonDialect(st: WesternPersonStyle, salt: number): WesternPersonStyle {
  return {
    stems: preferSlice(st.stems, salt, 1),
    mids: preferSlice(st.mids, salt, 2),
    mid: st.mid,
    ends: shiftWeights(st.ends, salt, 3),
  };
}

function mixCharPool(sub: string | undefined, sup: string | undefined, salt: number, subRatio: number, lane: number): string | undefined {
  if (!sub && !sup) return undefined;
  if (!sup) return sub;
  if (!sub) return sup;
  const a = preferChars(sub, salt, lane);
  const b = preferChars(sup, salt, lane + 40);
  const n = Math.max(8, [...a].length);
  const nSub = Math.max(2, Math.round(n * subRatio));
  const nSup = Math.max(2, Math.round(n * (1 - subRatio)));
  const take = (s: string, k: number) => {
    const cs = [...s];
    return Array.from({ length: k }, (_, i) => cs[i % cs.length]).join('');
  };
  const trans = transitionalChars(sub, sup, salt, lane, 4);
  return take(a, nSub) + take(b, nSup) + trans + trans;
}

function transitionalChars(sub: string, sup: string, salt: number, lane: number, n: number): string {
  const a = [...sub];
  const b = [...sup];
  let s = '';
  const seen = new Set<string>();
  for (let i = 0; i < n * 3 && s.length < n; i++) {
    const ch = keyed(salt, lane, i) < 0.5 ? a[Math.floor(keyed(salt, lane, i, 1) * a.length)] : b[Math.floor(keyed(salt, lane, i, 2) * b.length)];
    if (!ch || seen.has(ch)) continue;
    seen.add(ch);
    s += ch;
  }
  return s;
}

function eastPersonContact(sub: EasternPersonStyle, sup: EasternPersonStyle, salt: number, lane = 0): EasternPersonStyle {
  const r = 0.65;
  return {
    ...sub,
    surnames: mixCharPool(sub.surnames, sup.surnames, salt, 0.7, lane) ?? sub.surnames,
    compound: sub.compound && sup.compound ? [...preferSlice(sub.compound, salt, lane + 1), ...preferSlice(sup.compound, salt, lane + 41).slice(0, Math.max(1, Math.round(sup.compound.length * 0.3)))] : sub.compound,
    chars: mixCharPool(sub.chars, sup.chars, salt, r, lane + 2) ?? sub.chars,
    first: mixCharPool(sub.first, sup.first, salt, r, lane + 3) ?? sub.first,
    single: sub.single * r + (sup.single ?? sub.single) * (1 - r),
    third: sub.third !== undefined || sup.third !== undefined ? (sub.third ?? 0) * r + (sup.third ?? 0) * (1 - r) : sub.third,
  };
}

function westPersonContact(sub: WesternPersonStyle, sup: WesternPersonStyle, salt: number): WesternPersonStyle {
  const r = 0.6;
  return {
    stems: mixParts(sub.stems, sup.stems, salt, r, 1, true),
    mids: mixParts(sub.mids, sup.mids, salt, 0.7, 2, false),
    mid: sub.mid * r + sup.mid * (1 - r),
    ends: mixWeighted(sub.ends, sup.ends, salt, r, 3, true),
  };
}

/** 某种语感的人名生成器(不认识的语感按"王国"风)。dialect = 分化出来的民族的方言盐,不给或 0 = 母族原样;contact = 接触语 */
export function createPersonNamer(seed: number, styleId: string, dialect?: number, contact?: StyleContact): PersonNamer {
  const tag = contact ? `${styleId}>${contact.style}:${contact.salt}` : styleId;
  const base = subSeed(seed, 'persons:' + tag);
  const east0 = EASTERN_PERSONS[styleId];
  let east = east0 && dialect ? eastPersonDialect(east0, dialect) : east0;
  if (east && contact) {
    const supE = EASTERN_PERSONS[contact.style];
    if (supE) east = eastPersonContact(east, eastPersonDialect(supE, contact.salt, 20), contact.salt);
  }
  if (east) {
    const surnamed = !!east.surnames;
    let female = dialect && EASTERN_FEMALE[styleId] ? eastPersonDialect(EASTERN_FEMALE[styleId], dialect, 11) : EASTERN_FEMALE[styleId];
    if (female && contact) {
      const supF = EASTERN_FEMALE[contact.style] ?? EASTERN_PERSONS[contact.style];
      if (supF) female = eastPersonContact(female, eastPersonDialect(supF, contact.salt, 31), contact.salt, 11);
    }
    return {
      style: styleId,
      family: 'eastern',
      surnamed,
      surname(...key) {
        if (!east.surnames) return '';
        const r = keyRng(base, 0, key);
        if (east.compound && r() < (east.compoundChance ?? 0)) return pick(r, east.compound);
        return pick(r, chars(east.surnames));
      },
      given(...key) {
        const r = keyRng(base, 1, key);
        for (let t = 0; t < TRIES; t++) {
          const g = easternGiven(east, r);
          if (g) return g;
        }
        return FALLBACK_EAST;
      },
      femaleGiven(...key) {
        const r = keyRng(base, 2, key);
        const st = female;
        for (let t = 0; t < TRIES; t++) {
          const g = easternGiven(st, r);
          if (g) return g;
        }
        return FALLBACK_EAST_FEMALE;
      },
    };
  }
  const west0 = WESTERN_PERSONS[styleId] ?? WESTERN_PERSONS.kingdom;
  let west = dialect ? westPersonDialect(west0, dialect) : west0;
  if (contact) {
    const supW = WESTERN_PERSONS[contact.style];
    if (supW) west = westPersonContact(west, westPersonDialect(supW, contact.salt), contact.salt);
  }
  const ws = WESTERN_STYLES.find((s) => s.id === styleId) ?? WESTERN_STYLES.find((s) => s.id === 'kingdom')!;
  const femaleEnds0 = WESTERN_FEMALE_ENDS[styleId] ?? WESTERN_FEMALE_ENDS.kingdom;
  let femaleEnds = dialect ? shiftWeights(femaleEnds0, dialect, 7) : femaleEnds0;
  if (contact) {
    const supFe = WESTERN_FEMALE_ENDS[contact.style] ?? WESTERN_FEMALE_ENDS.kingdom;
    femaleEnds = mixWeighted(femaleEnds, shiftWeights(supFe, contact.salt, 17), contact.salt, 0.6, 7, true);
  }
  return {
    style: styleId,
    family: 'western',
    surnamed: false,
    surname: () => '',
    given(...key) {
      const r = keyRng(base, 1, key);
      for (let t = 0; t < TRIES; t++) {
        const g = westernPerson(west, ws.tr, ws.link, r);
        if (g) return g;
      }
      return FALLBACK_WEST;
    },
    femaleGiven(...key) {
      const r = keyRng(base, 2, key);
      const tr = femaleTrOf(WESTERN_PERSONS[styleId] ? styleId : 'kingdom', ws.tr);
      for (let t = 0; t < TRIES; t++) {
        const g = westernPerson(west, tr, ws.link, r, femaleEnds);
        if (g) return g;
      }
      return FALLBACK_WEST_FEMALE;
    },
  };
}

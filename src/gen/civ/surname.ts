/**
 * 东方中式全名拆姓(人物、名臣、女性人物起名时用;界面、编年史从 story/peopleText.ts 取)。
 * 单独一个小文件:推演只用得到这一样,不用跟着带上称呼、头衔那些文字。
 */
import { isNameToken, nameForm } from './nameToken';

/** 东方中式的全名拆出姓(复姓两个字) */
export function splitSurname(full: string): string {
  if (isNameToken(full)) return nameForm(full, 'n');
  const two = full.slice(0, 2);
  return COMPOUND.has(two) && full.length > 2 ? two : full.slice(0, 1);
}
const COMPOUND = new Set(['司马', '欧阳', '上官', '慕容', '宇文', '长孙', '独孤', '皇甫', '令狐', '尉迟', '南宫', '司空', '东方', '端木', '百里']);

/**
 * 界面上从全名拆姓:比推演用的 splitSurname 多收和风、仙侠、中原里会用到、但起名拆姓时还没收进表里的复姓。
 * 只用于人物卡片等展示,不起名、不改历史。
 */
export function displaySurname(full: string): string {
  if (isNameToken(full)) return nameForm(full, 'n');
  const two = full.slice(0, 2);
  return DISPLAY_COMPOUND.has(two) && full.length > 2 ? two : splitSurname(full);
}

const DISPLAY_COMPOUND = new Set([
  ...COMPOUND,
  '司徒',
  '拓跋',
  '闻人',
  '夏侯',
  '青木',
  '石川',
  '松原',
  '高山',
  '川野',
  '白石',
  '森川',
  '津田',
  '浦野',
  '山田',
]);

/**
 * OpenAI 兼容接口(用户自己填地址、模型名和密钥,浏览器直接调)。
 * OpenAI 官方、各类中转站、自建网关(one-api / new-api)、本地模型(Ollama、vLLM、LM Studio)走的都是这一个协议。
 *
 *   地址:用户填的 Base URL + /chat/completions(归一化见 openaiChatUrl:只填域名补 /v1,尾部斜杠、
 *         直接粘了完整地址都认;本地模型的 http:// 和端口也照收)。空着 = OpenAI 官方。
 *   模型:手填,以服务商的文档为准(界面里给两个 OpenAI 官方的预设,能改成任意名字)
 *   深度思考:不传。OpenAI 用 reasoning_effort,各家兼容实现的写法不一样,乱传会 400;
 *            让需要思考的模型按服务商的默认来(和 DeepSeek 默认关不一样,这里是无为)
 *   json 模式、工具调用、流式、报错:全走 compat.ts 和 DeepSeek / 百炼共用的一套,通用报错规则够用
 *   Azure:路径要带 deployments、认证用 api-key 头,这里接不上 —— 用它的兼容网关
 */
import type { AiProvider } from '../client';
import { AiError } from '../types';
import { DEFAULT_OPENAI_BASE, getAiSettings, getSecrets, settingsForCall } from '../settings';
import { compatChat } from './compat';

/** 界面上的名字,也用在中文报错里 */
export const OPENAI_NAME = 'OpenAI 兼容接口';

/** 缺口令时的说明,status 和 chat 用同一句 */
const NO_KEY = '还没填 OpenAI 兼容接口的密钥:到"AI"设置里填上';
/** 没填模型名时(空着不能用:各家模型名都不一样,猜不出来) */
const NO_MODEL = '还没填模型名:到"AI"设置里填上服务商的模型名';
/** 地址认不出来时 */
const BAD_URL = '填的地址不对:要 http:// 或 https:// 开头的地址';

/** 界面上的模型预设(以服务商的文档为准,也能手填;中转站、本地模型的名字都不是这些) */
export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', note: 'OpenAI 官方:快、便宜' },
  { id: 'gpt-4o', note: 'OpenAI 官方:较准,也更贵' },
];

/**
 * 填的地址 → 真正要请求的 chat/completions 地址。认这几种写法:
 *   https://api.openai.com                    只填协议 + 主机 → 补 /v1
 *   https://api.openai.com/v1/                尾部斜杠
 *   https://api.openai.com/v1/chat/completions  直接粘了完整地址
 *   http://localhost:11434/v1                 本地模型(带端口、用 http 的也照收)
 * 空着 = DEFAULT_OPENAI_BASE。认不出来(不是 http / https、乱七八糟)返回 null。
 */
export function openaiChatUrl(raw: string): string | null {
  let s = (raw || '').trim().replace(/\/+$/, '');
  if (!s) s = DEFAULT_OPENAI_BASE;
  // 只填了域名(api.openai.com)的补上 https://
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  // 路径去掉尾部的 / 和误粘的 /chat/completions;空了(只填了域名)补 /v1
  let path = u.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  if (!path) path = '/v1';
  // 查询串留着(有的网关要 ?api-version=…),拼在最后
  return `${u.origin}${path}/chat/completions${u.search}`;
}

export const openaiProvider: AiProvider = {
  kind: 'openai',
  label: 'OpenAI 兼容',
  status() {
    const s = getAiSettings().openai;
    if (!openaiChatUrl(s.baseUrl)) return { ready: false, model: s.model, reason: BAD_URL };
    if (!getSecrets().openai) return { ready: false, model: s.model, reason: NO_KEY };
    if (!s.model) return { ready: false, model: s.model, reason: NO_MODEL };
    return { ready: true, model: s.model };
  },
  async chat(req, opts) {
    const s = settingsForCall(req.role).openai;
    const url = openaiChatUrl(s.baseUrl);
    const key = getSecrets().openai;
    if (!url) throw new AiError('not-configured', BAD_URL);
    if (!key) throw new AiError('not-configured', NO_KEY);
    if (!s.model) throw new AiError('not-configured', NO_MODEL);
    return compatChat({ name: OPENAI_NAME, url, key, model: s.model }, req, opts);
  },
};

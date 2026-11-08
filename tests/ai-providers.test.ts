/**
 * AI 接入层:流式解析、DeepSeek / 百炼 / OpenAI 兼容三个服务商(全部用假 fetch,不联网)。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SseParser, readSse } from '../src/ai/sse';
import { aiChat, getAiStatus } from '../src/ai/client';
import { chooseProvider, setSecret, updateAiSettings } from '../src/ai/settings';
import { setupAi } from '../src/ai/setup';
import { getCallLog } from '../src/ai/callLog';
import { compatBody, compatChat } from '../src/ai/providers/compat';
import { DEEPSEEK_URL } from '../src/ai/providers/deepseek';
import { BAILIAN_URLS } from '../src/ai/providers/bailian';
import { openaiChatUrl } from '../src/ai/providers/openai';
import { AiError, type AiRequest } from '../src/ai/types';

const KEY = 'sk-test-secret-0123456789';

/** 把字符串按给定的字节块切开,做成一个流(模拟网络上任意位置断开) */
function byteStream(text: string, cut = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(ctl) {
      if (i >= bytes.length) return ctl.close();
      ctl.enqueue(bytes.slice(i, i + cut));
      i += cut;
    },
  });
}

const sseBody = (events: unknown[], done = true) =>
  events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');

const chunk = (content: string, extra: Record<string, unknown> = {}) => ({ id: 'x', model: 'deepseek-flash', choices: [{ index: 0, delta: { content, ...extra } }] });

function sseResponse(body: string, cut = 7) {
  return new Response(byteStream(body, cut), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function errResponse(status: number, error: unknown) {
  return new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: any;
}

/** 装一个假 fetch:记下请求,回 reply 给的 Response */
function fakeFetch(reply: (c: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const c: Captured = {
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return reply(c);
  });
  vi.stubGlobal('fetch', f);
  return calls;
}

const REQ: AiRequest = { feature: '史书', title: '大昌', messages: [{ role: 'user', content: '写一段大昌的兴起' }] };

beforeAll(() => {
  setupAi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SSE 流式解析', () => {
  it('任意位置断开(含 CRLF、注释、多行 data、事件名)都能拼回完整消息', () => {
    const text = ': keep-alive\r\n\r\nevent: delta\r\ndata: {"a":1}\r\n\r\ndata: 第一行\ndata: 第二行\n\nid: 7\ndata: x\n\n';
    const whole = new SseParser();
    const expected = [...whole.push(text), ...whole.end()];
    expect(expected).toEqual([
      { event: 'delta', data: '{"a":1}' },
      { event: 'message', data: '第一行\n第二行' },
      { event: 'message', data: 'x', id: '7' },
    ]);
    for (const step of [1, 2, 3, 5]) {
      const p = new SseParser();
      const got = [];
      for (let i = 0; i < text.length; i += step) got.push(...p.push(text.slice(i, i + step)));
      got.push(...p.end());
      expect(got).toEqual(expected);
    }
  });

  it('汉字的 UTF-8 字节被切开也能拼回;最后一条没有空行收尾也算', async () => {
    const out = [];
    for await (const ev of readSse(byteStream('data: 大昌王朝兴起于碧溪谷\n\ndata: 尾巴', 1))) out.push(ev.data);
    expect(out).toEqual(['大昌王朝兴起于碧溪谷', '尾巴']);
  });
});

describe('DeepSeek(假 fetch)', () => {
  it('只发给 DeepSeek;密钥只在请求头里;流式拼出全文、读出用量;深度思考默认关;思考过程不算正文', async () => {
    setSecret('deepseek', KEY);
    chooseProvider('deepseek');
    const calls = fakeFetch(() =>
      sseResponse(
        sseBody([
          chunk('', { reasoning_content: '先想一想……' }),
          chunk('大昌'),
          chunk('兴于'),
          chunk('碧溪谷。'),
          { id: 'x', choices: [], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } },
        ]),
      ),
    );
    const deltas: string[] = [];
    const r = await aiChat(REQ, { onDelta: (c) => deltas.push(c) });
    expect(r.text).toBe('大昌兴于碧溪谷。');
    expect(deltas.join('')).toBe(r.text);
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(r.provider).toBe('deepseek');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DEEPSEEK_URL);
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].body).toMatchObject({ model: 'deepseek-flash', stream: true, stream_options: { include_usage: true }, thinking: { type: 'disabled' } });
    expect(calls[0].body.response_format).toBeUndefined();
    // 调用记录里有这一条,且哪里都没有密钥
    const rec = getCallLog().calls[0];
    expect(rec.ok).toBe(true);
    expect(rec.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(JSON.stringify(rec)).not.toContain(KEY);
  });

  it('json 模式:带 response_format json_object;提示词里没有 "json" 字样时补一句', () => {
    const b = compatBody({ model: 'm' }, { ...REQ, json: true, temperature: 0.3, maxTokens: 500 });
    expect(b.response_format).toEqual({ type: 'json_object' });
    expect(b.temperature).toBe(0.3);
    expect(b.max_tokens).toBe(500);
    const msgs = b.messages as { role: string; content: string }[];
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/json/i);
    const b2 = compatBody({ model: 'm' }, { feature: 'x', json: true, messages: [{ role: 'user', content: '回一个 JSON' }] });
    expect(b2.messages).toHaveLength(1);
  });

  it('深度思考开着时 thinking.type = enabled', async () => {
    updateAiSettings({ deepseek: { thinking: true } });
    const calls = fakeFetch(() => sseResponse(sseBody([chunk('好')])));
    await aiChat(REQ);
    expect(calls[0].body.thinking).toEqual({ type: 'enabled' });
    updateAiSettings({ deepseek: { thinking: false } });
  });

  it.each([
    [401, { message: `Authentication Fails, Your api key: ${KEY} is invalid`, type: 'authentication_error' }, 'auth'],
    [402, { message: 'Insufficient Balance', type: 'unknown_error' }, 'quota'],
    [429, { message: 'Rate Limit Reached' }, 'rate-limit'],
    [503, { message: 'Server Overloaded' }, 'rate-limit'],
    [500, { message: 'Server Error' }, 'other'],
    [400, { message: 'Model Not Exist', type: 'invalid_request_error' }, 'other'],
    [400, { message: 'Content Exists Risk', type: 'invalid_request_error' }, 'content-filter'],
  ] as const)('HTTP %i → %s(中文说明,不带密钥)', async (status, error, code) => {
    fakeFetch(() => errResponse(status, error));
    const e = (await aiChat(REQ).catch((x) => x)) as AiError;
    expect(e).toBeInstanceOf(AiError);
    expect(e.code).toBe(code);
    expect(e.message).toMatch(/[一-鿿]/);
    expect(e.message).not.toContain(KEY);
    if (code === 'other' && status === 400) expect(e.message).toContain('deepseek-flash');
    if (code === 'content-filter') expect(e.message).toContain('审核');
    const rec = getCallLog().calls[0];
    expect(rec.ok).toBe(false);
    expect(rec.error?.code).toBe(code);
    expect(JSON.stringify(rec)).not.toContain(KEY);
  });

  it('断网 → network;流中途断 → network;取消 → aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(aiChat(REQ)).rejects.toMatchObject({ code: 'network' });

    // 发了两段就断
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const enc = new TextEncoder();
        let n = 0;
        const body = new ReadableStream<Uint8Array>({
          pull(ctl) {
            if (n++ === 0) ctl.enqueue(enc.encode(`data: ${JSON.stringify(chunk('一半'))}\n\n`));
            else ctl.error(new TypeError('network error'));
          },
        });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }),
    );
    await expect(aiChat(REQ)).rejects.toMatchObject({ code: 'network' });

    fakeFetch(() => sseResponse(sseBody([chunk('好')])));
    const ac = new AbortController();
    ac.abort();
    await expect(aiChat(REQ, { signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' });
  });

  it('很久没回应 → network(超时)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(ctl) {
            init.signal?.addEventListener('abort', () => ctl.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }),
    );
    const e = await compatChat({ name: 'DeepSeek', url: DEEPSEEK_URL, key: KEY, model: 'm', idleMs: 30 }, REQ, {}).catch((x) => x);
    expect(e).toMatchObject({ code: 'network' });
    expect(e.message).toContain('没有回应');
  });

  it('流里只有思考、没有正文(到长度上限)→ bad-response,并提示关掉深度思考', async () => {
    fakeFetch(() =>
      sseResponse(sseBody([chunk('', { reasoning_content: '想了很久' }), { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }])),
    );
    const e = (await aiChat(REQ).catch((x) => x)) as AiError;
    expect(e.code).toBe('bad-response');
    expect(e.message).toContain('深度思考');
  });

  it('没填密钥时不发请求,抛 not-configured', async () => {
    setSecret('deepseek', undefined);
    const calls = fakeFetch(() => sseResponse(sseBody([chunk('好')])));
    expect(getAiStatus().ready).toBe(false);
    await expect(aiChat(REQ)).rejects.toMatchObject({ code: 'not-configured' });
    expect(calls).toHaveLength(0);
  });
});

describe('阿里云百炼(假 fetch)', () => {
  it('按地域选地址;流式 + 用量;深度思考开关一律明说(关 = false);json 模式', async () => {
    setSecret('bailian', KEY);
    chooseProvider('bailian');
    updateAiSettings({ bailian: { region: 'intl', model: 'qwen-max' } });
    const calls = fakeFetch(() =>
      sseResponse(
        sseBody([
          { choices: [{ delta: { content: '{"名":', role: 'assistant' }, index: 0 }], model: 'qwen-max' },
          { choices: [{ delta: { content: '"碧溪"}' }, index: 0, finish_reason: 'stop' }], model: 'qwen-max' },
          { choices: [], usage: { prompt_tokens: 30, completion_tokens: 6, total_tokens: 36 } },
        ]),
        5,
      ),
    );
    const r = await aiChat({ ...REQ, json: true });
    expect(JSON.parse(r.text)).toEqual({ 名: '碧溪' });
    expect(r.usage).toEqual({ inputTokens: 30, outputTokens: 6 });
    expect(r.model).toBe('qwen-max');
    expect(calls[0].url).toBe(BAILIAN_URLS.intl);
    expect(calls[0].body.response_format).toEqual({ type: 'json_object' });
    // 新一代模型不传就默认思考:关着时也要明说 false
    expect(calls[0].body.enable_thinking).toBe(false);
    expect(calls[0].body.model).toBe('qwen-max');

    updateAiSettings({ bailian: { region: 'cn', thinking: true } });
    const calls2 = fakeFetch(() => sseResponse(sseBody([chunk('好')])));
    await aiChat(REQ);
    expect(calls2[0].url).toBe(BAILIAN_URLS.cn);
    expect(calls2[0].body.enable_thinking).toBe(true);
    // json 模式时不开思考(思考模式不支持结构化输出)
    const calls3 = fakeFetch(() => sseResponse(sseBody([chunk('{}')])));
    await aiChat({ ...REQ, json: true });
    expect(calls3[0].body.enable_thinking).toBe(false);
    updateAiSettings({ bailian: { thinking: false, model: 'qwen-plus' } });
  });

  it.each([
    [401, { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' }, 'auth', '地域'],
    [400, { message: 'Access denied, please make sure your account is in good standing.', code: 'Arrearage' }, 'quota', '欠费'],
    [403, { message: 'The free tier of the model has been exhausted.', code: 'AllocationQuota.FreeTierOnly' }, 'quota', '免费额度'],
    [400, { message: 'Input data may contain inappropriate content.', code: 'data_inspection_failed' }, 'content-filter', '审核'],
    [429, { message: 'Requests rate limit exceeded', code: 'Throttling' }, 'rate-limit', '限流'],
    [404, { message: 'The model `qwen-xxx` does not exist', code: 'model_not_found' }, 'other', '模型'],
  ] as const)('HTTP %i %o → %s', async (status, error, code, word) => {
    fakeFetch(() => errResponse(status, error));
    const e = (await aiChat(REQ).catch((x) => x)) as AiError;
    expect(e.code).toBe(code);
    expect(e.message).toContain(word);
  });

  it('报错里百炼附带的 "For details, see: 链接" 去掉(实测 401 就带这一句)', async () => {
    fakeFetch(() =>
      errResponse(401, { message: 'Incorrect API key provided. For details, see: https://help.aliyun.com/zh/model-studio/error-code#apikey-error', code: 'invalid_api_key' }),
    );
    const e = (await aiChat(REQ).catch((x) => x)) as AiError;
    expect(e.message).toContain('Incorrect API key provided.');
    expect(e.message).not.toContain('https://');
  });

  it('流中途返回错误对象 → 按错误码翻译', async () => {
    fakeFetch(() => sseResponse(sseBody([chunk('一'), { error: { code: 'DataInspectionFailed', message: 'Output data may contain inappropriate content.' } }], false)));
    await expect(aiChat(REQ)).rejects.toMatchObject({ code: 'content-filter', message: expect.stringContaining('拦下了 AI 写出来的内容') });
  });
});

describe('OpenAI 兼容(自己填地址,假 fetch)', () => {
  it('地址归一化:只填域名补 /v1、尾部斜杠、完整地址、本地模型,认不出来返回 null', () => {
    expect(openaiChatUrl('')).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiChatUrl('https://api.openai.com')).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiChatUrl('api.openai.com')).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiChatUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiChatUrl('https://api.openai.com/v1/chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiChatUrl('https://gw.example.com/openai/v1')).toBe('https://gw.example.com/openai/v1/chat/completions');
    expect(openaiChatUrl('http://localhost:11434')).toBe('http://localhost:11434/v1/chat/completions');
    expect(openaiChatUrl('ftp://x')).toBeNull();
  });

  it('只发给填的地址;密钥只在请求头里;模型名原样;不传思考开关;流式拼出全文', async () => {
    setSecret('openai', KEY);
    chooseProvider('openai');
    updateAiSettings({ openai: { baseUrl: 'https://gw.example.com/v1', model: 'my-model' } });
    const calls = fakeFetch(() => sseResponse(sseBody([
        { id: 'x', model: 'my-model', choices: [{ index: 0, delta: { content: '大昌' } }] },
        { id: 'x', model: 'my-model', choices: [{ index: 0, delta: { content: '兴于碧溪谷。' } }] },
        { id: 'x', choices: [], usage: { prompt_tokens: 9, completion_tokens: 5 } },
      ])));
    const r = await aiChat(REQ);
    expect(r.text).toBe('大昌兴于碧溪谷。');
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('my-model');
    expect(r.usage).toEqual({ inputTokens: 9, outputTokens: 5 });
    expect(calls[0].url).toBe('https://gw.example.com/v1/chat/completions');
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].body).toMatchObject({ model: 'my-model', stream: true, stream_options: { include_usage: true } });
    expect(calls[0].body.thinking).toBeUndefined();
    expect(JSON.stringify(getCallLog().calls[0])).not.toContain(KEY);
  });

  it('没填密钥 / 没填模型名 / 地址不对:不可用,中文说明;调用直接失败', async () => {
    chooseProvider('openai');
    updateAiSettings({ openai: { baseUrl: 'https://gw.example.com/v1', model: 'my-model' } });
    setSecret('openai', undefined);
    expect(getAiStatus()).toMatchObject({ ready: false, reason: expect.stringContaining('密钥') });

    setSecret('openai', KEY);
    updateAiSettings({ openai: { model: '' } });
    fakeFetch(() => sseResponse(sseBody([chunk('x')])));
    await expect(aiChat(REQ)).rejects.toMatchObject({ code: 'not-configured', message: expect.stringContaining('模型名') });

    updateAiSettings({ openai: { model: 'my-model', baseUrl: 'ftp://x' } });
    expect(getAiStatus().reason).toContain('地址');
    await expect(aiChat(REQ)).rejects.toMatchObject({ code: 'not-configured' });
  });

  it('密钥不对(401)→ auth,中文说明', async () => {
    setSecret('openai', KEY);
    chooseProvider('openai');
    updateAiSettings({ openai: { baseUrl: 'https://gw.example.com/v1', model: 'my-model' } });
    fakeFetch(() => errResponse(401, { message: `Incorrect API key provided: ${KEY}`, code: 'invalid_api_key' }));
    const e = (await aiChat(REQ).catch((x) => x)) as AiError;
    expect(e.code).toBe('auth');
    expect(e.message).toContain('OpenAI 兼容接口');
    expect(e.message).not.toContain(KEY);
  });
});


describe('工具调用(助手用,假 fetch)', () => {
  const TOOLS: AiRequest['tools'] = [
    { name: 'country', description: '查一个国家', parameters: { type: 'object', properties: { country: { type: 'string' } }, required: ['country'] } },
    { name: 'situation', description: '查某一年的格局', parameters: { type: 'object', properties: { year: { type: 'integer' } } } },
  ];
  /** 第二轮的请求:模型上一轮调了工具,结果交回去 */
  const ROUND2: AiRequest = {
    feature: '助手',
    messages: [
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '大昌后来怎么样了' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_a', name: 'country', args: '{"country":"P3"}' }] },
      { role: 'tool', toolCallId: 'call_a', content: 'P3 大昌王朝 · 第 812—3000 年' },
    ],
    tools: TOOLS,
    toolChoice: 'auto',
  };
  /** 一个工具调用拆成好几段送来(两个调用交错) */
  const toolChunk = (calls: unknown[], finish?: string) => ({ id: 'x', model: 'deepseek-flash', choices: [{ index: 0, delta: { tool_calls: calls }, ...(finish ? { finish_reason: finish } : {}) }] });

  it('DeepSeek:请求里带 tools、tool_choice,交回的消息按 OpenAI 写法;分段送来的调用拼回完整;深度思考开着也关掉', async () => {
    setSecret('deepseek', KEY);
    chooseProvider('deepseek');
    updateAiSettings({ deepseek: { thinking: true } });
    const calls = fakeFetch(() =>
      sseResponse(
        sseBody([
          toolChunk([{ index: 0, id: 'call_1', type: 'function', function: { name: 'country', arguments: '' } }]),
          toolChunk([{ index: 0, function: { arguments: '{"coun' } }]),
          toolChunk([{ index: 1, id: 'call_2', type: 'function', function: { name: 'situation', arguments: '{"year":' } }]),
          toolChunk([{ index: 0, function: { arguments: 'try":"P5"}' } }]),
          toolChunk([{ index: 1, function: { arguments: '2850}' } }], 'tool_calls'),
          { id: 'x', choices: [], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } },
        ]),
        9,
      ),
    );
    const r = await aiChat(ROUND2);
    expect(r.text).toBe('');
    expect(r.toolCalls).toEqual([
      { id: 'call_1', name: 'country', args: '{"country":"P5"}' },
      { id: 'call_2', name: 'situation', args: '{"year":2850}' },
    ]);
    const body = calls[0].body;
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.tool_choice).toBe('auto');
    expect(body.tools).toEqual(TOOLS!.map((t) => ({ type: 'function', function: t })));
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'country', arguments: '{"country":"P3"}' } }],
    });
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_a', content: 'P3 大昌王朝 · 第 812—3000 年' });
    // 调用记录里记下了模型要调用的工具
    expect(getCallLog().calls[0].toolCalls).toEqual(r.toolCalls);
    // 没带工具的请求照旧按设置开深度思考
    const calls2 = fakeFetch(() => sseResponse(sseBody([chunk('好')])));
    await aiChat(REQ);
    expect(calls2[0].body.thinking).toEqual({ type: 'enabled' });
    expect(calls2[0].body.tools).toBeUndefined();
    updateAiSettings({ deepseek: { thinking: false } });
  });

  it('百炼:带工具时不开深度思考;只回工具调用、没有正文不算出错', async () => {
    setSecret('bailian', KEY);
    chooseProvider('bailian');
    updateAiSettings({ bailian: { thinking: true } });
    const calls = fakeFetch(() =>
      sseResponse(
        sseBody([
          { choices: [{ index: 0, delta: { role: 'assistant', content: '我先查一下。' } }], model: 'qwen-plus' },
          { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_q', type: 'function', function: { name: 'country', arguments: '{"country":"P3"}' } }] }, finish_reason: 'tool_calls' }] },
        ]),
      ),
    );
    const r = await aiChat({ ...ROUND2, toolChoice: 'none' });
    expect(calls[0].body.enable_thinking).toBe(false);
    expect(calls[0].body.tool_choice).toBe('none');
    expect(r.text).toBe('我先查一下。');
    expect(r.toolCalls).toEqual([{ id: 'call_q', name: 'country', args: '{"country":"P3"}' }]);
    updateAiSettings({ bailian: { thinking: false } });
  });

  it('交回工具结果以后正常收尾、不说话:不算出错(由助手循环判断);没有工具结果的照旧算空回复', async () => {
    setSecret('deepseek', KEY);
    chooseProvider('deepseek');
    const end = [{ id: 'x', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }];
    fakeFetch(() => sseResponse(sseBody(end)));
    expect((await aiChat(ROUND2)).text).toBe('');
    fakeFetch(() => sseResponse(sseBody(end)));
    const e = (await aiChat({ ...ROUND2, messages: ROUND2.messages.slice(0, 2) }).catch((x) => x)) as AiError;
    expect(e.code).toBe('bad-response');
  });

  it('OpenAI 兼容:tools、tool_choice、带工具调用的消息原样发出去;读回 tool_calls;不传思考字段', async () => {
    setSecret('openai', KEY);
    chooseProvider('openai');
    updateAiSettings({ openai: { baseUrl: 'https://gw.example.com/v1/', model: 'my-model' } });
    const calls = fakeFetch(() =>
      sseResponse(
        sseBody([
          { id: 'x', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'country', arguments: '{"country":"P3"}' } }] } }] },
          { id: 'x', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ]),
      ),
    );
    const r = await aiChat({ ...ROUND2, messages: ROUND2.messages.slice(0, 2) });
    expect(r.toolCalls).toEqual([{ id: 'call_a', name: 'country', args: '{"country":"P3"}' }]);
    expect(calls[0].url).toBe('https://gw.example.com/v1/chat/completions');
    expect(calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].body).toMatchObject({ model: 'my-model', stream: true });
    expect(calls[0].body.tools).toEqual(TOOLS!.map((t) => ({ type: 'function', function: t })));
    expect(calls[0].body.tool_choice).toBe('auto');
    // 不传思考开关:各家兼容实现的写法不一样,乱传会 400
    expect(calls[0].body.thinking).toBeUndefined();
    expect(calls[0].body.enable_thinking).toBeUndefined();

    const calls2 = fakeFetch(() => sseResponse(sseBody([chunk('好的')])));
    const r2 = await aiChat(ROUND2);
    expect(r2.text).toBe('好的');
    expect(calls2[0].body.messages[2].tool_calls[0]).toEqual({ id: 'call_a', type: 'function', function: { name: 'country', arguments: '{"country":"P3"}' } });
    expect(calls2[0].body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_a', content: 'P3 大昌王朝 · 第 812—3000 年' });
  });
});

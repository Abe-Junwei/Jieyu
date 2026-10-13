#!/usr/bin/env node
/**
 * R1 fixture 录制（用户本机运行，用自己的 key）。key 只从环境变量读，不落盘。
 * Records raw SSE for the ToolLoopAgent pilot: 6 provider configs × approve / reject / interrupt.
 * Output: tests/fixtures/ai-runtime/<config>.<scenario>.json (redacted, synthetic prompt only).
 * DeepSeek: config id deepseek-chat sends model deepseek-flash; deepseek-reasoner uses
 * DEEPSEEK_REASONER_MODEL (default deepseek-reasoner). If reasoner 404s, try the current
 * thinking model from DeepSeek docs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'tests/fixtures/ai-runtime');
const PROMPT = '在当前项目里先搜索包含 "kata" 的句段，再列出所有层，然后删除句段 seg_demo_1。';
const TOOLS = [
  { name: 'search_segments', description: '搜索句段', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'list_layers', description: '列出层', parameters: { type: 'object', properties: {} } },
  { name: 'delete_transcription_segment', description: '删除句段（需用户确认）', parameters: { type: 'object', properties: { segmentId: { type: 'string' } }, required: ['segmentId'] } },
];

const CONFIGS = [
  { id: 'deepseek-chat', kind: 'openai', env: 'DEEPSEEK_API_KEY', base: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', model: 'deepseek-flash' },
  { id: 'deepseek-reasoner', kind: 'openai', env: 'DEEPSEEK_API_KEY', base: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', model: process.env.DEEPSEEK_REASONER_MODEL ?? 'deepseek-reasoner' },
  { id: 'qwen-thinking-on', kind: 'openai', env: 'DASHSCOPE_API_KEY', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: process.env.QWEN_MODEL ?? 'qwen-plus', extra: { enable_thinking: true } },
  { id: 'qwen-thinking-off', kind: 'openai', env: 'DASHSCOPE_API_KEY', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: process.env.QWEN_MODEL ?? 'qwen-plus', extra: { enable_thinking: false } },
  { id: 'minimax', kind: 'openai', env: 'MINIMAX_API_KEY', base: process.env.MINIMAX_BASE_URL ?? 'https://api.minimaxi.com/v1', model: process.env.MINIMAX_MODEL ?? 'MiniMax-M2' },
  { id: 'anthropic', kind: 'anthropic', env: 'ANTHROPIC_API_KEY', base: 'https://api.anthropic.com/v1', model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5' },
];

const only = process.argv.slice(2);
const secrets = CONFIGS.map((c) => process.env[c.env]).filter(Boolean);
const redact = (s) => {
  let out = s;
  for (const k of secrets) out = out.split(k).join('[REDACTED_KEY]');
  return out.replace(/(sk-|sk-ant-)[A-Za-z0-9_-]{8,}/g, '[REDACTED_KEY]');
};

function buildRequest(c, messages) {
  if (c.kind === 'anthropic') {
    return {
      url: `${c.base}/messages`,
      headers: { 'x-api-key': process.env[c.env], 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: { model: c.model, max_tokens: 1024, stream: true, messages, tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) },
    };
  }
  return {
    url: `${c.base}/chat/completions`,
    headers: { Authorization: `Bearer ${process.env[c.env]}`, 'content-type': 'application/json' },
    body: { model: c.model, stream: true, messages, tools: TOOLS.map((t) => ({ type: 'function', function: t })), ...(c.extra ?? {}) },
  };
}

async function stream(c, messages, abortAfterBytes) {
  const req = buildRequest(c, messages);
  const ac = new AbortController();
  const started = Date.now();
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: ac.signal });
  if (!res.ok) {
    // 非 2xx 直接失败，不写 fixture | non-2xx: fail loudly, no fixture
    const text = await res.text().catch(() => '');
    let msg = text;
    try { const j = JSON.parse(text); msg = j?.error?.message ?? j?.message ?? text; } catch { /* keep raw text */ }
    throw new Error(`HTTP ${res.status}: ${String(msg).slice(0, 500) || res.statusText}`);
  }
  let raw = '';
  let aborted = false;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += dec.decode(value, { stream: true });
      if (abortAfterBytes && raw.length >= abortAfterBytes) { aborted = true; ac.abort(); break; }
    }
  } catch (e) { if (!aborted) throw e; }
  return { request: { url: req.url, body: req.body }, status: res.status, elapsedMs: Date.now() - started, aborted, sse: raw };
}

/** 从 SSE 里取出第一个工具调用（只用于构造第二轮）| first tool call, for the follow-up turn */
function firstToolCall(c, sse) {
  const lines = sse.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter((l) => l && l !== '[DONE]');
  let id = null, name = null, args = '';
  for (const l of lines) {
    let j; try { j = JSON.parse(l); } catch { continue; }
    if (c.kind === 'anthropic') {
      if (j.type === 'content_block_start' && j.content_block?.type === 'tool_use' && !id) { id = j.content_block.id; name = j.content_block.name; }
      if (j.type === 'content_block_delta' && j.delta?.type === 'input_json_delta' && id) args += j.delta.partial_json;
    } else {
      const tc = j.choices?.[0]?.delta?.tool_calls?.[0];
      if (tc) { id ??= tc.id; name ??= tc.function?.name; args += tc.function?.arguments ?? ''; }
    }
  }
  return id ? { id, name, args: args || '{}' } : null;
}

function followUp(c, call, approved) {
  const result = approved ? JSON.stringify({ ok: true }) : JSON.stringify({ denied: true, reason: '用户拒绝' });
  if (c.kind === 'anthropic') {
    return [
      { role: 'user', content: PROMPT },
      { role: 'assistant', content: [{ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.args || '{}') }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: result }] },
    ];
  }
  return [
    { role: 'user', content: PROMPT },
    { role: 'assistant', content: null, tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: call.args } }] },
    { role: 'tool', tool_call_id: call.id, content: result },
  ];
}

let failures = 0;
mkdirSync(OUT, { recursive: true });
for (const c of CONFIGS) {
  if (only.length && !only.includes(c.id)) continue;
  if (!process.env[c.env]) { console.log(`跳过 ${c.id}：未设置 ${c.env}`); continue; }
  for (const scenario of ['approve', 'reject', 'interrupt']) {
    try {
      const turns = [];
      const t1 = await stream(c, [{ role: 'user', content: PROMPT }], scenario === 'interrupt' ? 400 : 0);
      turns.push(t1);
      if (scenario !== 'interrupt') {
        const call = firstToolCall(c, t1.sse);
        if (call) turns.push(await stream(c, followUp(c, call, scenario === 'approve'), 0));
      }
      const file = join(OUT, `${c.id}.${scenario}.json`);
      writeFileSync(file, redact(JSON.stringify({ config: c.id, model: c.model, scenario, recordedAt: new Date().toISOString(), turns }, null, 2)));
      console.log(`✓ ${file}（${turns.map((t) => `${t.status}/${t.elapsedMs}ms`).join(', ')}）`);
    } catch (e) {
      failures += 1;
      console.error(`✗ 失败 FAILED ${c.id}.${scenario}: ${redact(String(e?.message ?? e))}`);
    }
  }
}
if (failures) {
  console.error(`✗ ${failures} 个录制失败，未写入对应 fixture | ${failures} recording(s) failed`);
  process.exit(1);
}

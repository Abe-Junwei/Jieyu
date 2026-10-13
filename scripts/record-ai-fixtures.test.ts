import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('record-ai-fixtures', () => {
  it('fails loudly on non-2xx, writes no fixture, exits non-zero', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Authentication Fails (bad key)' } }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as { port: number };
    const cwd = mkdtempSync(join(tmpdir(), 'fixrec-'));
    const script = resolve(__dirname, 'record-ai-fixtures.mjs');
    const out = await new Promise<{ status: number | null; stderr: string; stdout: string }>((res) => {
      {
        const p = spawn(process.execPath, [script, 'deepseek-chat'], {
          cwd,
          env: { ...process.env, DEEPSEEK_API_KEY: 'sk-testtesttest', DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}` },
        });
        let stdout = '', stderr = '';
        p.stdout.on('data', (d) => (stdout += d));
        p.stderr.on('data', (d) => (stderr += d));
        p.on('close', (status) => res({ status, stdout, stderr }));
      }
    });
    server.close();
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('HTTP 401');
    expect(out.stderr).toContain('Authentication Fails');
    expect(out.stdout).not.toContain('✓');
    expect(existsSync(join(cwd, 'tests/fixtures/ai-runtime/deepseek-chat.approve.json'))).toBe(false);
  }, 20000);
});

describe('firstToolCall / followUp reasoning_content', () => {
  it('echoes accumulated reasoning_content on OpenAI-compatible follow-up', async () => {
    const { firstToolCall, followUp } = await import('./record-ai-fixtures.mjs');
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":"一下","tool_calls":[{"id":"call_1","type":"function","function":{"name":"list_layers","arguments":""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}"}}]}}]}',
      'data: [DONE]',
      '',
    ].join('\n');
    const call = firstToolCall({ kind: 'openai' }, sse);
    expect(call).toMatchObject({ id: 'call_1', name: 'list_layers', args: '{}', reasoning: '先想一下' });
    const messages = followUp({ kind: 'openai' }, call, true);
    const assistant = messages.find((m: { role: string }) => m.role === 'assistant') as {
      reasoning_content?: string;
      tool_calls?: unknown[];
    };
    expect(assistant.reasoning_content).toBe('先想一下');
    expect(assistant.tool_calls).toHaveLength(1);
  });
});

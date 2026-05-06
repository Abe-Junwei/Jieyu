import { describe, expect, it, afterEach } from 'vitest';
import { McpServer } from './McpServer';

const TEST_TOKEN = 'jieyu-readonly-test-token-12345';

async function fetchSse(server: McpServer): Promise<{ sessionId: string; response: Response; reader: ReadableStreamDefaultReader<Uint8Array> }> {
  const res = await fetch(`http://localhost:${server.listenPort}/sse`, {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  // Read endpoint event
  let buffer = '';
  let sessionId = '';
  while (!sessionId) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/event: endpoint\ndata: \/messages\?sessionId=([^\s]+)/);
    if (match) {
      sessionId = match[1]!;
    }
  }

  expect(sessionId).toBeTruthy();
  return { sessionId, response: res, reader };
}

async function postMessage(
  server: McpServer,
  sessionId: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return fetch(`http://localhost:${server.listenPort}/messages?sessionId=${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? TEST_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

describe('McpServer', () => {
  let server: McpServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
      // Allow TCP connections to drain before next test to avoid fetch keep-alive reuse issues.
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  it('starts on a free port', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    expect(server.listenPort).toBeGreaterThan(0);
  });

  it('rejects SSE without token', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const res = await fetch(`http://localhost:${server.listenPort}/sse`);
    expect(res.status).toBe(401);
  });

  it('rejects SSE with wrong token', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const res = await fetch(`http://localhost:${server.listenPort}/sse`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns tools/list via SSE', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const { sessionId, reader } = await fetchSse(server);

    const postRes = await postMessage(server, sessionId, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(postRes.status).toBe(202);

    // Read response from SSE stream
    const decoder = new TextDecoder();
    let buffer = '';
    let foundResult = false;
    const timeoutMs = 3000;
    const start = Date.now();

    while (!foundResult && Date.now() - start < timeoutMs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const dataMatch = block.match(/event: message\ndata: (.+)/s);
        if (dataMatch) {
          const msg = JSON.parse(dataMatch[1]!);
          if (msg.result?.tools) {
            foundResult = true;
            expect(msg.result.tools).toHaveLength(3);
            const names = msg.result.tools.map((t: { name: string }) => t.name);
            expect(names).toContain('jieyu_list_segments');
            expect(names).toContain('jieyu_get_segment_detail');
            expect(names).toContain('jieyu_diagnose_quality');
          }
        }
      }
    }
    expect(foundResult).toBe(true);
  });

  it('calls jieyu_list_segments and returns segments', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const { sessionId, reader } = await fetchSse(server);

    const postRes = await postMessage(server, sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'jieyu_list_segments', arguments: { limit: 2 } },
    });
    expect(postRes.status).toBe(202);

    const decoder = new TextDecoder();
    let buffer = '';
    let foundResult = false;
    const timeoutMs = 3000;
    const start = Date.now();

    while (!foundResult && Date.now() - start < timeoutMs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const dataMatch = block.match(/event: message\ndata: (.+)/s);
        if (dataMatch) {
          const msg = JSON.parse(dataMatch[1]!);
          if (msg.result?.content) {
            foundResult = true;
            const text = msg.result.content[0].text;
            const parsed = JSON.parse(text);
            expect(parsed.segments).toHaveLength(2);
            expect(parsed.total).toBe(1000);
          }
        }
      }
    }
    expect(foundResult).toBe(true);
  });

  it('calls jieyu_get_segment_detail and returns detail', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const { sessionId, reader } = await fetchSse(server);

    const postRes = await postMessage(server, sessionId, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'jieyu_get_segment_detail', arguments: { segmentId: 'seg-001' } },
    });
    expect(postRes.status).toBe(202);

    const decoder = new TextDecoder();
    let buffer = '';
    let foundResult = false;
    const timeoutMs = 3000;
    const start = Date.now();

    while (!foundResult && Date.now() - start < timeoutMs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const dataMatch = block.match(/event: message\ndata: (.+)/s);
        if (dataMatch) {
          const msg = JSON.parse(dataMatch[1]!);
          if (msg.result?.content) {
            foundResult = true;
            const text = msg.result.content[0].text;
            const parsed = JSON.parse(text);
            expect(parsed.id).toBe('seg-001');
            expect(parsed.layers).toBeInstanceOf(Array);
          }
        }
      }
    }
    expect(foundResult).toBe(true);
  });

  it('calls jieyu_diagnose_quality and returns diagnosis', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const { sessionId, reader } = await fetchSse(server);

    const postRes = await postMessage(server, sessionId, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'jieyu_diagnose_quality', arguments: { scope: 'project' } },
    });
    expect(postRes.status).toBe(202);

    const decoder = new TextDecoder();
    let buffer = '';
    let foundResult = false;
    const timeoutMs = 3000;
    const start = Date.now();

    while (!foundResult && Date.now() - start < timeoutMs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const dataMatch = block.match(/event: message\ndata: (.+)/s);
        if (dataMatch) {
          const msg = JSON.parse(dataMatch[1]!);
          if (msg.result?.content) {
            foundResult = true;
            const text = msg.result.content[0].text;
            const parsed = JSON.parse(text);
            expect(parsed.scope).toBe('project');
            expect(parsed.summary.totalSegments).toBe(1000);
          }
        }
      }
    }
    expect(foundResult).toBe(true);
  });

  it('rejects write-oriented methods with not_supported', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const { sessionId, reader } = await fetchSse(server);

    const postRes = await postMessage(server, sessionId, {
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/create',
      params: {},
    });
    expect(postRes.status).toBe(202);

    const decoder = new TextDecoder();
    let buffer = '';
    let foundError = false;
    const timeoutMs = 3000;
    const start = Date.now();

    while (!foundError && Date.now() - start < timeoutMs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const dataMatch = block.match(/event: message\ndata: (.+)/s);
        if (dataMatch) {
          const msg = JSON.parse(dataMatch[1]!);
          if (msg.error) {
            foundError = true;
            expect(msg.error.code).toBe(-32002);
            expect(msg.error.message).toContain('not_supported');
            expect(msg.error.message).toContain('read-only');
          }
        }
      }
    }
    expect(foundError).toBe(true);
  });

  it('returns 404 for unknown path', async () => {
    server = new McpServer({ token: TEST_TOKEN });
    await server.start();
    const res = await fetch(`http://localhost:${server.listenPort}/unknown`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });
});

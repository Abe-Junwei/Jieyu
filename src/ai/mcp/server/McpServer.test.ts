import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';

const { persistMcpMock } = vi.hoisted(() => ({
  persistMcpMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./mcpToolCallAudit', () => ({
  persistMcpToolCallAudit: persistMcpMock,
}));

import { isMcpLoopbackRemoteAddress, McpServer } from './McpServer';
import type { PersistMcpToolCallAuditInput } from './mcpToolCallAudit';
import { TOOL_HANDLERS } from './tools';
import * as segmentReadQueries from '../../queries/segmentReadQueries';

vi.mock('../../queries/segmentReadQueries', () => ({
  listSegmentSummaries: vi.fn(),
  getSegmentDetail: vi.fn(),
  diagnoseProjectQuality: vi.fn(),
}));

const mockedList = vi.mocked(segmentReadQueries.listSegmentSummaries);
const mockedDetail = vi.mocked(segmentReadQueries.getSegmentDetail);
const mockedDiagnose = vi.mocked(segmentReadQueries.diagnoseProjectQuality);

const TEST_TOKEN = 'jieyu-readonly-test-token-12345';
/** MCP read tools require non-empty runtime scope (textId / currentMediaId / currentLayerId). */
const MCP_TEST_RUNTIME_CONTEXT = { textId: 'mcp-integration-test-text' };

type RouteMethodRequest = { jsonrpc: '2.0'; id: number; method: string; params?: unknown };
type RouteMethodResponse = { error?: { code: number; message: string }; result?: unknown };

function routeServerMethod(server: McpServer, request: RouteMethodRequest): Promise<RouteMethodResponse> {
  return (server as unknown as { routeMethod(req: RouteMethodRequest): Promise<RouteMethodResponse> }).routeMethod(request);
}

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('treats non-loopback remote addresses as forbidden for messages', () => {
    expect(isMcpLoopbackRemoteAddress('127.0.0.1')).toBe(true);
    expect(isMcpLoopbackRemoteAddress('::1')).toBe(true);
    expect(isMcpLoopbackRemoteAddress('192.168.1.20')).toBe(false);
    expect(isMcpLoopbackRemoteAddress(undefined)).toBe(false);
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
    mockedList.mockResolvedValue({
      segments: [
        { id: 'seg-001', kind: 'segment', layerId: 'layer-1', startTime: 0, endTime: 4.999, transcription: 'hello' },
        { id: 'seg-002', kind: 'segment', layerId: 'layer-1', startTime: 5, endTime: 9.999, transcription: 'world' },
      ],
      total: 2,
    });

    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });
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
            expect(parsed.total).toBe(2);
          }
        }
      }
    }
    expect(foundResult).toBe(true);
    expect(persistMcpMock).toHaveBeenCalled();
    const listAudit = persistMcpMock.mock.calls
      .map((c) => c[0] as PersistMcpToolCallAuditInput)
      .find((a) => a.toolName === 'jieyu_list_segments' && a.outcome === 'success');
    expect(listAudit).toBeDefined();
    expect(listAudit!.arguments).toEqual(expect.objectContaining({ limit: 2 }));
    expect(listAudit!.runtimeContext).toEqual(
      expect.objectContaining({ textId: MCP_TEST_RUNTIME_CONTEXT.textId }),
    );
  });

  it('persists tool_not_found audit for unknown tools/call name', async () => {
    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });
    await server.start();
    const { sessionId, reader } = await fetchSse(server);

    const postRes = await postMessage(server, sessionId, {
      jsonrpc: '2.0',
      id: 91,
      method: 'tools/call',
      params: { name: 'jieyu_nonexistent_tool', arguments: { k: 'v' } },
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
            expect(msg.error.code).toBe(-32601);
          }
        }
      }
    }
    expect(foundError).toBe(true);
    expect(persistMcpMock).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'tool_not_found',
      toolName: 'jieyu_nonexistent_tool',
    }));
  });

  it('rejects tools/call limit above maximum before execution', async () => {
    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });

    const response = await routeServerMethod(server, {
      jsonrpc: '2.0',
      id: 92,
      method: 'tools/call',
      params: { name: 'jieyu_list_segments', arguments: { limit: 101 } },
    });

    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('limit exceeds maximum of 100');
    expect(mockedList).not.toHaveBeenCalled();
    expect(persistMcpMock).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'validation_error',
      toolName: 'jieyu_list_segments',
    }));
  });

  it('rejects tools/call offset above maximum before execution', async () => {
    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });

    const response = await routeServerMethod(server, {
      jsonrpc: '2.0',
      id: 93,
      method: 'tools/call',
      params: { name: 'jieyu_list_segments', arguments: { offset: 1001 } },
    });

    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('offset exceeds maximum of 1000');
    expect(mockedList).not.toHaveBeenCalled();
    expect(persistMcpMock).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'validation_error',
      toolName: 'jieyu_list_segments',
    }));
  });

  it('returns timeout error and audit outcome when a tool call exceeds 30s', async () => {
    vi.useFakeTimers();
    TOOL_HANDLERS.jieyu_timeout_probe = () => new Promise(() => undefined);
    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });

    try {
      const pending = routeServerMethod(server, {
        jsonrpc: '2.0',
        id: 94,
        method: 'tools/call',
        params: { name: 'jieyu_timeout_probe', arguments: {} },
      });
      await vi.advanceTimersByTimeAsync(30_000);
      const response = await pending;

      expect(response.error?.code).toBe(-32001);
      expect(response.error?.message).toContain('Tool call timeout');
      expect(persistMcpMock).toHaveBeenCalledWith(expect.objectContaining({
        outcome: 'timeout',
        toolName: 'jieyu_timeout_probe',
      }));
    } finally {
      delete TOOL_HANDLERS.jieyu_timeout_probe;
      vi.useRealTimers();
    }
  });

  it('calls jieyu_get_segment_detail and returns detail', async () => {
    mockedDetail.mockResolvedValue({
      id: 'seg-001',
      kind: 'segment',
      layerId: 'layer-1',
      startTime: 0,
      endTime: 4.999,
      transcription: 'hello',
    });

    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });
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
            expect(parsed.transcription).toBe('hello');
          }
        }
      }
    }
    expect(foundResult).toBe(true);
  });

  it('calls jieyu_diagnose_quality and returns diagnosis', async () => {
    mockedDiagnose.mockResolvedValue({
      scope: 'project',
      summary: {
        totalSegments: 100,
        transcribedSegments: 95,
        untranscribedSegments: 5,
        segmentsWithSpeaker: 90,
        segmentsMissingSpeaker: 10,
        translationLayers: 2,
      },
      recommendations: ['5 segments remain untranscribed.'],
    });

    server = new McpServer({ token: TEST_TOKEN, runtimeContext: MCP_TEST_RUNTIME_CONTEXT });
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
            expect(parsed.summary.totalSegments).toBe(100);
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

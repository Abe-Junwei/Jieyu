/**
 * PR-15: 轻量 MCP HTTP Server（SSE transport 子集）
 *
 * 支持：
 * - GET /sse          → 建立 SSE 会话，返回消息 endpoint
 * - POST /messages    → 接收 JSON-RPC 请求（tools/list, tools/call）
 * - 认证：Bearer token
 * - 只读：写请求返回 not_supported
 *
 * 不引入 @modelcontextprotocol/sdk。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { JsonRpcRequest, JsonRpcResponse, McpServerOptions, McpServerRuntimeContext, McpToolCallResult } from './types';
import { isAuthorized, sendUnauthorized } from './auth';
import { READ_ONLY_TOOLS, TOOL_HANDLERS } from './tools';
import { persistMcpToolCallAudit } from './mcpToolCallAudit';

interface McpSession {
  id: string;
  res: ServerResponse;
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    Connection: 'close',
  });
  res.end(body);
}

function sendSse(res: ServerResponse, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

function parseBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function makeJsonRpcError(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function makeJsonRpcResult(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

async function runToolHandlerWithTimeout(
  handler: (args: Record<string, unknown>, runtimeContext: McpServerRuntimeContext) => Promise<McpToolCallResult> | McpToolCallResult,
  args: Record<string, unknown>,
  runtimeContext: McpServerRuntimeContext,
): Promise<McpToolCallResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(handler(args, runtimeContext)),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Tool call timeout after 30s')), 30_000);
      }),
    ]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

export function isMcpLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  const remote = remoteAddress ?? '';
  return remote === '127.0.0.1' || remote === '::1' || remote === 'localhost';
}

export class McpServer {
  private options: McpServerOptions;
  private sessions = new Map<string, McpSession>();
  private server?: Server;
  private port = 0;

  constructor(options: McpServerOptions) {
    this.options = options;
  }

  get listenPort(): number {
    return this.port;
  }

  async start(preferredPort = 6277): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          sendJson(res, 500, makeJsonRpcError(null, -32603, String(err)));
        });
      });

      this.server.listen(preferredPort, () => {
        const addr = this.server!.address();
        this.port = typeof addr === 'object' && addr !== null ? addr.port : preferredPort;
        resolve();
      });

      this.server.once('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          // 端口占用时尝试随机端口
          this.server!.listen(0, () => {
            const addr = this.server!.address();
            this.port = typeof addr === 'object' && addr !== null ? addr.port : 0;
            resolve();
          });
        } else {
          reject(err);
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const session of this.sessions.values()) {
        try {
          session.res.end();
        } catch {
          // ignore
        }
      }
      this.sessions.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    // SSE endpoint
    if (pathname === '/sse' && req.method === 'GET') {
      await this.handleSse(req, res);
      return;
    }

    // Message endpoint
    if (pathname === '/messages' && req.method === 'POST') {
      await this.handleMessage(req, res);
      return;
    }

    sendJson(res, 404, makeJsonRpcError(null, -32601, `Method not found: ${req.method} ${pathname}`));
  }

  private async handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isAuthorized(req, this.options.token)) {
      sendUnauthorized(res);
      return;
    }

    const sessionId = randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    this.sessions.set(sessionId, { id: sessionId, res });

    // Send endpoint event
    sendSse(res, 'endpoint', `/messages?sessionId=${sessionId}`);

    // Send initialization acknowledgement
    sendSse(
      res,
      'message',
      JSON.stringify(makeJsonRpcResult(null, { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'jieyu-mcp', version: '0.1.0' } })),
    );

    req.on('close', () => {
      this.sessions.delete(sessionId);
    });
  }

  private isLoopback(req: IncomingMessage): boolean {
    return isMcpLoopbackRemoteAddress(req.socket.remoteAddress);
  }

  private async handleMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isAuthorized(req, this.options.token)) {
      sendUnauthorized(res);
      return;
    }

    if (!this.isLoopback(req)) {
      sendJson(res, 403, makeJsonRpcError(null, -32003, 'Forbidden: MCP server only accepts loopback connections'));
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const sessionId = url.searchParams.get('sessionId') ?? '';
    const session = this.sessions.get(sessionId);

    if (!session) {
      sendJson(res, 400, makeJsonRpcError(null, -32600, 'Invalid session: session not found or expired'));
      return;
    }

    const body = await parseBody(req);
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(body.toString('utf-8')) as JsonRpcRequest;
    } catch {
      sendJson(res, 400, makeJsonRpcError(null, -32700, 'Parse error'));
      return;
    }

    if (request.jsonrpc !== '2.0') {
      sendJson(res, 400, makeJsonRpcError(request.id ?? null, -32600, 'Invalid Request'));
      return;
    }

    const response = await this.routeMethod(request);

    // MCP HTTP transport: response goes back via SSE, POST returns 202 Accepted
    sendSse(session.res, 'message', JSON.stringify(response));
    res.writeHead(202, { 'Access-Control-Allow-Origin': '*' });
    res.end();
  }

  private async routeMethod(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, id, params } = request;

    switch (method) {
      case 'tools/list': {
        return makeJsonRpcResult(id ?? null, { tools: READ_ONLY_TOOLS });
      }

      case 'tools/call': {
        const startedAtMs = Date.now();
        const jsonRpcId = id ?? null;
        const args = (params as Record<string, unknown> | undefined)?.arguments as Record<string, unknown> ?? {};
        const runtimeContext: McpServerRuntimeContext = this.options.runtimeContext ?? {};
        const name = String((params as Record<string, unknown> | undefined)?.name ?? '');

        if (!name.trim()) {
          await persistMcpToolCallAudit({
            jsonRpcId,
            toolName: '',
            arguments: args,
            runtimeContext,
            startedAtMs,
            outcome: 'validation_error',
            error: { code: -32602, message: 'Invalid params: missing name' },
          });
          return makeJsonRpcError(id ?? null, -32602, 'Invalid params: missing name');
        }

        const handler = TOOL_HANDLERS[name];
        if (!handler) {
          await persistMcpToolCallAudit({
            jsonRpcId,
            toolName: name,
            arguments: args,
            runtimeContext,
            startedAtMs,
            outcome: 'tool_not_found',
            error: { code: -32601, message: `Tool not found: ${name}` },
          });
          return makeJsonRpcError(id ?? null, -32601, `Tool not found: ${name}`);
        }

        // Validate limit / offset bounds before execution
        const limit = typeof args.limit === 'number' ? args.limit : undefined;
        const offset = typeof args.offset === 'number' ? args.offset : undefined;
        if (limit !== undefined && limit > 100) {
          await persistMcpToolCallAudit({
            jsonRpcId,
            toolName: name,
            arguments: args,
            runtimeContext,
            startedAtMs,
            outcome: 'validation_error',
            error: { code: -32602, message: 'Invalid params: limit exceeds maximum of 100' },
          });
          return makeJsonRpcError(id ?? null, -32602, 'Invalid params: limit exceeds maximum of 100');
        }
        if (offset !== undefined && offset > 1000) {
          await persistMcpToolCallAudit({
            jsonRpcId,
            toolName: name,
            arguments: args,
            runtimeContext,
            startedAtMs,
            outcome: 'validation_error',
            error: { code: -32602, message: 'Invalid params: offset exceeds maximum of 1000' },
          });
          return makeJsonRpcError(id ?? null, -32602, 'Invalid params: offset exceeds maximum of 1000');
        }

        try {
          const result = await runToolHandlerWithTimeout(handler, args, runtimeContext);
          await persistMcpToolCallAudit({
            jsonRpcId,
            toolName: name,
            arguments: args,
            runtimeContext,
            startedAtMs,
            outcome: 'success',
            toolResult: result,
          });
          return makeJsonRpcResult(id ?? null, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTimeout = message.includes('timeout');
          await persistMcpToolCallAudit({
            jsonRpcId,
            toolName: name,
            arguments: args,
            runtimeContext,
            startedAtMs,
            outcome: isTimeout ? 'timeout' : 'execution_error',
            error: isTimeout
              ? { code: -32001, message: `Tool call timeout: ${message}` }
              : { code: -32603, message: `Tool execution error: ${message}` },
          });
          if (isTimeout) {
            return makeJsonRpcError(id ?? null, -32001, `Tool call timeout: ${message}`);
          }
          return makeJsonRpcError(id ?? null, -32603, `Tool execution error: ${message}`);
        }
      }

      // Explicitly reject any write-oriented methods
      case 'resources/create':
      case 'resources/update':
      case 'resources/delete':
      case 'tools/create':
      case 'tools/update':
      case 'tools/delete':
      case 'prompts/create':
      case 'prompts/update':
      case 'prompts/delete': {
        return makeJsonRpcError(id ?? null, -32002, 'not_supported: Jieyu MCP server is read-only');
      }

      default: {
        return makeJsonRpcError(id ?? null, -32601, `Method not found: ${method}`);
      }
    }
  }
}

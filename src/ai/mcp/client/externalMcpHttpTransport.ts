import type { JsonRpcResponse } from '../server/types';

export const MCP_STREAMABLE_HTTP_PROTOCOL_VERSION = '2025-03-26';

const WRITE_RPC_METHODS = new Set([
  'resources/create',
  'resources/update',
  'resources/delete',
  'tools/create',
  'tools/update',
  'tools/delete',
  'prompts/create',
  'prompts/update',
  'prompts/delete',
]);

export function isExternalMcpWriteRpcMethod(method: string): boolean {
  return WRITE_RPC_METHODS.has(method);
}

export function parseJsonRpcFromHttpBody(
  contentType: string,
  body: string,
): JsonRpcResponse | null {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'application/json' || mime === 'application/json-rpc') {
    try {
      const parsed = JSON.parse(body) as JsonRpcResponse;
      return parsed?.jsonrpc === '2.0' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (mime !== 'text/event-stream') return null;
  let last: JsonRpcResponse | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as JsonRpcResponse;
      if (parsed?.jsonrpc === '2.0' && (parsed.result !== undefined || parsed.error)) last = parsed;
    } catch {
      // skip malformed SSE data
    }
  }
  return last;
}

/**
 * MCP Server 认证层 — 项目级只读 token
 *
 * 验证规则：
 * 1. 请求必须携带 Authorization: Bearer <token> header。
 * 2. Token 必须与创建 server 时传入的 token 完全匹配。
 * 3. 不通过时返回 401 Unauthorized。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

const UNAUTHORIZED_RESPONSE = JSON.stringify({
  jsonrpc: '2.0',
  id: null,
  error: { code: -32001, message: 'Unauthorized: invalid or missing Bearer token' },
});

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization ?? '';
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0]!.toLowerCase() === 'bearer') {
    return parts[1] ?? null;
  }
  return null;
}

export function sendUnauthorized(res: ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(UNAUTHORIZED_RESPONSE);
}

export function isAuthorized(req: IncomingMessage, expectedToken: string): boolean {
  const token = extractBearerToken(req);
  if (!token || token.length === 0) return false;
  // 常数时间比较，防止时序攻击（简单实现）
  if (token.length !== expectedToken.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return mismatch === 0;
}

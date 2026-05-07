/**
 * MCP Server 轻量类型定义（JSON-RPC 2.0 子集）
 * 不引入 @modelcontextprotocol/sdk，保持零外部依赖。
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type McpToolHandler = (
  args: Record<string, unknown>,
  runtimeContext?: McpServerRuntimeContext,
) => Promise<McpToolCallResult> | McpToolCallResult;

export interface McpServerRuntimeContext {
  /** Identifies the project for the host; does **not** satisfy segment-read scope on its own (tools still require textId / currentMediaId / currentLayerId per ADR-0030). */
  projectId?: string;
  textId?: string;
  currentMediaId?: string;
  currentLayerId?: string;
}

export interface McpServerOptions {
  /** 项目级只读 token，客户端需在 Authorization header 中携带 Bearer <token> */
  token: string;
  /** 可选：限制来源 host，默认不限制 */
  allowedOrigin?: string;
  /** 运行时上下文（project/media/layer scope） */
  runtimeContext?: McpServerRuntimeContext;
}

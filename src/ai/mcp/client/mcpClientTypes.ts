/**
 * PR-20: MCP Client 数据结构预留
 *
 * 当前仅类型定义，无 runtime 实现。
 * 用于未来对接 Zotero MCP / OpenAlex MCP 等外部服务。
 */

export interface McpClientConfig {
  /** MCP Server endpoint (HTTP/SSE) */
  endpoint: string;
  /** Authentication token or API key */
  authToken?: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Whether the client is enabled */
  enabled: boolean;
}

export interface McpToolCallRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  requestId: string;
}

export interface McpToolCallResult {
  requestId: string;
  success: boolean;
  data?: unknown;
  errorMessage?: string;
}

export type McpClientProvider = 'zotero' | 'openalex';

export interface McpClientRegistryEntry {
  provider: McpClientProvider;
  config: McpClientConfig;
  labelKey: string;
}

/**
 * PR-20 placeholder. B15 origin/label drafts live in `EXTERNAL_MCP_PROVIDER_PRESETS`
 * (`externalMcpProviderAdapters.ts`) to avoid a circular import with this types module.
 */
export const MCP_CLIENT_REGISTRY: McpClientRegistryEntry[] = [];

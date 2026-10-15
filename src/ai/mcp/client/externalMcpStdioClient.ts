/**
 * B17 — desktop-only local MCP over stdio.
 * Browser builds never spawn. Flag off never calls the host bridge.
 */

import { featureFlags } from '../../config/featureFlags';
import type { McpToolCallResult } from '../server/types';
import { getExternalMcpTrustEntry, normalizeExternalMcpOrigin } from './externalMcpTrustRegistry';
import { isExternalMcpSecondModelTool } from './externalMcpEvidenceHits';

export type ExternalMcpStdioDenial =
  | 'flag_off'
  | 'not_desktop'
  | 'invalid_origin'
  | 'unregistered'
  | 'disabled'
  | 'second_model_tool_denied'
  | 'host_error';

export type ExternalMcpStdioCallResult =
  | { ok: true; origin: string; result: McpToolCallResult }
  | { ok: false; reason: ExternalMcpStdioDenial; message?: string };

export type ExternalMcpStdioHost = {
  callTool: (input: {
    origin: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }) => Promise<McpToolCallResult>;
};

declare global {
  interface Window {
    __JIEYU_EXTERNAL_MCP_STDIO__?: ExternalMcpStdioHost;
  }
}

export function isExternalMcpStdioOrigin(origin: string): boolean {
  return origin.trim().toLowerCase().startsWith('stdio://');
}

function readStdioHost(): ExternalMcpStdioHost | null {
  if (typeof window === 'undefined') return null;
  const host = window.__JIEYU_EXTERNAL_MCP_STDIO__;
  if (!host || typeof host.callTool !== 'function') return null;
  return host;
}

export async function callLocalMcpToolViaStdio(input: {
  origin: string;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<ExternalMcpStdioCallResult> {
  if (!featureFlags.corpusExternalEvidenceEnabled) {
    return { ok: false, reason: 'flag_off' };
  }
  if (isExternalMcpSecondModelTool(input.toolName)) {
    return { ok: false, reason: 'second_model_tool_denied' };
  }
  const origin = normalizeExternalMcpOrigin(input.origin);
  if (!origin || !isExternalMcpStdioOrigin(origin)) {
    return { ok: false, reason: 'invalid_origin' };
  }
  if (!featureFlags.aiExternalMcpTrustEnabled) {
    return { ok: false, reason: 'flag_off' };
  }
  const entry = await getExternalMcpTrustEntry(origin);
  if (!entry) return { ok: false, reason: 'unregistered' };
  if (!entry.enabled) return { ok: false, reason: 'disabled' };

  const host = readStdioHost();
  if (!host) return { ok: false, reason: 'not_desktop' };

  try {
    const result = await host.callTool({
      origin,
      toolName: input.toolName,
      arguments: input.arguments,
    });
    return { ok: true, origin, result };
  } catch (error) {
    return {
      ok: false,
      reason: 'host_error',
      message: error instanceof Error ? error.message : 'stdio host error',
    };
  }
}

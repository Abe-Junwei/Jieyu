/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({
  corpusExternalEvidenceEnabled: true,
  aiExternalMcpTrustEnabled: true,
}));

vi.mock('../../config/featureFlags', () => ({
  featureFlags: flags,
}));

const getEntry = vi.hoisted(() => vi.fn());

vi.mock('./externalMcpTrustRegistry', () => ({
  normalizeExternalMcpOrigin: (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.startsWith('stdio://')) return trimmed.replace(/\/+$/, '');
    return null;
  },
  getExternalMcpTrustEntry: getEntry,
}));

import { callLocalMcpToolViaStdio, isExternalMcpStdioOrigin } from './externalMcpStdioClient';

describe('externalMcpStdioClient', () => {
  beforeEach(() => {
    flags.corpusExternalEvidenceEnabled = true;
    flags.aiExternalMcpTrustEnabled = true;
    getEntry.mockReset();
    delete window.__JIEYU_EXTERNAL_MCP_STDIO__;
  });

  it('recognizes stdio origins', () => {
    expect(isExternalMcpStdioOrigin('stdio://deepvault')).toBe(true);
    expect(isExternalMcpStdioOrigin('https://mcp.example.test')).toBe(false);
  });

  it('does not call the host when the flag is off', async () => {
    flags.corpusExternalEvidenceEnabled = false;
    const callTool = vi.fn();
    window.__JIEYU_EXTERNAL_MCP_STDIO__ = { callTool };
    const result = await callLocalMcpToolViaStdio({
      origin: 'stdio://deepvault',
      toolName: 'search_literature',
      arguments: { q: 'PST' },
    });
    expect(result).toEqual({ ok: false, reason: 'flag_off' });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('returns not_desktop when no host is injected', async () => {
    getEntry.mockResolvedValue({ origin: 'stdio://deepvault', enabled: true });
    const result = await callLocalMcpToolViaStdio({
      origin: 'stdio://deepvault',
      toolName: 'search_literature',
      arguments: { q: 'PST' },
    });
    expect(result).toEqual({ ok: false, reason: 'not_desktop' });
  });

  it('denies second-model tools before talking to the host', async () => {
    const callTool = vi.fn();
    window.__JIEYU_EXTERNAL_MCP_STDIO__ = { callTool };
    getEntry.mockResolvedValue({ origin: 'stdio://deepvault', enabled: true });
    const result = await callLocalMcpToolViaStdio({
      origin: 'stdio://deepvault',
      toolName: 'answer_with_citations',
      arguments: { q: 'PST' },
    });
    expect(result).toEqual({ ok: false, reason: 'second_model_tool_denied' });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('calls the host for trusted stdio tools', async () => {
    getEntry.mockResolvedValue({ origin: 'stdio://deepvault', enabled: true });
    window.__JIEYU_EXTERNAL_MCP_STDIO__ = {
      callTool: vi.fn(async () => ({
        content: [{ type: 'text' as const, text: '{"hits":[]}' }],
      })),
    };
    const result = await callLocalMcpToolViaStdio({
      origin: 'stdio://deepvault',
      toolName: 'search_literature',
      arguments: { q: 'PST' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.origin).toBe('stdio://deepvault');
      expect(result.result.content).toHaveLength(1);
    }
  });
});

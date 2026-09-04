// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ai/config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: true,
    aiExternalMcpHttpClientEnabled: true,
    aiSemanticGuardEnabled: true,
  },
}));

import { getSettingsModalMessages } from '../../i18n/messages';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { SettingsAiMcpTrustSection } from './SettingsAiMcpTrustSection';

const msg = getSettingsModalMessages('zh-CN');
const ORIGIN = 'https://mcp.example.test/mcp';
const SAFE_TOOLS = [{ name: 'search_works', description: 'Search OpenAlex works by title.' }];

describe('SettingsAiMcpTrustSection fetch tools/list', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('persists lastToolsJson after a successful fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body));
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: SAFE_TOOLS } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    render(<SettingsAiMcpTrustSection msg={msg} />);
    await waitFor(() => expect(screen.getByText(msg.aiMcpTrustEmpty)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(msg.aiMcpTrustOriginLabel), {
      target: { value: ORIGIN },
    });
    fireEvent.click(screen.getByRole('button', { name: msg.aiMcpTrustAddEnableButton }));
    await waitFor(() => expect(screen.getByText(ORIGIN)).toBeTruthy());

    fireEvent.click(screen.getByTestId('settings-ai-mcp-fetch-tools'));
    await waitFor(async () => {
      const db = await getDb();
      const stored = await db.collections.external_mcp_trust
        .findOne({ selector: { id: ORIGIN } })
        .exec();
      expect(stored?.toJSON().lastToolsJson).toBe(JSON.stringify(SAFE_TOOLS));
    });
  });
});

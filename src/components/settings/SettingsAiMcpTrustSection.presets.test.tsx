// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ai/config/featureFlags', () => ({
  featureFlags: {
    aiExternalMcpTrustEnabled: true,
    aiExternalMcpHttpClientEnabled: false,
    aiExternalMcpProviderAdaptersEnabled: true,
  },
}));

import { getSettingsModalMessages } from '../../i18n/messages';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { ZOTERO_MCP_HTTP_DEFAULT_ORIGIN } from '../../ai/mcp/client/externalMcpProviderAdapters';
import { SettingsAiMcpTrustSection } from './SettingsAiMcpTrustSection';

const msg = getSettingsModalMessages('zh-CN');

describe('SettingsAiMcpTrustSection provider presets', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  afterEach(() => {
    cleanup();
  });

  it('fills origin and label drafts without writing Dexie or fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<SettingsAiMcpTrustSection msg={msg} />);
    await waitFor(() => expect(screen.getByText(msg.aiMcpTrustEmpty)).toBeTruthy());

    fireEvent.click(screen.getByTestId('settings-ai-mcp-preset-zotero'));

    expect((screen.getByLabelText(msg.aiMcpTrustOriginLabel) as HTMLInputElement).value).toBe(
      ZOTERO_MCP_HTTP_DEFAULT_ORIGIN,
    );
    expect((screen.getByLabelText(msg.aiMcpTrustLabelOptional) as HTMLInputElement).value).toBe(
      'Zotero',
    );

    const db = await getDb();
    const stored = await db.collections.external_mcp_trust.find().exec();
    expect(stored).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

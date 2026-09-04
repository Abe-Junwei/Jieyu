import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_MCP_PROVIDER_PRESETS,
  OPENALEX_MCP_ORIGIN_PLACEHOLDER,
  ZOTERO_MCP_HTTP_DEFAULT_ORIGIN,
  mapExternalMcpToolResultToEvidencePackets,
  resolveExternalMcpProviderFromToolName,
} from './externalMcpProviderAdapters';

describe('externalMcpProviderAdapters', () => {
  it('fingerprints known Zotero and OpenAlex tool names', () => {
    expect(resolveExternalMcpProviderFromToolName('zotero_search_items')).toBe('zotero');
    expect(resolveExternalMcpProviderFromToolName('search_items')).toBe('zotero');
    expect(resolveExternalMcpProviderFromToolName('search_works')).toBe('openalex');
    expect(resolveExternalMcpProviderFromToolName('openalex_get_work')).toBe('openalex');
    expect(resolveExternalMcpProviderFromToolName('unknown_tool')).toBeNull();
  });

  it('maps OpenAlex search_works JSON to document evidence packets', () => {
    const packets = mapExternalMcpToolResultToEvidencePackets({
      toolName: 'search_works',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                id: 'https://openalex.org/W123',
                display_name: 'Jieyu',
                publication_year: 2024,
              },
            ],
          }),
        },
      ],
    });
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      schemaVersion: 0,
      sourceType: 'document',
      sourceId: 'https://openalex.org/W123',
      quote: 'Jieyu',
      summary: '2024',
      reasonCode: 'external_mcp_openalex',
    });
  });

  it('maps Zotero search items JSON to document evidence packets', () => {
    const packets = mapExternalMcpToolResultToEvidencePackets({
      toolName: 'zotero_search_items',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            items: [{ key: 'ABC123', title: 'A paper', date: '2020' }],
          }),
        },
      ],
    });
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      sourceType: 'document',
      sourceId: 'ABC123',
      quote: 'A paper',
      summary: '2020',
      reasonCode: 'external_mcp_zotero',
    });
  });

  it('returns an empty list for garbage or unknown tools', () => {
    expect(
      mapExternalMcpToolResultToEvidencePackets({
        toolName: 'search_works',
        content: [{ type: 'text', text: 'not-json' }],
      }),
    ).toEqual([]);
    expect(
      mapExternalMcpToolResultToEvidencePackets({
        toolName: 'search_works',
        content: [{ type: 'text', text: '{"count":1}' }],
      }),
    ).toEqual([]);
    expect(
      mapExternalMcpToolResultToEvidencePackets({
        toolName: 'local_search',
        content: [{ type: 'text', text: JSON.stringify({ results: [{ id: 'x', title: 'y' }] }) }],
      }),
    ).toEqual([]);
  });

  it('caps mapped packets at 8', () => {
    const results = Array.from({ length: 12 }, (_, index) => ({
      id: `W${index}`,
      display_name: `Work ${index}`,
    }));
    const packets = mapExternalMcpToolResultToEvidencePackets({
      toolName: 'search_works',
      content: [{ type: 'text', text: JSON.stringify({ results }) }],
    });
    expect(packets).toHaveLength(8);
  });

  it('keeps Zotero loopback and OpenAlex placeholder presets as drafts only', () => {
    expect(EXTERNAL_MCP_PROVIDER_PRESETS).toEqual([
      {
        provider: 'zotero',
        originDraft: ZOTERO_MCP_HTTP_DEFAULT_ORIGIN,
        labelDraft: 'Zotero',
      },
      {
        provider: 'openalex',
        originDraft: OPENALEX_MCP_ORIGIN_PLACEHOLDER,
        labelDraft: 'OpenAlex',
      },
    ]);
    expect(ZOTERO_MCP_HTTP_DEFAULT_ORIGIN).toBe('http://127.0.0.1:8765/mcp');
    expect(OPENALEX_MCP_ORIGIN_PLACEHOLDER).toContain('mcp.example.test');
  });
});

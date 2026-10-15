import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({
  corpusExternalEvidenceEnabled: true,
}));

vi.mock('../../config/featureFlags', () => ({
  featureFlags: flags,
}));

vi.mock('../../security/semanticGuard', () => ({
  inspectInbound: () => ({ action: 'allow', reasons: [] }),
}));

import {
  isExternalMcpSecondModelTool,
  mapExternalEvidenceToolResultToPackets,
  resolveExternalEvidenceKind,
} from './externalMcpEvidenceHits';

describe('externalMcpEvidenceHits', () => {
  beforeEach(() => {
    flags.corpusExternalEvidenceEnabled = true;
  });

  it('denies second-model answer tools', () => {
    expect(isExternalMcpSecondModelTool('answer_with_citations')).toBe(true);
    expect(isExternalMcpSecondModelTool('search_literature')).toBe(false);
  });

  it('maps literature hits with work, page, and passage', () => {
    expect(resolveExternalEvidenceKind('search_literature')).toBe('literature');
    const packets = mapExternalEvidenceToolResultToPackets({
      toolName: 'search_literature',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            hits: [
              {
                id: 'h1',
                title: 'A Grammar',
                page: '42',
                passage: 'The suffix marks past tense.',
              },
            ],
          }),
        },
      ],
    });
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      id: 'ev_ext_literature_h1',
      title: 'A Grammar',
      page: '42',
      quote: 'The suffix marks past tense.',
      reasonCode: 'external_mcp_literature',
    });
  });

  it('maps web hits with url, title, and passage', () => {
    const packets = mapExternalEvidenceToolResultToPackets({
      toolName: 'web_search',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                id: 'w1',
                title: 'Field notes',
                url: 'https://example.test/notes',
                passage: 'Gloss PST appears after the verb stem.',
              },
            ],
          }),
        },
      ],
    });
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      url: 'https://example.test/notes',
      title: 'Field notes',
      quote: 'Gloss PST appears after the verb stem.',
    });
  });

  it('drops hits without provenance or when the flag is off', () => {
    expect(
      mapExternalEvidenceToolResultToPackets({
        toolName: 'search_literature',
        content: [
          {
            type: 'text',
            text: JSON.stringify({ hits: [{ id: 'h1', title: 'Only title', passage: 'x' }] }),
          },
        ],
      }),
    ).toEqual([]);

    flags.corpusExternalEvidenceEnabled = false;
    expect(
      mapExternalEvidenceToolResultToPackets({
        toolName: 'search_literature',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              hits: [{ id: 'h1', title: 'A', page: '1', passage: 'text' }],
            }),
          },
        ],
      }),
    ).toEqual([]);
  });
});

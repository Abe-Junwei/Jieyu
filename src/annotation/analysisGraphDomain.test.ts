import { describe, expect, it } from 'vitest';
import { analysisGraphFingerprint, validateAnalysisGraphPayload } from './analysisGraphDomain';

const T = '2026-10-25T00:00:00.000Z';

function tokenGraph(text = 'ka'): Record<string, unknown> {
  return {
    payloadVersion: 1,
    id: 'g1',
    text,
    nodes: [
      {
        id: 'n1',
        type: 'token',
        label: text,
        domain: { form: { default: text }, index: 0, createdAt: T, updatedAt: T },
      },
    ],
    relations: [],
  };
}

describe('analysis graph domain', () => {
  it('accepts a token domain and rejects an illegal one', () => {
    expect(validateAnalysisGraphPayload(tokenGraph(), 'ka').nodes[0]?.domain?.form).toEqual({
      default: 'ka',
    });
    const missing = tokenGraph();
    (missing.nodes as Record<string, unknown>[])[0] = { id: 'n1', type: 'token', label: 'ka' };
    expect(() => validateAnalysisGraphPayload(missing, 'ka')).toThrow('token domain is missing');
    const negative = tokenGraph();
    (negative.nodes as { domain: { index: number } }[])[0]!.domain.index = -1;
    expect(() => validateAnalysisGraphPayload(negative, 'ka')).toThrow('token domain is invalid');
    const word = tokenGraph();
    (word.nodes as Record<string, unknown>[])[0] = {
      id: 'w1',
      type: 'word',
      label: 'ka',
      domain: { form: { default: 'ka' }, index: 0, createdAt: T, updatedAt: T },
    };
    expect(() => validateAnalysisGraphPayload(word, 'ka')).toThrow(
      'domain is only valid on a token or morpheme',
    );
  });

  it('rejects experimental keys, an unknown version, and a trimmed text mismatch', () => {
    const linear = tokenGraph();
    (linear.nodes as { features?: unknown }[])[0]!.features = { jieyuLinear: { form: 'ka' } };
    expect(() => validateAnalysisGraphPayload(linear, 'ka')).toThrow(
      'experimental key jieyuLinear',
    );
    const provenance = tokenGraph();
    (provenance.nodes as { features?: unknown }[])[0]!.features = { jieyuProvenance: { at: T } };
    expect(() => validateAnalysisGraphPayload(provenance, 'ka')).toThrow(
      'experimental key jieyuProvenance',
    );
    const link = tokenGraph();
    link.nodes = [...(link.nodes as unknown[]), { id: 'lex', type: 'lexemeRef', label: 'entry' }];
    link.relations = [
      {
        id: 'l1',
        type: 'linksLexeme',
        sourceId: 'n1',
        targetId: 'lex',
        features: { jieyuLexemeLink: { lexemeId: 'entry' } },
        link: { lexemeId: 'entry', createdAt: T, updatedAt: T },
      },
    ];
    expect(() => validateAnalysisGraphPayload(link, 'ka')).toThrow(
      'experimental key jieyuLexemeLink',
    );
    expect(() =>
      validateAnalysisGraphPayload({ ...tokenGraph(), payloadVersion: 2 }, 'ka'),
    ).toThrow('unknown analysis payload version');
    expect(() => validateAnalysisGraphPayload(tokenGraph('ka'), ' ka')).toThrow(
      'analysis text does not match the unit text',
    );
  });

  it('keeps the fingerprint stable across key and node order, and sensitive to index and span order', () => {
    const first = tokenGraph();
    const reversedKeys = {
      text: 'ka',
      id: 'g1',
      payloadVersion: 1,
      relations: [],
      nodes: [
        {
          label: 'ka',
          id: 'n1',
          type: 'token',
          domain: { updatedAt: T, createdAt: T, index: 0, form: { default: 'ka' } },
        },
      ],
    };
    const withContext = { ...first, displayContext: { formKey: 'default' } };
    expect(analysisGraphFingerprint(first)).toBe(analysisGraphFingerprint(reversedKeys));
    expect(analysisGraphFingerprint(withContext)).toBe(analysisGraphFingerprint(first));

    const secondNode = {
      id: 'n2',
      type: 'word',
      label: 'other',
    };
    const forward = { ...tokenGraph(), nodes: [...(tokenGraph().nodes as unknown[]), secondNode] };
    const backward = { ...tokenGraph(), nodes: [secondNode, ...(tokenGraph().nodes as unknown[])] };
    expect(analysisGraphFingerprint(forward)).toBe(analysisGraphFingerprint(backward));

    const reindexed = tokenGraph();
    (reindexed.nodes as { domain: { index: number } }[])[0]!.domain.index = 1;
    expect(analysisGraphFingerprint(reindexed)).not.toBe(analysisGraphFingerprint(first));

    const spanned = tokenGraph();
    const parts = [
      { tokenId: 'n1', formKey: 'default', startOffset: 0, endOffset: 1, alignedForm: 'k' },
      { tokenId: 'n1', formKey: 'default', startOffset: 1, endOffset: 2, alignedForm: 'a' },
    ];
    (spanned.nodes as { surfaceParts?: unknown }[])[0]!.surfaceParts = parts;
    const flipped = tokenGraph();
    (flipped.nodes as { surfaceParts?: unknown }[])[0]!.surfaceParts = [...parts].reverse();
    expect(analysisGraphFingerprint(spanned)).not.toBe(analysisGraphFingerprint(flipped));

    const residue = { ...tokenGraph(), residue: [{ id: 'r1', body: { n1: 'keep' } }] };
    const dropped = tokenGraph();
    expect(analysisGraphFingerprint(residue)).not.toBe(analysisGraphFingerprint(dropped));
    expect(analysisGraphFingerprint(null)).toBe('');
  });
});

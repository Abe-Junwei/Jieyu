/**
 * citationFootnoteUtils 单元测试
 * Unit tests for citation footnote utilities
 */
import { describe, it, expect } from 'vitest';
import {
  buildCopyableAssistantPlainText,
  buildNumberedRagLines,
  extractCitationIndices,
  buildSourceListFooter,
  normalizeCitationSnippetPlainText,
  splitCitationMarkers,
  RAG_CITATION_INSTRUCTION,
  type NumberedRagSource,
} from './citationFootnoteUtils';

// ── buildNumberedRagLines ──

describe('buildNumberedRagLines', () => {
  it('numbers sources starting from 1', () => {
    const sources: NumberedRagSource[] = [
      { tag: '句段参考', contextTag: 'UTTERANCE_CONTEXT', snippet: 'The dog ran.' },
      { tag: '笔记参考', contextTag: 'NOTE_CONTEXT', snippet: 'Leipzig glossing rules.' },
    ];
    const lines = buildNumberedRagLines(sources);
    expect(lines).toEqual([
      '[1] (UTTERANCE_CONTEXT) The dog ran.',
      '[2] (NOTE_CONTEXT) Leipzig glossing rules.',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(buildNumberedRagLines([])).toEqual([]);
  });
});

// ── extractCitationIndices ──

describe('extractCitationIndices', () => {
  it('extracts indices in sorted order', () => {
    expect(extractCitationIndices('参考 [2] 以及 [1] 所述')).toEqual([1, 2]);
  });

  it('deduplicates repeated indices', () => {
    expect(extractCitationIndices('[1] foo [1] bar [3]')).toEqual([1, 3]);
  });

  it('returns empty array when no markers', () => {
    expect(extractCitationIndices('no citations here')).toEqual([]);
  });

  it('ignores non-numeric brackets', () => {
    expect(extractCitationIndices('[abc] [1] [2x]')).toEqual([1]);
  });
});

// ── buildSourceListFooter ──

describe('buildSourceListFooter', () => {
  it('returns empty string for no citations', () => {
    expect(buildSourceListFooter([], 'zh')).toBe('');
  });

  it('builds Chinese header for zh locale', () => {
    const result = buildSourceListFooter(
      [{ type: 'utterance', refId: 'u1', label: '句段参考', snippet: 'The dog ran' }],
      'zh-CN',
    );
    expect(result).toContain('来源');
    expect(result).toContain('[1] 句段参考: The dog ran');
  });

  it('builds English header for en locale', () => {
    const result = buildSourceListFooter(
      [{ type: 'note', refId: 'n1', label: '笔记参考', snippet: 'Some note' }],
      'en',
    );
    expect(result).toContain('Sources');
    expect(result).toContain('[1] 笔记参考: Some note');
  });

  it('truncates long snippets with ellipsis', () => {
    const longSnippet = 'a'.repeat(200);
    const result = buildSourceListFooter(
      [{ type: 'utterance', refId: 'u1', snippet: longSnippet }],
      'en',
    );
    expect(result).toContain('…');
    // 100 chars max + ellipsis 标记 | 100 char max + ellipsis marker
    expect(result.length).toBeLessThan(longSnippet.length);
  });

  it('numbers multiple citations sequentially', () => {
    const result = buildSourceListFooter(
      [
        { type: 'utterance', refId: 'u1', label: '句段', snippet: 's1' },
        { type: 'note', refId: 'n1', label: '笔记', snippet: 's2' },
        { type: 'pdf', refId: 'p1', label: '文档', snippet: 's3' },
      ],
      'zh',
    );
    expect(result).toContain('[1] 句段');
    expect(result).toContain('[2] 笔记');
    expect(result).toContain('[3] 文档');
  });

  it('marks utterance line when readModelIndexHit is false', () => {
    const zh = buildSourceListFooter(
      [{ type: 'utterance', refId: 'gone', label: '句段参考', snippet: 'old', readModelIndexHit: false }],
      'zh-CN',
    );
    expect(zh).toContain('[1] 句段参考 [当前时间线索引未命中]:');

    const en = buildSourceListFooter(
      [{ type: 'utterance', refId: 'gone', label: 'Unit ref', snippet: 'old', readModelIndexHit: false }],
      'en-US',
    );
    expect(en).toContain('[1] Unit ref [not in current timeline index]:');
  });

  it('strips bidi isolation controls and normalizes whitespace in snippets', () => {
    const result = buildSourceListFooter(
      [{ type: 'utterance', refId: 'u1', label: '句段参考', snippet: '\u2067مرحبا\u2069\n  بالعالم' }],
      'zh-CN',
    );

    expect(result).toContain('[1] 句段参考: مرحبا بالعالم');
    expect(result).not.toContain('\u2067');
    expect(result).not.toContain('\u2069');
  });
});

describe('normalizeCitationSnippetPlainText', () => {
  it('strips directional isolation controls and collapses whitespace', () => {
    expect(normalizeCitationSnippetPlainText('\u2067abc\u2069\n  def\tghi')).toBe('abc def ghi');
  });
});

describe('buildCopyableAssistantPlainText', () => {
  it('appends normalized source footer to assistant content', () => {
    const result = buildCopyableAssistantPlainText({
      content: '回答正文',
      citations: [{ type: 'pdf', refId: 'p1', label: '文档参考', snippet: '\u2067مرحبا\u2069\n  بالعالم' }],
      locale: 'zh-CN',
    });

    expect(result).toContain('回答正文');
    expect(result).toContain('来源:');
    expect(result).toContain('[1] 文档参考: مرحبا بالعالم');
  });
});

// ── splitCitationMarkers ──

describe('splitCitationMarkers', () => {
  it('splits text with markers into segments', () => {
    const segments = splitCitationMarkers('The dog [1] ran [2].', 2);
    expect(segments).toEqual([
      { type: 'text', value: 'The dog ' },
      { type: 'marker', value: '[1]', index: 1 },
      { type: 'text', value: ' ran ' },
      { type: 'marker', value: '[2]', index: 2 },
      { type: 'text', value: '.' },
    ]);
  });

  it('returns plain text when no markers', () => {
    const segments = splitCitationMarkers('Hello world', 3);
    expect(segments).toEqual([{ type: 'text', value: 'Hello world' }]);
  });

  it('ignores markers beyond maxCitationIndex', () => {
    const segments = splitCitationMarkers('Text [1] and [5] here', 3);
    expect(segments).toEqual([
      { type: 'text', value: 'Text ' },
      { type: 'marker', value: '[1]', index: 1 },
      { type: 'text', value: ' and [5] here' },
    ]);
  });

  it('returns single text segment when maxCitationIndex is 0', () => {
    const segments = splitCitationMarkers('Text [1] here', 0);
    expect(segments).toEqual([{ type: 'text', value: 'Text [1] here' }]);
  });

  it('returns empty array for empty string', () => {
    expect(splitCitationMarkers('', 5)).toEqual([]);
  });

  it('handles adjacent markers', () => {
    const segments = splitCitationMarkers('[1][2]', 2);
    expect(segments).toEqual([
      { type: 'marker', value: '[1]', index: 1 },
      { type: 'marker', value: '[2]', index: 2 },
    ]);
  });

  it('handles marker at start and end', () => {
    const segments = splitCitationMarkers('[1] text [2]', 2);
    expect(segments).toEqual([
      { type: 'marker', value: '[1]', index: 1 },
      { type: 'text', value: ' text ' },
      { type: 'marker', value: '[2]', index: 2 },
    ]);
  });

  it('ignores [0] as invalid citation index', () => {
    const segments = splitCitationMarkers('Text [0] and [1] here', 2);
    expect(segments).toEqual([
      { type: 'text', value: 'Text [0] and ' },
      { type: 'marker', value: '[1]', index: 1 },
      { type: 'text', value: ' here' },
    ]);
  });
});

// ── RAG_CITATION_INSTRUCTION ──

describe('RAG_CITATION_INSTRUCTION', () => {
  it('contains both Chinese and English instructions', () => {
    expect(RAG_CITATION_INSTRUCTION).toContain('[1]');
    expect(RAG_CITATION_INSTRUCTION).toContain('[2]');
    expect(RAG_CITATION_INSTRUCTION).toMatch(/标记|脚注/);
    expect(RAG_CITATION_INSTRUCTION).toMatch(/footnote|marker/i);
  });
});

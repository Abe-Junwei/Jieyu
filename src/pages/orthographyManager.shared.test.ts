/**
 * 正字法管理共享工具测试 | Orthography manager shared utility tests.
 */
import { describe, expect, it } from 'vitest';
import type { OrthographyDocType } from '../db';
import {
  areDraftsEqual,
  buildOrthographyDraft,
  buildSearchText,
  parseConversionRulesJson,
  parseDraftList,
  parseOptionalNumber,
  readOrthographyName,
} from './orthographyManager.shared';

// ── readOrthographyName ──────────────────────────────────────────────────────

describe('readOrthographyName', () => {
  it('优先使用多语名称 | prefers the multi-lang name', () => {
    const doc = { id: 'orth_1', name: { zho: '拼音', eng: 'Pinyin' }, abbreviation: 'PY', createdAt: '2026-01-01' } as OrthographyDocType;
    expect(readOrthographyName(doc)).toBe('拼音');
  });

  it('名称为空时回退到缩写 | falls back to abbreviation when name is empty', () => {
    const doc = { id: 'orth_1', name: {}, abbreviation: 'PY', createdAt: '2026-01-01' } as OrthographyDocType;
    expect(readOrthographyName(doc)).toBe('PY');
  });

  it('都为空时回退到 ID | falls back to id when both are empty', () => {
    const doc = { id: 'orth_1', name: {}, createdAt: '2026-01-01' } as OrthographyDocType;
    expect(readOrthographyName(doc)).toBe('orth_1');
  });
});

// ── buildOrthographyDraft ────────────────────────────────────────────────────

describe('buildOrthographyDraft', () => {
  it('将文档映射为 draft 格式 | maps doc fields to draft shape', () => {
    const doc: OrthographyDocType = {
      id: 'orth_1',
      name: { zho: '拼音', eng: 'Pinyin' },
      languageId: 'cmn',
      abbreviation: 'PY',
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
      exemplarCharacters: { main: ['a', 'b', 'c'] },
      fontPreferences: { primary: ['Noto Sans'], lineHeightScale: 1.2 },
      normalization: { form: 'NFC', caseSensitive: true },
      bidiPolicy: { isolateInlineRuns: true, preferDirAttribute: false },
      createdAt: '2026-01-01',
    };

    const draft = buildOrthographyDraft(doc);
    expect(draft.languageId).toBe('cmn');
    expect(draft.abbreviation).toBe('PY');
    expect(draft.exemplarMain).toBe('a, b, c');
    expect(draft.primaryFonts).toBe('Noto Sans');
    expect(draft.lineHeightScale).toBe('1.2');
    expect(draft.normalizationForm).toBe('NFC');
    expect(draft.normalizationCaseSensitive).toBe(true);
    expect(draft.bidiIsolate).toBe(true);
    expect(draft.preferDirAttribute).toBe(false);
  });

  it('缺失字段使用合理默认值 | uses sensible defaults for missing fields', () => {
    const doc: OrthographyDocType = {
      id: 'orth_2',
      name: {},
      createdAt: '2026-01-01',
    };
    const draft = buildOrthographyDraft(doc);
    expect(draft.languageId).toBe('');
    expect(draft.type).toBe('practical');
    expect(draft.direction).toBe('ltr');
    expect(draft.normalizationCaseSensitive).toBe(false);
    expect(draft.preferDirAttribute).toBe(true);
  });
});

// ── buildSearchText ──────────────────────────────────────────────────────────

describe('buildSearchText', () => {
  it('拼接名称、语言、脚本等字段 | joins name, language, script into search text', () => {
    const doc = {
      id: 'orth_1',
      name: { eng: 'Pinyin' },
      languageId: 'cmn',
      scriptTag: 'Latn',
      type: 'practical',
      createdAt: '2026-01-01',
    } as OrthographyDocType;
    const text = buildSearchText(doc, '普通话');
    expect(text).toContain('pinyin');
    expect(text).toContain('cmn');
    expect(text).toContain('普通话');
    expect(text).toContain('latn');
  });
});

// ── areDraftsEqual ───────────────────────────────────────────────────────────

describe('areDraftsEqual', () => {
  it('相同对象返回 true | returns true for identical drafts', () => {
    const doc: OrthographyDocType = { id: 'orth_1', name: { eng: 'X' }, createdAt: '2026-01-01' };
    const draft = buildOrthographyDraft(doc);
    expect(areDraftsEqual(draft, { ...draft })).toBe(true);
  });

  it('不同字段返回 false | returns false for different drafts', () => {
    const doc: OrthographyDocType = { id: 'orth_1', name: { eng: 'X' }, createdAt: '2026-01-01' };
    const draft = buildOrthographyDraft(doc);
    expect(areDraftsEqual(draft, { ...draft, abbreviation: 'NEW' })).toBe(false);
  });

  it('null 比较 | handles null comparisons', () => {
    expect(areDraftsEqual(null, null)).toBe(true);
  });
});

// ── parseDraftList ───────────────────────────────────────────────────────────

describe('parseDraftList', () => {
  it('用逗号和换行分割 | splits by comma and newline', () => {
    expect(parseDraftList('a, b\nc')).toEqual(['a', 'b', 'c']);
  });

  it('过滤空值 | filters out empty values', () => {
    expect(parseDraftList(', , \n\n')).toEqual([]);
  });

  it('空字符串返回空数组 | returns empty for empty string', () => {
    expect(parseDraftList('')).toEqual([]);
  });
});

// ── parseOptionalNumber ──────────────────────────────────────────────────────

describe('parseOptionalNumber', () => {
  it('解析有效数字 | parses valid numbers', () => {
    expect(parseOptionalNumber('1.5')).toEqual({ valid: true, value: 1.5 });
  });

  it('空字符串返回无值 | returns valid with no value for empty string', () => {
    expect(parseOptionalNumber('')).toEqual({ valid: true });
  });

  it('非法数字返回无效 | returns invalid for non-numeric', () => {
    expect(parseOptionalNumber('abc')).toEqual({ valid: false });
  });

  it('Infinity 返回无效 | returns invalid for Infinity', () => {
    expect(parseOptionalNumber('Infinity')).toEqual({ valid: false });
  });
});

// ── parseConversionRulesJson ─────────────────────────────────────────────────

describe('parseConversionRulesJson', () => {
  it('解析有效 JSON 对象 | parses valid JSON object', () => {
    const result = parseConversionRulesJson('{"a": 1}');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ a: 1 });
  });

  it('空字符串返回有效 | returns valid for empty string', () => {
    expect(parseConversionRulesJson('')).toEqual({ valid: true });
  });

  it('数组返回无效 | returns invalid for arrays', () => {
    expect(parseConversionRulesJson('[1,2]')).toEqual({ valid: false });
  });

  it('非法 JSON 返回无效 | returns invalid for malformed JSON', () => {
    expect(parseConversionRulesJson('{bad}')).toEqual({ valid: false });
  });
});
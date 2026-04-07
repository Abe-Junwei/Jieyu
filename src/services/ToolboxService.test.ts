/**
 * ToolboxService 单元测试
 * Unit tests for Toolbox marker-stream (.txt) import/export
 */
import { describe, it, expect } from 'vitest';
import { importFromToolbox, exportToToolbox } from './ToolboxService';
import type { UtteranceDocType, LayerDocType, UtteranceTextDocType } from '../db';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeUtt(id: string, start: number, end: number, text: string, speakerId?: string): UtteranceDocType {
  return {
    id,
    mediaId: 'm1',
    layerId: 'l1',
    textId: 'text_1',
    startTime: start,
    endTime: end,
    transcription: { default: text },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(speakerId !== undefined && { speakerId }),
  } as UtteranceDocType;
}

function makeLayer(id: string, layerType: 'transcription' | 'translation', isDefault = false): LayerDocType {
  return {
    id,
    textId: 'text_1',
    key: `${layerType}_${id}`,
    name: { eng: id },
    layerType,
    languageId: 'zho',
    modality: 'text',
    isDefault,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as LayerDocType;
}

// ── Import ───────────────────────────────────────────────────────────────────

describe('importFromToolbox', () => {
  it('解析基本标记流 | parses basic marker stream', () => {
    const content = `\\ref r1
\\ts 0.000
\\te 2.500
\\tx hello world

\\ref r2
\\ts 2.500
\\te 5.000
\\tx second line
`;
    const result = importFromToolbox(content);
    expect(result.utterances).toHaveLength(2);
    expect(result.utterances[0]).toMatchObject({
      startTime: 0,
      endTime: 2.5,
      transcription: 'hello world',
    });
    expect(result.utterances[1]).toMatchObject({
      startTime: 2.5,
      endTime: 5,
      transcription: 'second line',
    });
  });

  it('解析 \\mb \\ge \\ps 生成 token/morpheme | parses morpheme markers', () => {
    const content = `\\ref r1
\\ts 0.000
\\te 2.000
\\tx I eat
\\mb I eat-PST
\\ge 1SG eat-PAST
\\ps PRO V-TAM
`;
    const result = importFromToolbox(content);
    expect(result.utterances[0]!.tokens).toBeDefined();
    const tokens = result.utterances[0]!.tokens!;
    expect(tokens).toHaveLength(2);
    // 第一个 token 没有形态分析（单形素）
    expect(tokens[0]!.form.default).toBe('I');
    // 第二个 token 有 morpheme 拆分
    expect(tokens[1]!.morphemes).toBeDefined();
    expect(tokens[1]!.morphemes!.length).toBeGreaterThanOrEqual(1);
  });

  it('解析自由翻译 \\ft → additionalTiers | parses free translation', () => {
    const content = `\\ref r1
\\ts 0.000
\\te 2.000
\\tx original text
\\ft free translation here
`;
    const result = importFromToolbox(content);
    expect(result.additionalTiers.has('Toolbox Free Translation')).toBe(true);
    const ft = result.additionalTiers.get('Toolbox Free Translation')!;
    expect(ft).toHaveLength(1);
    expect(ft[0]!.text).toBe('free translation here');
  });

  it('跳过无转写文本的记录 | skips records without transcription', () => {
    const content = `\\ref r1
\\ts 0.000
\\te 2.000

\\ref r2
\\ts 2.000
\\te 4.000
\\tx valid text
`;
    const result = importFromToolbox(content);
    expect(result.utterances).toHaveLength(1);
    expect(result.utterances[0]!.transcription).toBe('valid text');
  });

  it('处理 Windows 换行 (\\r\\n) | handles CRLF', () => {
    const content = '\\ref r1\r\n\\ts 0.000\r\n\\te 1.000\r\n\\tx crlf text\r\n';
    const result = importFromToolbox(content);
    expect(result.utterances).toHaveLength(1);
    expect(result.utterances[0]!.transcription).toBe('crlf text');
  });

  it('无时间标记时使用回退值 | uses fallback times when missing', () => {
    const content = `\\ref r1
\\tx no time markers
`;
    const result = importFromToolbox(content);
    expect(result.utterances).toHaveLength(1);
    // startTime 回退为 index(0)，endTime 回退为 startTime+1
    expect(result.utterances[0]!.startTime).toBe(0);
    expect(result.utterances[0]!.endTime).toBe(1);
  });

  it('多行值拼接 | continuation lines are concatenated', () => {
    const content = `\\ref r1
\\ts 0.000
\\te 2.000
\\tx first part
  second part
`;
    const result = importFromToolbox(content);
    expect(result.utterances[0]!.transcription).toBe('first part second part');
  });

  it('空输入返回空结果 | empty input returns empty', () => {
    const result = importFromToolbox('');
    expect(result.utterances).toHaveLength(0);
    expect(result.additionalTiers.size).toBe(0);
  });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe('exportToToolbox', () => {
  it('输出基本标记流 | outputs basic marker stream', () => {
    const output = exportToToolbox({
      utterances: [makeUtt('u1', 0, 2.5, 'hello world')],
      layers: [makeLayer('l1', 'transcription', true)],
      translations: [],
    });
    expect(output).toContain('\\ref u1');
    expect(output).toContain('\\ts 0.000');
    expect(output).toContain('\\te 2.500');
    expect(output).toContain('\\tx hello world');
  });

  it('包含翻译层 \\ft | includes free translation from translation layer', () => {
    const trlLayer = makeLayer('trl1', 'translation');
    const translation: UtteranceTextDocType = {
      id: 'txt1',
      utteranceId: 'u1',
      layerId: 'trl1',
      modality: 'text',
      text: 'translated text',
    } as UtteranceTextDocType;

    const output = exportToToolbox({
      utterances: [makeUtt('u1', 0, 2, 'source')],
      layers: [makeLayer('l1', 'transcription', true), trlLayer],
      translations: [translation],
    });
    expect(output).toContain('\\ft translated text');
  });

  it('按 startTime 排序 | sorts by startTime', () => {
    const output = exportToToolbox({
      utterances: [
        makeUtt('u2', 3, 5, 'second'),
        makeUtt('u1', 0, 2, 'first'),
      ],
      layers: [makeLayer('l1', 'transcription', true)],
      translations: [],
    });
    const refIndices = [...output.matchAll(/\\ref (u\d)/g)].map((m) => m[1]);
    expect(refIndices).toEqual(['u1', 'u2']);
  });

  it('包含 token/morpheme 标记 | includes \\mb \\ge \\ps markers', () => {
    const output = exportToToolbox({
      utterances: [makeUtt('u1', 0, 1, 'I go')],
      layers: [makeLayer('l1', 'transcription', true)],
      translations: [],
      tokens: [
        { id: 'tok1', utteranceId: 'u1', tokenIndex: 0, form: { default: 'I' } },
        { id: 'tok2', utteranceId: 'u1', tokenIndex: 1, form: { default: 'go' } },
      ] as never[],
      morphemes: [
        { id: 'm1', tokenId: 'tok1', morphemeIndex: 0, form: { default: 'I' }, gloss: { eng: '1SG' } },
        { id: 'm2', tokenId: 'tok2', morphemeIndex: 0, form: { default: 'go' }, gloss: { eng: 'go' } },
      ] as never[],
    });
    expect(output).toContain('\\mb I go');
    expect(output).toContain('\\ge 1SG go');
  });

  it('往返一致性 | round-trip import → export → import', () => {
    const original = `\\ref r1
\\ts 0.000
\\te 2.500
\\tx hello world

\\ref r2
\\ts 2.500
\\te 5.000
\\tx second segment
`;
    const imported = importFromToolbox(original);
    const utts = imported.utterances.map((u, i) => makeUtt(`r${i + 1}`, u.startTime, u.endTime, u.transcription));
    const exported = exportToToolbox({
      utterances: utts,
      layers: [makeLayer('l1', 'transcription', true)],
      translations: [],
    });
    const reimported = importFromToolbox(exported);
    expect(reimported.utterances).toHaveLength(2);
    expect(reimported.utterances[0]!.transcription).toBe('hello world');
    expect(reimported.utterances[1]!.transcription).toBe('second segment');
  });
});

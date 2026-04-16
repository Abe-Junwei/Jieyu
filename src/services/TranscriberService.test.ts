// @vitest-environment jsdom
/**
 * TranscriberService 单元测试
 * Unit tests for .trs import/export
 */
import { describe, it, expect } from 'vitest';
import type { LayerDocType, OrthographyDocType, LayerUnitDocType } from '../db';
import { exportToTrs, importFromTrs } from './TranscriberService';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeUtt(overrides: Partial<LayerUnitDocType> & { startTime: number; endTime: number }): LayerUnitDocType {
  const { startTime, endTime, ...rest } = overrides;
  return {
    id: `u_${startTime}`,
    mediaId: 'media_1',
    layerId: 'layer_1',
    startTime,
    endTime,
    transcription: { default: '' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
  } as LayerUnitDocType;
}

function makeTranscriptionLayer(overrides?: Partial<LayerDocType>): LayerDocType {
  return {
    id: 'layer_1',
    textId: 'text_1',
    key: 'transcription_default',
    name: { eng: 'Transcription' },
    layerType: 'transcription',
    languageId: 'arb',
    modality: 'text',
    orthographyId: 'orth_rtl',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as LayerDocType;
}

function makeOrthography(overrides?: Partial<OrthographyDocType>): OrthographyDocType {
  return {
    id: 'orth_rtl',
    languageId: 'arb',
    name: { eng: 'Arabic RTL' },
    scriptTag: 'Arab',
    direction: 'rtl',
    bidiPolicy: {
      isolateInlineRuns: true,
      preferDirAttribute: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as OrthographyDocType;
}

// ── Export ────────────────────────────────────────────────────────────────────

describe('exportToTrs', () => {
  it('空 units 输出有效 XML | empty units yields valid XML', () => {
    const xml = exportToTrs({ units: [] });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<Trans');
    expect(xml).toContain('</Trans>');
  });

  it('包含说话人与多段文本 | includes speakers and segments', () => {
    const xml = exportToTrs({
      units: [
        makeUtt({ startTime: 0, endTime: 2, transcription: { default: 'hello' }, speakerId: 'spk1' }),
        makeUtt({ startTime: 2, endTime: 5, transcription: { default: 'world' }, speakerId: 'spk1' }),
      ],
      speakers: [{ id: 'spk1', name: 'Alice' }],
    });
    expect(xml).toContain('Speaker id="spk1" name="Alice"');
    expect(xml).toContain('<Sync');
    expect(xml).toContain('hello');
    expect(xml).toContain('world');
  });

  it('不同说话人拆分为不同 Turn | different speakers → separate Turns', () => {
    const xml = exportToTrs({
      units: [
        makeUtt({ startTime: 0, endTime: 2, transcription: { default: 'A says' }, speakerId: 'spk1' }),
        makeUtt({ startTime: 2, endTime: 4, transcription: { default: 'B says' }, speakerId: 'spk2' }),
      ],
      speakers: [
        { id: 'spk1', name: 'A' },
        { id: 'spk2', name: 'B' },
      ],
    });
    // 应有两个 Turn
    const turnCount = (xml.match(/<Turn /g) ?? []).length;
    expect(turnCount).toBe(2);
  });

  it('转义 XML 特殊字符 | escapes XML special chars', () => {
    const xml = exportToTrs({
      units: [
        makeUtt({ startTime: 0, endTime: 1, transcription: { default: '<b>"quoted" & \'apos\'' } }),
      ],
    });
    expect(xml).toContain('&lt;b&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
  });

  it('无 speakerId 的 unit 生成无 speaker 属性的 Turn | no speakerId → Turn without speaker attr', () => {
    const xml = exportToTrs({
      units: [
        makeUtt({ startTime: 0, endTime: 1, transcription: { default: 'text' } }),
      ],
    });
    // Turn 应不含 speaker=
    expect(xml).toMatch(/<Turn startTime/);
    expect(xml).not.toMatch(/<Turn speaker=/);
  });

  it('设置自定义 programTitle | custom programTitle', () => {
    const xml = exportToTrs({ units: [], programTitle: 'My Project' });
    expect(xml).toContain('program="My Project"');
  });

  it('按正字法策略包裹 bidi 隔离符并可正确回读 | wraps bidi isolates per orthography policy and strips them on import', () => {
    const xml = exportToTrs({
      units: [
        makeUtt({ startTime: 0, endTime: 1.5, transcription: { default: 'مرحبا' } }),
      ],
      orthographies: [makeOrthography()],
      transcriptionLayer: makeTranscriptionLayer(),
    });

    expect(xml).toContain(`\u2067مرحبا\u2069`);

    const imported = importFromTrs(xml);
    expect(imported.units[0]!.transcription).toBe('مرحبا');
  });

  it('导出并导入 Speaker xml:lang | exports and imports speaker xml:lang', () => {
    const xml = exportToTrs({
      units: [
        makeUtt({ startTime: 0, endTime: 1, transcription: { default: 'hello' }, speakerId: 'spk1' }),
      ],
      speakers: [{ id: 'spk1', name: 'Alice', lang: 'ar' }],
    });

    expect(xml).toContain('xml:lang="ar"');

    const imported = importFromTrs(xml);
    expect(imported.speakers[0]!.lang).toBe('ar');
  });
});

// ── Import ───────────────────────────────────────────────────────────────────

describe('importFromTrs', () => {
  it('解析说话人和语段 | parses speakers and units', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Trans SYSTEM "trans-14.dtd">
<Trans program="test" version="1">
  <Speakers>
    <Speaker id="spk1" name="Alice" />
  </Speakers>
  <Episode>
    <Section type="report" startTime="0.000" endTime="5.000">
      <Turn speaker="spk1" startTime="0.000" endTime="5.000">
        <Sync time="0.000"/>
        hello world
        <Sync time="2.500"/>
        second segment
      </Turn>
    </Section>
  </Episode>
</Trans>`;
    const result = importFromTrs(xml);
    expect(result.speakers).toHaveLength(1);
    expect(result.speakers[0]!.id).toBe('spk1');
    expect(result.speakers[0]!.name).toBe('Alice');
    expect(result.units).toHaveLength(2);
    expect(result.units[0]).toMatchObject({
      startTime: 0,
      endTime: 2.5,
      transcription: 'hello world',
      speakerId: 'spk1',
    });
    expect(result.units[1]).toMatchObject({
      startTime: 2.5,
      endTime: 5,
      transcription: 'second segment',
      speakerId: 'spk1',
    });
  });

  it('无 Sync 标签时整个 Turn 作为单段 | Turn without Sync → single segment', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="test" version="1">
  <Speakers></Speakers>
  <Episode>
    <Section type="report" startTime="0.000" endTime="3.000">
      <Turn startTime="0.000" endTime="3.000">
        entire turn text
      </Turn>
    </Section>
  </Episode>
</Trans>`;
    const result = importFromTrs(xml);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.transcription).toBe('entire turn text');
  });

  it('跳过空文本和零时长段 | skips empty and zero-duration segments', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="test" version="1">
  <Speakers></Speakers>
  <Episode>
    <Section type="report" startTime="0.000" endTime="5.000">
      <Turn startTime="0.000" endTime="5.000">
        <Sync time="0.000"/>
        <Sync time="0.000"/>
        <Sync time="2.000"/>
        valid text
      </Turn>
    </Section>
  </Episode>
</Trans>`;
    const result = importFromTrs(xml);
    // 第一个和第二个 Sync 之间时间相同/文本空 → 跳过
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.transcription).toBe('valid text');
  });

  it('解析 XML 失败时抛异常 | throws on invalid XML', () => {
    expect(() => importFromTrs('<not-valid')).toThrow();
  });

  it('解析 section topic | parses section topic', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="test" version="1">
  <Speakers></Speakers>
  <Episode>
    <Section type="report" topic="intro" startTime="0.000" endTime="2.000">
      <Turn startTime="0.000" endTime="2.000">
        <Sync time="0.000"/>
        text here
      </Turn>
    </Section>
  </Episode>
</Trans>`;
    const result = importFromTrs(xml);
    expect(result.units[0]!.topic).toBe('intro');
  });

  it('往返一致性 | round-trip consistency', () => {
    const original = [
      makeUtt({ startTime: 0, endTime: 2, transcription: { default: 'Line one' }, speakerId: 'spk1' }),
      makeUtt({ startTime: 2, endTime: 4.5, transcription: { default: 'Line two' }, speakerId: 'spk1' }),
      makeUtt({ startTime: 4.5, endTime: 7, transcription: { default: 'New speaker' }, speakerId: 'spk2' }),
    ];
    const xml = exportToTrs({
      units: original,
      speakers: [{ id: 'spk1', name: 'Alice' }, { id: 'spk2', name: 'Bob' }],
    });
    const imported = importFromTrs(xml);
    expect(imported.units).toHaveLength(3);
    expect(imported.units[0]!.transcription).toBe('Line one');
    expect(imported.units[0]!.speakerId).toBe('spk1');
    expect(imported.units[2]!.speakerId).toBe('spk2');
    expect(imported.speakers).toHaveLength(2);
  });
});

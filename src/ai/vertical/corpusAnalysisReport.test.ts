import { describe, expect, it } from 'vitest';
import {
  analysisRowsFromEvidencePackets,
  analysisRowsFromToolResults,
  renderVerifiedAnalysisReport,
} from './corpusAnalysisReport';
import { buildEvidencePacketV0 } from './evidencePacket';

const raw = JSON.stringify({
  claims: [
    { claimId: 'c1', text: '过去时只出现在这个动词之后。', rowIds: ['m2'] },
    { claimId: 'c2', text: '这条没有出处。', rowIds: ['missing'] },
  ],
});

describe('renderVerifiedAnalysisReport', () => {
  it('keeps cited rows and fills the example from the tool hit, not the claim', () => {
    const rows = analysisRowsFromToolResults([
      {
        ok: true,
        result: {
          hits: [{ morphemeId: 'm2', unitId: 'u1', target: { form: 'ka', gloss: 'go' } }],
        },
      },
    ]);
    const report = renderVerifiedAnalysisReport(raw, rows);
    expect(report.kept).toBe(1);
    expect(report.dropped).toBe(1);
    expect(report.text).toBe('过去时只出现在这个动词之后。\n- u1 ka go');
    expect(report.text).not.toContain('没有出处');
  });

  it('emits no body when every claim fails', () => {
    const report = renderVerifiedAnalysisReport(raw, []);
    expect(report).toEqual({ text: '', kept: 0, dropped: 2 });
  });

  it('writes 尚未标注 when the stored gloss is empty', () => {
    const report = renderVerifiedAnalysisReport(
      JSON.stringify({ claims: [{ claimId: 'c1', text: '这一句是反例。', rowIds: ['u2'] }] }),
      [{ id: 'u2', unitId: 'u2', form: 'na', gloss: '' }],
    );
    expect(report.text).toBe('这一句是反例。\n- u2 na 尚未标注');
  });

  it('renders literature citations from evidence packets', () => {
    const packet = buildEvidencePacketV0({
      id: 'ev_ext_literature_h1',
      sourceType: 'document',
      sourceId: 'h1',
      title: 'A Grammar',
      page: '42',
      quote: 'The suffix marks past tense.',
    });
    const rows = analysisRowsFromEvidencePackets([packet]);
    const report = renderVerifiedAnalysisReport(
      JSON.stringify({
        claims: [{ claimId: 'c1', text: '文献也记过同样的分布。', rowIds: [packet.id] }],
      }),
      rows,
    );
    expect(report.text).toBe(
      '文献也记过同样的分布。\n- A Grammar p.42 「The suffix marks past tense.」',
    );
  });
});

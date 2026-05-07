import { describe, expect, it } from 'vitest';
import {
  evidenceSourceRefFromCitation,
  evidenceSourceRefFromEvidencePacket,
  evidenceSourceRefsFromToolCallForAudit,
  formatEvidenceSourceRefForAudit,
} from './evidenceSourceRef';

describe('evidenceSourceRef', () => {
  it('formats citation refs', () => {
    const ref = evidenceSourceRefFromCitation({ type: 'unit', refId: 'u-1' });
    expect(formatEvidenceSourceRefForAudit(ref)).toBe('citation:unit:u-1');
  });

  it('formats evidence_packet refs', () => {
    const ref = evidenceSourceRefFromEvidencePacket({ sourceType: 'segment', sourceId: 'seg-9' });
    expect(formatEvidenceSourceRefForAudit(ref)).toBe('evidence_packet:segment:seg-9');
  });

  it('extracts audit ref strings from tool call arguments', () => {
    expect(
      evidenceSourceRefsFromToolCallForAudit({
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['a', 'b'] },
      }),
    ).toEqual(['evidence_packet:segment:a', 'evidence_packet:segment:b']);
  });

  it('collects nested propose_changes child tool args', () => {
    expect(
      evidenceSourceRefsFromToolCallForAudit({
        name: 'propose_changes',
        arguments: {
          changes: [
            {
              tool: 'set_transcription_text',
              arguments: { segmentId: 'seg-in-1', text: 'x' },
            },
          ],
        },
      }),
    ).toEqual(['evidence_packet:segment:seg-in-1']);
  });
});

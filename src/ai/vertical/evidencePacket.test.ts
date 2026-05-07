import { describe, expect, it } from 'vitest';
import { buildEvidencePacketV0 } from './evidencePacket';

describe('EvidencePacketV0 (P1 binding)', () => {
  it('preserves sourceSetId and sourceSetSnapshot on build', () => {
    const packet = buildEvidencePacketV0({
      id: 'ep-1',
      sourceType: 'segment',
      sourceId: 'seg-1',
      sourceSetId: 'set-a',
      sourceSetSnapshot: {
        sourceSetId: 'set-a',
        scope: 'selection',
        memberCount: 3,
        mediaId: 'm-1',
      },
    });
    expect(packet.sourceSetId).toBe('set-a');
    expect(packet.sourceSetSnapshot).toEqual({
      sourceSetId: 'set-a',
      scope: 'selection',
      memberCount: 3,
      mediaId: 'm-1',
    });
  });
});

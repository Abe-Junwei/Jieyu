/**
 * ADR-0048：经业务接口写入，由实现夹具独立重查持久化结果。
 * Dexie 实现在 `storagePort.test.ts` 里跑；SQLite 实现（#275）拿同一个函数跑。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { recordingRemovalBlockReason, type StoragePort } from './storagePort';
import type { AuditLogDocType } from './types';

const NOW = '2026-10-15T00:00:00.000Z';

function turn(conversationId: string, expiresAt: number) {
  return { conversationId, createdAt: 1, expiresAt, messages: [{ role: 'user', content: 'hi' }] };
}

function audit(id: string): AuditLogDocType {
  return {
    id,
    collection: 'ai_messages',
    documentId: 'doc-1',
    action: 'update',
    source: 'ai',
    timestamp: NOW,
    requestId: `req-${id}`,
  };
}

export function describeStoragePortContract(
  name: string,
  port: () => StoragePort,
  reset: () => Promise<void>,
  seedMixedSelection: () => Promise<{
    textId: string;
    segmentId: string;
    unitId: string;
    readback: (speakerId: string) => Promise<{
      speakerId: string | undefined;
      segmentSpeakerId: string | undefined;
      unitSpeakerId: string | undefined;
      projectSpeakerIds: string[] | undefined;
    }>;
  }>,
): void {
  describe(`storage port contract: ${name}`, () => {
    beforeEach(reset);

    it('reads a turn back after writing it, and the second write wins', async () => {
      await port().turns.putTurn(turn('c1', 50));
      await port().turns.putTurn(turn('c1', 70));
      await expect(port().turns.getTurn('c1')).resolves.toMatchObject({
        conversationId: 'c1',
        expiresAt: 70,
        messages: [{ role: 'user', content: 'hi' }],
      });
    });

    it('deletes a turn, and deleting a missing turn is not an error', async () => {
      await port().turns.putTurn(turn('c1', 50));
      await port().turns.deleteTurn('c1');
      await port().turns.deleteTurn('absent');
      await expect(port().turns.getTurn('c1')).resolves.toBeUndefined();
    });

    it('sweeps expired turns and keeps live ones', async () => {
      await port().turns.putTurn(turn('old', 10));
      await port().turns.putTurn(turn('live', 80));
      await port().turns.sweepExpiredTurns(20);
      await expect(port().turns.getTurn('old')).resolves.toBeUndefined();
      await expect(port().turns.getTurn('live')).resolves.toMatchObject({ conversationId: 'live' });
    });

    it('reads an audit row back after inserting it', async () => {
      await port().audit.insertAuditLog(audit('audit-1'));
      await expect(port().audit.getAuditLog('audit-1')).resolves.toMatchObject({
        id: 'audit-1',
        requestId: 'req-audit-1',
        timestamp: NOW,
      });
    });

    it('has no fingerprint for an unknown id', async () => {
      await expect(port().fingerprintTarget('missing')).resolves.toBeUndefined();
    });

    it('refuses to remove a recording id that is not stored', async () => {
      await expect(port().removeEmptyRecording('missing-media')).rejects.toSatisfy(
        (error: unknown) => recordingRemovalBlockReason(error) === 'missing',
      );
    });

    it('creates a speaker and assigns a mixed selection as one operation', async () => {
      const { textId, segmentId, unitId, readback } = await seedMixedSelection();
      const result = await port().assignSpeakerToMixedSelection({
        textId,
        segmentIds: [segmentId],
        unitIds: [unitId],
        createSpeaker: { name: 'Speaker', textId },
      });
      expect(result).toMatchObject({ segments: 1, units: 1, created: true });
      expect(result.speaker?.name).toBe('Speaker');
      expect(await readback(result.speaker!.id)).toEqual({
        speakerId: result.speaker?.id,
        segmentSpeakerId: result.speaker?.id,
        unitSpeakerId: result.speaker?.id,
        projectSpeakerIds: [result.speaker?.id],
      });
      const repeated = await port().assignSpeakerToMixedSelection({
        textId,
        segmentIds: [segmentId],
        unitIds: [unitId],
        createSpeaker: { name: 'Speaker', textId },
      });
      expect(repeated).toMatchObject({ segments: 1, units: 1 });
      expect(repeated.speaker?.id).toBe(result.speaker?.id);
      expect(repeated.created).toBeUndefined();
    });
  });
}

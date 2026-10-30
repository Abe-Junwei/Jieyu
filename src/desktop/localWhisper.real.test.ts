import { afterEach, expect, it } from 'vitest';
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { seed, disposeModelFixtures } from '../test/desktopModelFixture';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { requireDesktopSession } from '../db/desktop/projectSession';
import { pcmWav } from './transcriptionAudio';
import { startLocalWhisper, stopLocalWhisper } from './localWhisper';
import { transcribeProject } from './projectTranscription';
const model = process.env.JIEYU_WHISPER_REAL_MODEL;
const audio = process.env.JIEYU_WHISPER_SYNTHETIC_AUDIO;
const cli = process.env.WHISPER_CLI;
afterEach(async () => {
  await stopLocalWhisper();
  await disposeModelFixtures();
});
it.skipIf(!model || !audio || !cli)(
  'runs the real Whisper binary on synthetic speech and reopens accepted text and provenance',
  async () => {
    const s = await seed();
    const bytes = readFileSync(audio!);
    const duration = pcmWav(bytes).duration;
    copyFileSync(audio!, join(s.dir, 'synthetic.wav'));
    const media = callDesktopSession(s.sessionId, 'media.create', {
      relpath: 'synthetic.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration,
    }) as { id: string };
    const manuscript = callDesktopSession(s.sessionId, 'manuscripts.create', {
      title: { und: 'Synthetic speech' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(s.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { und: 'Transcript' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const grant = await startLocalWhisper(s.sessionId, model!, cli!);
    const result = await transcribeProject(s.sessionId, {
      modelId: grant.id,
      manuscriptId: manuscript.id,
      layerId: layer.id,
      start: 0,
      end: duration,
      requestId: 'real-whisper',
    });
    expect(result.status).toBe('ok');
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const row of result.candidates) {
      expect(row.text).toMatch(/[a-z]/i);
      callDesktopSession(s.sessionId, 'modelRuns.accept', {
        operationId: `real-${row.candidateId}`,
        runId: result.runId,
        chunkIndex: row.chunkIndex,
        segmentIndex: row.segmentIndex,
        mediaStart: row.mediaStart,
        mediaEnd: row.mediaEnd,
        timeMappingRevision: result.timeMappingRevision,
        targetFingerprint: row.targetFingerprint,
        text: row.text,
      });
    }
    await stopLocalWhisper();
    callDesktopSession(s.sessionId, 'reopen', {});
    expect(callDesktopSession(s.sessionId, 'units.list', { layerId: layer.id })).toMatchObject(
      result.candidates.map((row) => ({ text: row.text })),
    );
    expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject(
      {
        status: 'ok',
        modelId: 'app.jieyu.whisper.tiny',
        acceptedCount: result.candidates.length,
        pendingCount: 0,
      },
    );
    const rows = requireDesktopSession(s.sessionId)
      .db.prepare(
        'SELECT provenance_json FROM unit_texts JOIN units ON units.id=unit_texts.unit_id WHERE units.layer_id=?',
      )
      .all(layer.id) as { provenance_json: string }[];
    for (const row of rows)
      expect(JSON.parse(row.provenance_json)).toMatchObject({
        actorType: 'ai',
        reviewStatus: 'confirmed',
        params: { modelRunId: result.runId },
      });
  },
  120_000,
);

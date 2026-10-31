import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { startLocalWhisper, stopLocalWhisper } from './localWhisper';
import { transcribeProject } from './projectTranscription';
import { seed, disposeModelFixtures } from '../test/desktopModelFixture';
import { callDesktopSession } from '../db/desktop/desktopCall';

vi.mock('../tools/whisper-server/desktopWhisperModels.json', () => ({
  default: [
    {
      name: 'fixture',
      sizeBytes: 13,
      sha256: 'c7a3a8c7435ef8e4cf1ca2d261f7e09ca85de6cdb70f7c689a836680523a180c',
      license: 'MIT',
    },
  ],
}));
const dirs: string[] = [];
afterEach(async () => {
  await stopLocalWhisper();
  await disposeModelFixtures();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function files(hold = false) {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-local-whisper-test-'));
  dirs.push(dir);
  const model = join(dir, 'model.bin'),
    cli = join(dir, 'cli'),
    trace = join(dir, 'trace');
  writeFileSync(model, 'fixture model');
  writeFileSync(
    cli,
    `#!${process.execPath}\nconst fs=require('fs');const a=process.argv;const model=a[a.indexOf('-m')+1];if(fs.readFileSync(model,'utf8')!=='fixture model')process.exit(2);fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify({pid:process.pid,model}));${hold ? 'setInterval(()=>{},1000);' : "fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{offsets:{from:0,to:1000},text:'local candidate'}]}));"}`,
    { mode: 0o700 },
  );
  return { dir, model, cli, trace };
}
async function input() {
  const s = await seed();
  const bytes = readFileSync(join(s.dir, 'clip.wav'));
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  writeFileSync(join(s.dir, '16k.wav'), bytes);
  const media = callDesktopSession(s.sessionId, 'media.create', {
    relpath: '16k.wav',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    duration: 1,
  }) as { id: string };
  const ms = callDesktopSession(s.sessionId, 'manuscripts.create', {
    title: { und: 'Synthetic' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(s.sessionId, 'layers.create', {
    manuscriptId: ms.id,
    key: 'tx',
    name: { und: 'Transcript' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return { ...s, manuscriptId: ms.id, layerId: layer.id };
}
it('uses verified private weights, accepts through the existing transaction and reads back after reopen', async () => {
  const s = await input(),
    f = files();
  const model = await startLocalWhisper(s.sessionId, f.model, f.cli);
  writeFileSync(f.model, 'changed model');
  const result = await transcribeProject(s.sessionId, {
    modelId: model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 1,
    requestId: 'local',
  });
  expect(result.status).toBe('ok');
  const row = result.candidates[0]!;
  callDesktopSession(s.sessionId, 'modelRuns.accept', {
    operationId: 'local-accept',
    runId: result.runId,
    chunkIndex: row.chunkIndex,
    segmentIndex: row.segmentIndex,
    mediaStart: row.mediaStart,
    mediaEnd: row.mediaEnd,
    timeMappingRevision: result.timeMappingRevision,
    targetFingerprint: row.targetFingerprint,
    text: row.text,
  });
  await stopLocalWhisper();
  const trace = JSON.parse(readFileSync(f.trace, 'utf8'));
  expect(existsSync(dirname(trace.model))).toBe(false);
  callDesktopSession(s.sessionId, 'reopen', {});
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toMatchObject([
    { text: 'local candidate' },
  ]);
  expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject({
    status: 'ok',
    acceptedCount: 1,
    modelId: 'app.jieyu.whisper.fixture',
  });
});
it('rejects a corrupt weight without clearing the previous selection', async () => {
  const s = await input(),
    f = files();
  const model = await startLocalWhisper(s.sessionId, f.model, f.cli);
  writeFileSync(f.model, 'changed model');
  await expect(startLocalWhisper(s.sessionId, f.model, f.cli)).rejects.toThrow('checksum');
  expect(
    (
      await transcribeProject(s.sessionId, {
        modelId: model.id,
        manuscriptId: s.manuscriptId,
        layerId: s.layerId,
        start: 0,
        end: 1,
        requestId: 'retained',
      })
    ).status,
  ).toBe('ok');
});
it('stopping the service kills its CLI and leaves no pending candidate', async () => {
  const s = await input(),
    f = files(true);
  const model = await startLocalWhisper(s.sessionId, f.model, f.cli);
  const pending = transcribeProject(s.sessionId, {
    modelId: model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 1,
    requestId: 'stop',
  });
  await expect.poll(() => existsSync(f.trace)).toBe(true);
  const trace = JSON.parse(readFileSync(f.trace, 'utf8'));
  await stopLocalWhisper();
  expect((await pending).candidates).toEqual([]);
  expect(() => process.kill(trace.pid, 0)).toThrow();
  expect(existsSync(dirname(trace.model))).toBe(false);
});

it('invalidates a model startup already in flight before allowing another selection', async () => {
  const s = await input(),
    f = files();
  const pending = startLocalWhisper(s.sessionId, f.model, f.cli);
  const rejected = expect(pending).rejects.toThrow('model selection expired');
  await stopLocalWhisper();
  await rejected;
  const model = await startLocalWhisper(s.sessionId, f.model, f.cli);
  expect(model.modelId).toBe('app.jieyu.whisper.fixture');
});

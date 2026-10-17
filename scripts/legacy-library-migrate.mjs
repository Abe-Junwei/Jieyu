/**
 * 合成快照写成音频文件和 .jyd。失败时删掉这次写出的项目文件，旧库文件一个字节不改。
 * 运行：node --experimental-sqlite --test scripts/legacy-library-migrate.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyPlan, readProject } from './apply-legacy-plan.mjs';

test('a failed migration leaves the old library file unchanged and no project files behind', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jieyu-migrate-'));
  try {
    const oldFile = path.join(dir, 'old-library.json');
    fs.writeFileSync(
      oldFile,
      JSON.stringify({ marker: 'old-library', audioBytes: 'synthetic-wav' }),
    );
    const before = fs.readFileSync(oldFile);
    const dest = path.join(dir, 'project');
    const plan = {
      audios: [
        {
          audioId: 'audio-a',
          fileName: '录音01.wav',
          sha256: createHash('sha256').update('synthetic-wav').digest('hex'),
          bytes: Buffer.from('synthetic-wav'),
        },
      ],
      manuscripts: [
        {
          id: 'doc-1',
          sourceDocumentId: 'doc-1',
          fileName: '录音01.jyd',
          audioId: 'audio-a',
          units: [{ id: 'u-1', mediaId: 'audio-a' }],
        },
      ],
    };
    assert.throws(() => applyPlan(plan, dest, { failAfterAudio: true }), /injected failure/);
    assert.deepEqual(fs.readFileSync(oldFile), before);
    assert.equal(fs.existsSync(path.join(dest, '录音01.wav')), false);
    assert.equal(fs.existsSync(path.join(dest, 'project.sqlite')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failure while writing the project database removes the partial database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jieyu-migrate-db-'));
  try {
    const dest = path.join(dir, 'project');
    const plan = {
      audios: [
        {
          audioId: 'audio-a',
          fileName: '录音01.wav',
          sha256: createHash('sha256').update('synthetic-wav').digest('hex'),
          bytes: Buffer.from('synthetic-wav'),
        },
      ],
      manuscripts: [
        {
          id: 'doc-1',
          sourceDocumentId: 'doc-1',
          fileName: '录音01.jyd',
          audioId: 'audio-a',
          units: [{ id: 'u-1', mediaId: 'audio-a' }],
        },
      ],
    };
    assert.throws(
      () => applyPlan(plan, dest, { failDuringProject: true }),
      /injected project failure/,
    );
    assert.equal(fs.existsSync(path.join(dest, '录音01.wav')), false);
    assert.equal(fs.existsSync(path.join(dest, 'project.sqlite')), false);
    assert.equal(fs.existsSync(path.join(dest, 'project.sqlite-journal')), false);
    assert.equal(fs.existsSync(path.join(dest, '录音01.jyd')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a ready plan writes the audio and the manuscript, then reads the same ids back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jieyu-migrate-ok-'));
  try {
    const bytes = Buffer.from('synthetic-wav');
    const plan = {
      audios: [
        {
          audioId: 'audio-a',
          fileName: '录音01.wav',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes,
        },
      ],
      manuscripts: [
        {
          id: 'doc-1',
          sourceDocumentId: 'doc-1',
          fileName: '录音01.jyd',
          audioId: 'audio-a',
          units: [
            { id: 'u-1', mediaId: 'audio-a' },
            { id: 'u-2', mediaId: 'audio-a', parentUnitId: 'u-1' },
          ],
        },
      ],
    };
    const dest = path.join(dir, 'project');
    applyPlan(plan, dest);
    assert.equal(fs.readFileSync(path.join(dest, '录音01.wav')).toString(), 'synthetic-wav');
    assert.deepEqual(readProject(dest), {
      project: null,
      speakers: [],
      languages: [],
      displayNames: [],
      aliases: [],
      orthographies: [],
      sourceRecords: [],
      lexemes: [],
      phonemes: [],
      abbreviations: [],
      tagDefinitions: [],
      bibliographicSources: [],
      locations: [],
      grammarDocs: [],
      orthographyBridges: [],
      customFields: [],
      catalogHistory: [],
      lexemeAssets: [],
      lexemeAssetLinks: [],
      structuralRules: [],
      conversations: [],
      aiMessages: [],
      aiTasks: [],
      aiTaskSnapshots: [],
      projectMemories: [],
      agentArtifacts: [],
      aiSourceSets: [],
      notes: [],
      audios: [{ id: 'audio-a', relPath: '录音01.wav', sha256: plan.audios[0].sha256 }],
      manuscripts: [
        {
          fileName: '录音01.jyd',
          id: 'doc-1',
          audioId: 'audio-a',
          sourceDocumentId: 'doc-1',
          layers: [],
          tokens: [],
          morphemes: [],
          definitions: {
            languages: [],
            displayNames: [],
            aliases: [],
            orthographies: [],
            speakers: [],
          },
          sourceIds: [],
          lexemeLinks: [],
          anchors: [],
          contents: [],
          relations: [],
          notes: [],
          layerLinks: [],
          tracks: [],
          annotations: [],
          units: [
            { id: 'u-1', layerId: null, mediaId: 'audio-a', parentUnitId: null },
            { id: 'u-2', layerId: null, mediaId: 'audio-a', parentUnitId: 'u-1' },
          ],
        },
      ],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * 合成规划写成音频文件和 .jyd。目标文件夹已有东西时写之前就拒绝，原有文件一个字节不改；
 * 失败或被杀掉时目标里没有结果文件，只删这次建出来的路径。
 * 运行：node --experimental-sqlite --test scripts/legacy-library-migrate.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyPlan, DestinationNotEmptyError, readProject } from './apply-legacy-plan.mjs';
import { killWhenReady } from './lib/sigkill-harness.mjs';

const APPLY_MODULE = fileURLToPath(new URL('./apply-legacy-plan.mjs', import.meta.url));

function samplePlan() {
  const bytes = Buffer.from('synthetic-wav');
  return {
    status: 'ready',
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
}

function withDir(prefix, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return Promise.resolve()
    .then(() => run(dir))
    .finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

function snapshot(dir) {
  const out = {};
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return out;
}

test('a destination that already holds a project is refused and every file stays byte-identical', () =>
  withDir('jieyu-migrate-existing-', (dir) => {
    const dest = path.join(dir, 'project');
    applyPlan(samplePlan(), dest);
    fs.writeFileSync(path.join(dest, '录音01.wav'), 'USER-ORIGINAL');
    fs.writeFileSync(path.join(dest, 'notes.txt'), 'user notes');
    const before = snapshot(dest);
    assert.deepEqual(Object.keys(before).sort(), [
      'notes.txt',
      'project.sqlite',
      '录音01.jyd',
      '录音01.wav',
    ]);
    assert.throws(() => applyPlan(samplePlan(), dest), DestinationNotEmptyError);
    assert.deepEqual(snapshot(dest), before);
    assert.deepEqual(fs.readdirSync(dest).sort(), Object.keys(before).sort());
  }));

test('a plan that is not ready writes nothing', () =>
  withDir('jieyu-migrate-status-', (dir) => {
    const dest = path.join(dir, 'project');
    assert.throws(() => applyPlan({ ...samplePlan(), status: 'needs-confirm' }, dest), /not ready/);
    assert.throws(() => applyPlan({ ...samplePlan(), status: undefined }, dest), /not ready/);
    assert.equal(fs.existsSync(dest), false);
  }));

test('a file name that leaves the destination or collides by case is refused before writing', () =>
  withDir('jieyu-migrate-names-', (dir) => {
    const dest = path.join(dir, 'project');
    for (const fileName of ['../escaped.jyd', 'a/b.jyd', '..', 'CON:.jyd', 'x.jyd ', '']) {
      const plan = samplePlan();
      plan.manuscripts[0].fileName = fileName;
      assert.throws(() => applyPlan(plan, dest), /unsafe file name/, fileName);
    }
    const twin = samplePlan();
    twin.audios[0].fileName = 'Rec.wav';
    twin.audios.push({ ...twin.audios[0], audioId: 'audio-b', fileName: 'rec.WAV' });
    assert.throws(() => applyPlan(twin, dest), /duplicate file name/);
    const asProject = samplePlan();
    asProject.audios[0].fileName = 'Project.SQLite';
    assert.throws(() => applyPlan(asProject, dest), /duplicate file name/);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(fs.readdirSync(dir), []);
  }));

test('an injected failure removes the destination it created and keeps one it did not', () =>
  withDir('jieyu-migrate-fail-', (dir) => {
    const fresh = path.join(dir, 'nested', 'project');
    assert.throws(() => applyPlan(samplePlan(), fresh, { failAfterAudio: true }), /injected failure/);
    assert.equal(fs.existsSync(path.join(dir, 'nested')), false);

    const existing = path.join(dir, 'existing');
    fs.mkdirSync(existing);
    assert.throws(
      () => applyPlan(samplePlan(), existing, { failDuringProject: true }),
      /injected project failure/,
    );
    assert.deepEqual(fs.readdirSync(existing), []);
  }));

test('a cleanup step that fails does not stop the rest of the cleanup', () =>
  withDir('jieyu-migrate-cleanup-', (dir) => {
    const dest = path.join(dir, 'project');
    const error = (() => {
      try {
        applyPlan(samplePlan(), dest, {
          onStep(step) {
            if (step !== 'published') return;
            const projectFile = path.join(dest, 'project.sqlite');
            fs.rmSync(projectFile);
            fs.mkdirSync(projectFile);
            fs.writeFileSync(path.join(projectFile, 'blocker'), 'x');
            throw new Error('injected after publish');
          },
        });
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    assert.match(error?.message ?? '', /injected after publish/);
    assert.equal(error.cleanupErrors.length, 2);
    assert.deepEqual(fs.readdirSync(dest), ['project.sqlite']);
  }));

test('a failure while writing the project database removes the partial database', () =>
  withDir('jieyu-migrate-db-', (dir) => {
    const dest = path.join(dir, 'project');
    assert.throws(
      () => applyPlan(samplePlan(), dest, { failDuringProject: true }),
      /injected project failure/,
    );
    assert.equal(fs.existsSync(dest), false);
  }));

for (const killAt of ['audio', 'project-rows', 'manuscript-rows', 'staged', 'published']) {
  test(`apply killed at ${killAt} leaves no partial results and keeps files outside the destination`, () =>
    withDir('jieyu-migrate-kill-', async (dir) => {
      const outside = path.join(dir, 'outside.wav');
      fs.writeFileSync(outside, 'original-audio');
      const sibling = path.join(dir, 'other-project');
      applyPlan({ ...samplePlan() }, sibling);
      const before = snapshot(dir);

      const plan = samplePlan();
      const planFile = path.join(dir, 'plan.json');
      fs.writeFileSync(
        planFile,
        JSON.stringify({
          ...plan,
          audios: plan.audios.map((audio) => ({ ...audio, bytes: audio.bytes.toString('base64') })),
        }),
      );
      const child = path.join(dir, 'child.mjs');
      fs.writeFileSync(
        child,
        `import fs from 'node:fs';
import { applyPlan } from ${JSON.stringify(APPLY_MODULE)};
const raw = JSON.parse(fs.readFileSync(process.env.PLAN, 'utf8'));
raw.audios = raw.audios.map((audio) => ({ ...audio, bytes: Buffer.from(audio.bytes, 'base64') }));
applyPlan(raw, process.env.DEST, {
  onStep(step) {
    if (step !== process.env.KILL_AT) return;
    fs.writeSync(1, 'ready\\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  },
});
`,
      );
      const dest = path.join(dir, 'project');
      await killWhenReady(child, { env: { PLAN: planFile, DEST: dest, KILL_AT: killAt } });

      const after = snapshot(dir);
      for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, file);
      const top = fs.existsSync(dest) ? fs.readdirSync(dest) : [];
      if (killAt === 'published') {
        assert.deepEqual(top.sort(), ['project.sqlite', '录音01.jyd', '录音01.wav']);
        assert.deepEqual(
          readProject(dest).manuscripts.map((manuscript) => manuscript.id),
          ['doc-1'],
        );
      } else {
        assert.deepEqual(
          top.filter((name) => !name.startsWith('.jieyu-staging-')),
          [],
          `results leaked into dest: ${top.join(', ')}`,
        );
        assert.throws(() => applyPlan(samplePlan(), dest), DestinationNotEmptyError);
      }
    }));
}

test('a ready plan writes the audio and the manuscript, then reads the same ids back', () =>
  withDir('jieyu-migrate-ok-', (dir) => {
    const plan = samplePlan();
    const dest = path.join(dir, 'project');
    const result = applyPlan(plan, dest);
    assert.deepEqual(result.files, ['录音01.wav', '录音01.jyd', 'project.sqlite']);
    assert.deepEqual(fs.readdirSync(dest).sort(), ['project.sqlite', '录音01.jyd', '录音01.wav']);
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
  }));

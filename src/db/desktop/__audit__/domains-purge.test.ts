import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { openProject } from '../openProject';
import { createDefinition } from '../customFields';
import { previewPurge, purgeDefinition } from '../customFieldPurge';
import { applyAnalysis } from '../analysis';
import { writeAnalysisRoot } from '../units';
import { deleteManuscript } from '../manuscripts';
it('purges a definition from retained deleted manuscript graph', () => {
  const folder = mkdtempSync(join(tmpdir(), 'audit-purge-'));
  const p = openProject(folder);
  try {
    const t = '2026-10-29T00:00:00Z';
    p.db
      .prepare(
        'INSERT INTO media(id,relpath,sha256,filename,duration,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run('m', 'a.wav', 'a', 'a.wav', 1, t);
    const m = p.manuscripts.create({ title: { und: 'm' }, mediaId: 'm' });
    const l = p.layers.create({
      manuscriptId: m.id,
      key: 'tx',
      name: { und: 'tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const u = p.units.create({ layerId: l.id, startTime: 0, endTime: 1, text: 'ka' });
    const root = writeAnalysisRoot(p.db, {
      unitId: u.id,
      expectedAnalysisGeneration: 0,
      graph: {
        payloadVersion: 1,
        id: 'g',
        text: 'ka',
        nodes: [
          {
            id: 'n',
            type: 'token',
            label: 'ka',
            domain: {
              form: { default: 'ka' },
              index: 0,
              createdAt: t,
              updatedAt: t,
              provenance: { actorType: 'human', method: 'manual', createdAt: t },
            },
          },
        ],
        relations: [],
      },
    });
    const d = createDefinition(p.db, {
      targetType: 'analysis-node',
      name: { und: 'x' },
      fieldType: 'number',
    });
    applyAnalysis(p.db, {
      unitId: u.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: root.analysisGeneration,
        graphFingerprint: root.graphFingerprint,
      },
      changes: [{ action: 'customField.set', nodeId: 'n', definitionId: d.id, value: 3 }],
    });
    deleteManuscript(p.db, m.id);
    const preview = previewPurge(p.db, d.id);
    expect(() =>
      purgeDefinition(p.db, {
        definitionId: d.id,
        expectedRevision: preview.revision,
        previewFingerprint: preview.previewFingerprint,
      }),
    ).not.toThrow();
  } finally {
    p.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

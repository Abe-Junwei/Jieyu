/**
 * ProvenanceEnvelope.params（自动切分参数）经 JYT / JYM / JYB 往返后原样保留。
 * ProvenanceEnvelope.params (auto-segmentation parameters) survive JYT / JYM / JYB round trips.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LayerUnitDocType, type ProvenanceEnvelope } from '../db';
import { exportProjectToJyt, restoreJytAsNewProject } from './JytService';
import { exportProjectToJym, restoreJymAsNewProject } from './JymService';
import { disasterRestoreFromJyb, exportDatabaseToJyb, importJybProjectsAsNew } from './JybService';
import { buildAutoSegmentationProvenance } from './vad/autoSegmentationProvenance';

const NOW = '2026-10-09T01:00:00.000Z';
const P = 'pParams';

const provenance: ProvenanceEnvelope = buildAutoSegmentationProvenance(
  { engine: 'silero', source: 'cache' },
  NOW,
);

async function seed(): Promise<void> {
  await db.texts.put({ id: P, title: { default: 'Params' }, createdAt: NOW, updatedAt: NOW });
  await db.media_items.put({
    id: `${P}-media`,
    textId: P,
    filename: 'field.wav',
    duration: 2,
    isOfflineCached: false,
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
    createdAt: NOW,
  });
  await db.layer_units.put({
    id: `${P}-unit`,
    textId: P,
    mediaId: `${P}-media`,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    provenance,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType);
}

async function unitOf(projectId: string): Promise<LayerUnitDocType> {
  const units = await db.layer_units.where('textId').equals(projectId).toArray();
  expect(units).toHaveLength(1);
  return units[0]!;
}

describe('provenance.params round trip', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await seed();
  });

  it('the stored unit keeps the full envelope', async () => {
    expect((await db.layer_units.get(`${P}-unit`))?.provenance).toEqual(provenance);
    expect(provenance.params).toMatchObject({
      engine: 'silero',
      source: 'cache',
      vadModel: 'silero_vad.onnx',
      speechThreshold: 0.5,
      mergeGapSec: 0.3,
      minDurationSec: 0.2,
      maxDurationSec: 30,
    });
  });

  it('write validation rejects nested, non-finite or oversized params', async () => {
    const base = (await db.layer_units.get(`${P}-unit`))!;
    const withParams = (params: unknown) =>
      db.layer_units.put({ ...base, provenance: { ...provenance, params } } as never);
    await expect(withParams({ nested: { a: 1 } })).rejects.toThrow(/provenance/);
    await expect(withParams({ gap: Number.NaN })).rejects.toThrow(/provenance/);
    await expect(withParams({ s: 'x'.repeat(257) })).rejects.toThrow(/provenance/);
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i]));
    await expect(withParams(many)).rejects.toThrow(/provenance/);
    expect((await db.layer_units.get(`${P}-unit`))?.provenance).toEqual(provenance);
  });

  it('JYT restore as a new project', async () => {
    const restored = await restoreJytAsNewProject(await exportProjectToJyt(P));
    expect((await unitOf(restored.projectId)).provenance).toEqual(provenance);
  });

  it('JYM restore as a new project', async () => {
    const restored = await restoreJymAsNewProject(await exportProjectToJym(P));
    expect((await unitOf(restored.projectId)).provenance).toEqual(provenance);
  });

  it('JYB per-project import and disaster restore', async () => {
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    const imported = await importJybProjectsAsNew(archive);
    const newId = imported.projects.map((p) => p.projectId).find((id) => id !== P)!;
    expect((await unitOf(newId)).provenance).toEqual(provenance);

    await disasterRestoreFromJyb(archive);
    expect((await db.layer_units.get(`${P}-unit`))?.provenance).toEqual(provenance);
  });
});

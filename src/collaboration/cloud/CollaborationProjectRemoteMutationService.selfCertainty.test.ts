import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type LayerUnitDocType } from '../../db';
import { applyCollaborationRemoteMutation } from './CollaborationProjectRemoteMutationService';
import type { CollaborationProjectChangeRecord } from './syncTypes';

const NOW = '2026-10-23T00:00:00.000Z';
const PROJECT = 'proj-1';

function change(payload: Record<string, unknown>): CollaborationProjectChangeRecord {
  return {
    id: 'c-1',
    projectId: PROJECT,
    actorId: 'peer',
    clientId: 'peer-client',
    clientOpId: 'op-1',
    protocolVersion: 1,
    projectRevision: 2,
    baseRevision: 1,
    entityType: 'layer_unit',
    entityId: 'u-1',
    opType: 'batch_patch',
    payload,
    sourceKind: 'user',
    createdAt: NOW,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({ id: PROJECT, title: { default: PROJECT }, createdAt: NOW, updatedAt: NOW });
  await db.layer_units.put({
    id: 'u-1',
    textId: PROJECT,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    selfCertainty: 'certain',
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType);
});

describe('applyCollaborationRemoteMutation selfCertainty (#365)', () => {
  it('value: null 映射为本地清除（undefined）| null maps to local clear', async () => {
    const saveUnitSelfCertainty = vi.fn(async () => undefined);
    const mutated = await applyCollaborationRemoteMutation(
      change({
        action: 'self-certainty',
        unitIds: ['u-1'],
        value: null,
      }),
      undefined,
      {
        projectTextId: PROJECT,
        runWithDbMutex: async (fn) => fn(),
        layers: [],
        layerLinks: [],
        loadSnapshot: async () => undefined,
        rawActions: {
          saveUnitText: vi.fn(async () => undefined),
          saveUnitSelfCertainty,
          saveUnitLayerFields: vi.fn(async () => undefined),
          saveUnitTiming: vi.fn(async () => undefined),
          deleteUnit: vi.fn(async () => undefined),
          deleteSelectedUnits: vi.fn(async () => undefined),
          deleteLayer: vi.fn(async () => undefined),
          toggleLayerLink: vi.fn(async () => undefined),
        },
      },
    );

    expect(mutated).toBe(true);
    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['u-1'], undefined);
  });

  it('缺少 value 字段时不写确定性（旧坏 payload）| missing value does not write certainty', async () => {
    const saveUnitSelfCertainty = vi.fn(async () => undefined);
    const mutated = await applyCollaborationRemoteMutation(
      change({
        action: 'self-certainty',
        unitIds: ['u-1'],
      }),
      undefined,
      {
        projectTextId: PROJECT,
        runWithDbMutex: async (fn) => fn(),
        layers: [],
        layerLinks: [],
        loadSnapshot: async () => undefined,
        rawActions: {
          saveUnitText: vi.fn(async () => undefined),
          saveUnitSelfCertainty,
          saveUnitLayerFields: vi.fn(async () => undefined),
          saveUnitTiming: vi.fn(async () => undefined),
          deleteUnit: vi.fn(async () => undefined),
          deleteSelectedUnits: vi.fn(async () => undefined),
          deleteLayer: vi.fn(async () => undefined),
          toggleLayerLink: vi.fn(async () => undefined),
        },
      },
    );

    expect(saveUnitSelfCertainty).not.toHaveBeenCalled();
    expect(mutated).toBe(false);
  });
});

/**
 * R-COLLAB-SCOPE / R-COLLAB-SCOPE-LAYER（代码审查 JY-03 的移植）：远端变更不能改写或搬走本机其它项目的行。
 * R-COLLAB-SCOPE / R-COLLAB-SCOPE-LAYER (ported from code review JY-03): a remote change cannot
 * rewrite or move rows that belong to another local project.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type LayerDocType, type LayerUnitDocType } from '../../db';
import { JieyuOwnershipImmutabilityError } from '../../db/ownershipImmutabilityMiddleware';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import { LinguisticService } from '../../services/LinguisticService';
import {
  CollaborationRemoteProjectScopeError,
  applyCollaborationRemoteMutation,
  type ApplyCollaborationRemoteMutationDeps,
} from './CollaborationProjectRemoteMutationService';
import type { CollaborationProjectChangeRecord } from './syncTypes';

const NOW = '2026-10-09T00:00:00.000Z';
const SHARED = 'proj-shared';
const PRIVATE = 'proj-private';

function layer(id: string, textId: string, name: string): LayerDocType {
  return {
    id,
    textId,
    key: `trc_${id}`,
    name: { eng: name },
    layerType: 'transcription',
    languageId: 'eng',
    modality: 'text',
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function change(
  partial: Pick<CollaborationProjectChangeRecord, 'entityType' | 'entityId' | 'opType'> & {
    payload: Record<string, unknown>;
  },
): CollaborationProjectChangeRecord {
  return {
    id: `c-${partial.entityId}-${partial.opType}`,
    projectId: 'cloud-proj',
    actorId: 'peer',
    clientId: 'peer-client',
    clientOpId: `op-${partial.entityId}`,
    protocolVersion: 1,
    projectRevision: 1,
    baseRevision: 0,
    sourceKind: 'user',
    createdAt: NOW,
    ...partial,
  } as CollaborationProjectChangeRecord;
}

function deps(): ApplyCollaborationRemoteMutationDeps & {
  rawActions: Record<string, ReturnType<typeof vi.fn>>;
} {
  const noop = vi.fn(async () => undefined);
  return {
    projectTextId: SHARED,
    runWithDbMutex: (fn) => fn(),
    layers: [],
    layerLinks: [],
    loadSnapshot: vi.fn(async () => undefined),
    rawActions: {
      saveUnitText: noop,
      saveUnitSelfCertainty: noop,
      saveUnitLayerFields: noop,
      saveUnitTiming: noop,
      deleteUnit: noop,
      deleteSelectedUnits: noop,
      deleteLayer: noop,
      toggleLayerLink: noop,
    },
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  for (const id of [SHARED, PRIVATE]) {
    await db.texts.put({ id, title: { default: id }, createdAt: NOW, updatedAt: NOW });
  }
  await LayerTierUnifiedService.createLayer(layer('L-shared', SHARED, 'Shared'));
  await LayerTierUnifiedService.createLayer(layer('L-private', PRIVATE, 'Private'));
  await db.layer_units.put({
    id: 'private-unit',
    textId: PRIVATE,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType);
});

describe('R-COLLAB-SCOPE: remote upsert_unit stays inside the collaboration project', () => {
  it('refuses to move a unit owned by another local project, with a clear error', async () => {
    const d = deps();
    await expect(
      applyCollaborationRemoteMutation(
        change({
          entityType: 'layer_unit',
          entityId: 'private-unit',
          opType: 'upsert_unit',
          payload: {
            unit: {
              id: 'private-unit',
              textId: SHARED,
              unitType: 'unit',
              startTime: 5,
              endTime: 6,
              createdAt: NOW,
              updatedAt: NOW,
            },
          },
        }),
        { skipLoadSnapshot: true },
        d,
      ),
    ).rejects.toThrow(/private-unit.*belongs to local project "proj-private"/);
    const row = await db.layer_units.get('private-unit');
    expect({ textId: row?.textId, startTime: row?.startTime }).toEqual({
      textId: PRIVATE,
      startTime: 0,
    });
  });

  it('refuses a payload that declares another project', async () => {
    await expect(
      applyCollaborationRemoteMutation(
        change({
          entityType: 'layer_unit',
          entityId: 'new-unit',
          opType: 'upsert_unit',
          payload: {
            unit: {
              id: 'new-unit',
              textId: PRIVATE,
              unitType: 'unit',
              startTime: 0,
              endTime: 1,
              createdAt: NOW,
              updatedAt: NOW,
            },
          },
        }),
        { skipLoadSnapshot: true },
        deps(),
      ),
    ).rejects.toBeInstanceOf(CollaborationRemoteProjectScopeError);
    expect(await db.layer_units.get('new-unit')).toBeUndefined();
  });

  it('refuses id-only ops (timing / text / delete / batch) on another project unit', async () => {
    const d = deps();
    const ops = [
      change({
        entityType: 'layer_unit',
        entityId: 'private-unit',
        opType: 'upsert_unit',
        payload: { unitId: 'private-unit', startTime: 2, endTime: 3 },
      }),
      change({
        entityType: 'layer_unit_content',
        entityId: 'private-unit:L-shared',
        opType: 'upsert_unit_content',
        payload: { unitId: 'private-unit', value: 'x' },
      }),
      change({
        entityType: 'layer_unit',
        entityId: 'private-unit',
        opType: 'delete_entity',
        payload: { unitId: 'private-unit' },
      }),
      change({
        entityType: 'layer_unit',
        entityId: 'batch',
        opType: 'batch_patch',
        payload: { action: 'delete-selected', unitIds: ['private-unit'] },
      }),
    ];
    for (const op of ops) {
      await expect(
        applyCollaborationRemoteMutation(op, { skipLoadSnapshot: true }, d),
      ).rejects.toBeInstanceOf(CollaborationRemoteProjectScopeError);
    }
    for (const action of Object.values(d.rawActions)) expect(action).not.toHaveBeenCalled();
  });

  it('still applies a change for the collaboration project and reloads that project', async () => {
    const d = deps();
    const applied = await applyCollaborationRemoteMutation(
      change({
        entityType: 'layer_unit',
        entityId: 'shared-unit',
        opType: 'upsert_unit',
        payload: { unitId: 'shared-unit', startTime: 1, endTime: 2 },
      }),
      undefined,
      d,
    );
    expect(applied).toBe(true);
    expect(d.rawActions.saveUnitTiming).toHaveBeenCalledWith('shared-unit', 1, 2);
    expect(d.loadSnapshot).toHaveBeenCalledWith(SHARED);
  });

  it('the DB itself refuses the move even if a service skipped the check', async () => {
    const row = (await db.layer_units.get('private-unit'))!;
    await expect(LinguisticService.units.save({ ...row, textId: SHARED })).rejects.toThrow();
    await expect(db.layer_units.put({ ...row, textId: SHARED })).rejects.toBeInstanceOf(
      JieyuOwnershipImmutabilityError,
    );
    expect((await db.layer_units.get('private-unit'))?.textId).toBe(PRIVATE);
  });
});

describe('R-COLLAB-SCOPE-LAYER: remote upsert_layer stays inside the collaboration project', () => {
  it('refuses to move a layer owned by another local project', async () => {
    await expect(
      applyCollaborationRemoteMutation(
        change({
          entityType: 'layer',
          entityId: 'L-private',
          opType: 'upsert_layer',
          payload: { layer: { ...layer('L-private', SHARED, 'Hijacked'), isDefault: undefined } },
        }),
        { skipLoadSnapshot: true },
        deps(),
      ),
    ).rejects.toBeInstanceOf(CollaborationRemoteProjectScopeError);
    const row = await db.tier_definitions.get('L-private');
    expect(row?.textId).toBe(PRIVATE);
  });

  it('LinguisticService.layers.upsert is a transactional put that the ownership middleware guards', async () => {
    const error = await LinguisticService.layers
      .upsert(layer('L-private', SHARED, 'Hijacked'))
      .then(() => null)
      .catch((caught: unknown) => caught);
    // withTransaction 把领域错误放在 cause 里 | withTransaction keeps the domain error as `cause`
    expect(error instanceof Error ? error.cause : null).toBeInstanceOf(
      JieyuOwnershipImmutabilityError,
    );
    expect((await db.tier_definitions.get('L-private'))?.textId).toBe(PRIVATE);
  });

  it('refuses deleting a layer of another project', async () => {
    const d = deps();
    await expect(
      applyCollaborationRemoteMutation(
        change({
          entityType: 'layer',
          entityId: 'L-private',
          opType: 'delete_entity',
          payload: { layerId: 'L-private' },
        }),
        { skipLoadSnapshot: true },
        d,
      ),
    ).rejects.toBeInstanceOf(CollaborationRemoteProjectScopeError);
    expect(d.rawActions.deleteLayer).not.toHaveBeenCalled();
  });
});

describe('GAP-2: remote upsert_unit references stay inside the collaboration project', () => {
  beforeEach(async () => {
    await db.media_items.put({
      id: 'private-media',
      textId: PRIVATE,
      filename: 'a.wav',
      isOfflineCached: false,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
      createdAt: NOW,
    } as never);
  });

  function sharedUnit(extra: Record<string, unknown>) {
    return change({
      entityType: 'layer_unit',
      entityId: 'shared-new',
      opType: 'upsert_unit',
      payload: {
        unit: {
          id: 'shared-new',
          textId: SHARED,
          layerId: 'L-shared',
          unitType: 'unit',
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
          ...extra,
        },
      },
    });
  }

  it('refuses a new shared unit that points at media of another project', async () => {
    const error = await applyCollaborationRemoteMutation(
      sharedUnit({ mediaId: 'private-media' }),
      { skipLoadSnapshot: true },
      deps(),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CollaborationRemoteProjectScopeError);
    expect((error as CollaborationRemoteProjectScopeError).entityKind).toBe('media');
    expect(await db.layer_units.get('shared-new')).toBeUndefined();
  });

  it('refuses parent / root unit references into another project', async () => {
    for (const ref of ['parentUnitId', 'rootUnitId']) {
      const error = await applyCollaborationRemoteMutation(
        sharedUnit({ [ref]: 'private-unit' }),
        { skipLoadSnapshot: true },
        deps(),
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CollaborationRemoteProjectScopeError);
      expect((error as CollaborationRemoteProjectScopeError).entityId).toBe('private-unit');
    }
    expect(await db.layer_units.get('shared-new')).toBeUndefined();
  });
});

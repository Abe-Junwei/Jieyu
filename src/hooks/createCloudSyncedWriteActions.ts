/**
 * Factory for cloud-synced write actions.
 *
 * Extracted from useTranscriptionCloudSyncActions to keep the hook under
 * the line-count budget. This is a plain function (not a hook) because it
 * only reads refs and calls stable callbacks.
 */
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import type { LayerCreateInput } from './transcriptionTypes';
import type { PerLayerRowFieldPatch } from './useTranscriptionUnitActions';
import type { ProjectEntityType, ProjectChangeOperation } from '../collaboration/cloud/syncTypes';
import type { TranscriptionCollaborationMutationInput } from './useTranscriptionCollaborationBridge';

interface CloudSyncWrappedActions {
  saveUnitText: (unitId: string, value: string, layerId?: string) => Promise<void>;
  saveUnitSelfCertainty: (
    unitIds: Iterable<string>,
    value: UnitSelfCertainty | undefined,
  ) => Promise<void>;
  saveUnitLayerFields: (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => Promise<void>;
  saveUnitTiming: (unitId: string, startTime: number, endTime: number) => Promise<void>;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
  createUnitFromSelection: (
    start: number,
    end: number,
    options?: { speakerId?: string; focusedLayerId?: string },
  ) => Promise<void>;
  deleteUnit: (unitId: string) => Promise<void>;
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (targetLayerId?: string, options?: { keepUnits?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
}

interface CreateCloudSyncedWriteActionsParams {
  wrappedActionsRef: { readonly current: CloudSyncWrappedActions };
  enqueueMutation: (input: TranscriptionCollaborationMutationInput) => void;
  rememberLocalShadowMutation: (
    entityType: ProjectEntityType,
    entityId: string,
    opType: ProjectChangeOperation,
    payload: Record<string, unknown> | undefined,
  ) => void;
  unitsRef: { readonly current: ReadonlyArray<{ id: string }> };
  layersRef: { readonly current: ReadonlyArray<{ id: string; key?: string; layerType?: string }> };
  layerLinksRef: {
    readonly current: ReadonlyArray<{
      transcriptionLayerKey: string;
      hostTranscriptionLayerId?: string;
      layerId: string;
    }>;
  };
}

export function createCloudSyncedWriteActions({
  wrappedActionsRef,
  enqueueMutation,
  rememberLocalShadowMutation,
  unitsRef,
  layersRef,
  layerLinksRef,
}: CreateCloudSyncedWriteActionsParams): CloudSyncWrappedActions {
  return {
    saveUnitText: async (unitId: string, value: string, layerId?: string) => {
      await wrappedActionsRef.current.saveUnitText(unitId, value, layerId);
      const entityId = layerId ? `${unitId}:${layerId}` : unitId;
      const payload: Record<string, unknown> = {
        unitId,
        ...(layerId ? { layerId } : {}),
        value,
      };
      enqueueMutation({
        entityType: 'layer_unit_content',
        entityId,
        opType: 'upsert_unit_content',
        payload,
      });
      rememberLocalShadowMutation('layer_unit_content', entityId, 'upsert_unit_content', payload);
    },
    saveUnitSelfCertainty: async (
      unitIds: Iterable<string>,
      value: UnitSelfCertainty | undefined,
    ) => {
      await wrappedActionsRef.current.saveUnitSelfCertainty(unitIds, value);
      const unitIdList = Array.from(unitIds);
      const entityId =
        unitIdList.length === 1
          ? (unitIdList[0] ?? 'batch:self-certainty')
          : 'batch:self-certainty';
      const payload: Record<string, unknown> = {
        action: 'self-certainty',
        unitIds: unitIdList,
        value,
      };
      enqueueMutation({
        entityType: 'layer_unit',
        entityId,
        opType: 'batch_patch',
        payload,
      });
      rememberLocalShadowMutation('layer_unit', entityId, 'batch_patch', payload);
    },
    saveUnitLayerFields: async (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => {
      await wrappedActionsRef.current.saveUnitLayerFields(unitIds, patch);
      const unitIdList = Array.from(unitIds);
      const entityId =
        unitIdList.length === 1 ? (unitIdList[0] ?? 'batch:layer-fields') : 'batch:layer-fields';
      const payload: Record<string, unknown> = {
        action: 'layer-fields',
        unitIds: unitIdList,
        patch,
      };
      enqueueMutation({
        entityType: 'layer_unit',
        entityId,
        opType: 'batch_patch',
        payload,
      });
      rememberLocalShadowMutation('layer_unit', entityId, 'batch_patch', payload);
    },
    saveUnitTiming: async (unitId: string, startTime: number, endTime: number) => {
      await wrappedActionsRef.current.saveUnitTiming(unitId, startTime, endTime);
      const payload: Record<string, unknown> = {
        unitId,
        startTime,
        endTime,
      };
      enqueueMutation({
        entityType: 'layer_unit',
        entityId: unitId,
        opType: 'upsert_unit',
        payload,
      });
      rememberLocalShadowMutation('layer_unit', unitId, 'upsert_unit', payload);
    },
    saveUnitLayerText: async (unitId: string, value: string, layerId: string) => {
      await wrappedActionsRef.current.saveUnitLayerText(unitId, value, layerId);
      const entityId = `${unitId}:${layerId}`;
      const payload: Record<string, unknown> = {
        unitId,
        layerId,
        value,
      };
      enqueueMutation({
        entityType: 'layer_unit_content',
        entityId,
        opType: 'upsert_unit_content',
        payload,
      });
      rememberLocalShadowMutation('layer_unit_content', entityId, 'upsert_unit_content', payload);
    },
    createUnitFromSelection: async (
      start: number,
      end: number,
      options?: { speakerId?: string; focusedLayerId?: string },
    ) => {
      const beforeUnitIds = new Set(unitsRef.current.map((row) => row.id));
      await wrappedActionsRef.current.createUnitFromSelection(start, end, options);
      const createdUnit = unitsRef.current.find((row) => !beforeUnitIds.has(row.id));
      const payload: Record<string, unknown> = {
        ...(createdUnit ? { unit: createdUnit as unknown as Record<string, unknown> } : {}),
        ...(createdUnit?.id ? { unitId: createdUnit.id } : {}),
        start,
        end,
        ...(options?.speakerId ? { speakerId: options.speakerId } : {}),
        ...(options?.focusedLayerId ? { focusedLayerId: options.focusedLayerId } : {}),
      };
      const entityId = createdUnit?.id ?? 'selection';
      enqueueMutation({
        entityType: 'layer_unit',
        entityId,
        opType: 'upsert_unit',
        payload,
      });
      rememberLocalShadowMutation('layer_unit', entityId, 'upsert_unit', payload);
    },
    deleteUnit: async (unitId: string) => {
      await wrappedActionsRef.current.deleteUnit(unitId);
      const payload: Record<string, unknown> = {
        deleted: true,
        reason: 'delete-unit',
      };
      enqueueMutation({
        entityType: 'layer_unit',
        entityId: unitId,
        opType: 'delete_entity',
        payload,
      });
      rememberLocalShadowMutation('layer_unit', unitId, 'delete_entity', payload);
    },
    deleteSelectedUnits: async (ids: Set<string>) => {
      await wrappedActionsRef.current.deleteSelectedUnits(ids);
      const entityId = `batch:${ids.size}`;
      const payload: Record<string, unknown> = {
        unitIds: Array.from(ids),
        action: 'delete-selected',
      };
      enqueueMutation({
        entityType: 'layer_unit',
        entityId,
        opType: 'batch_patch',
        payload,
      });
      rememberLocalShadowMutation('layer_unit', entityId, 'batch_patch', payload);
    },
    createLayer: async (
      layerType: 'transcription' | 'translation',
      input: LayerCreateInput,
      modality?: 'text' | 'audio' | 'mixed',
    ) => {
      const beforeLayerIds = new Set(layersRef.current.map((row) => row.id));
      const created = await wrappedActionsRef.current.createLayer(layerType, input, modality);
      if (created) {
        const createdLayer = layersRef.current.find((row) => !beforeLayerIds.has(row.id));
        const entityId = createdLayer?.id ?? 'layer';
        const payload: Record<string, unknown> = {
          ...(createdLayer ? { layer: createdLayer as unknown as Record<string, unknown> } : {}),
          ...(createdLayer?.id ? { layerId: createdLayer.id } : {}),
          layerType,
          ...(modality ? { modality } : {}),
          input: input as unknown as Record<string, unknown>,
        };
        enqueueMutation({
          entityType: 'layer',
          entityId,
          opType: 'upsert_layer',
          payload,
        });
        rememberLocalShadowMutation('layer', entityId, 'upsert_layer', payload);
      }
      return created;
    },
    deleteLayer: async (targetLayerId?: string, options?: { keepUnits?: boolean }) => {
      await wrappedActionsRef.current.deleteLayer(targetLayerId, options);
      const entityId = targetLayerId ?? 'layer';
      const payload: Record<string, unknown> = {
        ...(targetLayerId ? { layerId: targetLayerId } : {}),
        deleted: true,
        ...(options?.keepUnits !== undefined ? { keepUnits: options.keepUnits } : {}),
      };
      enqueueMutation({
        entityType: 'layer',
        entityId,
        opType: 'delete_entity',
        payload,
      });
      rememberLocalShadowMutation('layer', entityId, 'delete_entity', payload);
    },
    toggleLayerLink: async (transcriptionLayerKey: string, layerId: string) => {
      const linkExisted = layerLinksRef.current.some(
        (link) => link.transcriptionLayerKey === transcriptionLayerKey && link.layerId === layerId,
      );
      const hostLayer = layersRef.current.find((layer) => layer.key === transcriptionLayerKey);
      const hostTranscriptionLayerId = hostLayer?.id;
      await wrappedActionsRef.current.toggleLayerLink(transcriptionLayerKey, layerId);
      const entityId = `${hostTranscriptionLayerId ?? transcriptionLayerKey}:${layerId}`;
      const payload: Record<string, unknown> = {
        transcriptionLayerKey,
        ...(hostTranscriptionLayerId ? { hostTranscriptionLayerId } : {}),
        layerId,
        enabled: !linkExisted,
      };
      enqueueMutation({
        entityType: 'unit_relation',
        entityId,
        opType: 'upsert_relation',
        payload,
      });
      rememberLocalShadowMutation('unit_relation', entityId, 'upsert_relation', payload);
    },
  };
}

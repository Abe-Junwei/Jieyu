import {
  dexieStoresForDeleteAudioKeepTimeline,
  dexieStoresForDeleteProjectByTextIdCascadeRw,
  dexieStoresForRemoveUnitCascadeRw,
  getDb,
  type LayerUnitDocType,
  type MediaItemDocType,
} from '../db';
import { invalidateUnitEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import {
  deleteLayerSegmentGraphByUnitIds,
  deleteResidualLayerUnitGraphByTextId,
  deleteUnitLayerUnitCascade,
} from './LayerSegmentGraphService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import {
  isMediaItemPlaceholderRow,
  MEDIA_TIMELINE_KIND_PLACEHOLDER,
} from '../utils/mediaItemTimelineKind';
import { SegmentMetaService } from './SegmentMetaService';

type JieyuDbInstance = Awaited<ReturnType<typeof getDb>>;

async function removeNotesForUnitIds(
  db: JieyuDbInstance,
  unitIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return;

  const [tokens, morphemes] = await Promise.all([
    db.dexie.unit_tokens.where('unitId').anyOf(ids).toArray(),
    db.dexie.unit_morphemes.where('unitId').anyOf(ids).toArray(),
  ]);

  const deleteByTarget = async (
    targetType: 'unit' | 'token' | 'morpheme',
    targetIds: readonly string[],
  ) => {
    if (targetIds.length === 0) return;
    await db.dexie.user_notes
      .where('[targetType+targetId]')
      .anyOf(targetIds.map((targetId) => [targetType, targetId] as [string, string]))
      .delete();
  };

  await deleteByTarget('unit', ids);
  await deleteByTarget('token', tokens.map((token) => token.id));
  await deleteByTarget('morpheme', morphemes.map((morpheme) => morpheme.id));
}

export async function deleteProjectCascade(textId: string): Promise<void> {
  const db = await getDb();

  await db.dexie.transaction(
    'rw',
    [...dexieStoresForDeleteProjectByTextIdCascadeRw(db)],
    async () => {
      const allUtts = await db.dexie.layer_units.where('textId').equals(textId).filter((u) => u.unitType === 'unit').toArray();
      const uttIds = allUtts.map((u) => u.id);

      await removeNotesForUnitIds(db, uttIds);
      await invalidateUnitEmbeddings(db, uttIds);

      for (const uttId of uttIds) {
        const tokens = await db.dexie.unit_tokens.where('unitId').equals(uttId).toArray();
        const tokenIds = tokens.map((t) => t.id);
        const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(uttId).toArray()).map((m) => m.id);
        await deleteLayerSegmentGraphByUnitIds(db, [uttId]);
        if (tokenIds.length > 0 || morphemeIds.length > 0) {
          const targets: Array<[string, string]> = [
            ...tokenIds.map((id) => ['token', id] as [string, string]),
            ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
          ];
          await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
        }
        await db.dexie.unit_tokens.where('unitId').equals(uttId).delete();
        await db.dexie.unit_morphemes.where('unitId').equals(uttId).delete();
      }

      await deleteResidualLayerUnitGraphByTextId(db, textId);

      const tierDefs = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
      for (const td of tierDefs) {
        await db.dexie.tier_annotations.where('tierId').equals(td.id).delete();
      }

      await db.dexie.tier_definitions.where('textId').equals(textId).delete();

      const mediaItems = await db.dexie.media_items.where('textId').equals(textId).toArray();
      for (const media of mediaItems) {
        await db.dexie.anchors.where('mediaId').equals(media.id).delete();
      }

      await db.dexie.media_items.where('textId').equals(textId).delete();

      const convos = await db.dexie.ai_conversations.where('textId').equals(textId).toArray();
      const convoIds = convos.map((c) => c.id);
      for (const convoId of convoIds) {
        await db.dexie.ai_messages.where('conversationId').equals(convoId).delete();
      }
      if (convoIds.length > 0) {
        await db.dexie.ai_conversations.bulkDelete(convoIds);
      }

      await db.dexie.track_entities.where('textId').equals(textId).delete();

      await Promise.all([
        db.dexie.segment_meta.where('textId').equals(textId).delete(),
        db.dexie.segment_quality_snapshots.where('textId').equals(textId).delete(),
        db.dexie.scope_stats_snapshots.where('textId').equals(textId).delete(),
        db.dexie.speaker_profile_snapshots.where('textId').equals(textId).delete(),
        db.dexie.translation_status_snapshots.where('textId').equals(textId).delete(),
      ]);

      await db.dexie.ai_tasks.where('targetId').equals(textId).delete();
      await db.dexie.ai_task_snapshots.where('targetId').equals(textId).delete();

      await db.dexie.texts.delete(textId);
    },
  );
}

/** 删音保留语段时间与逻辑轴（ADR-0004 决策 3）；不在此重算或均分句段时间。 */
export async function deleteAudioPreserveTimeline(mediaId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.dexie.transaction(
    'rw',
    [...dexieStoresForDeleteAudioKeepTimeline(db)],
    async () => {
      const media = await db.dexie.media_items.get(mediaId);
      if (!media) return;

      const text = await db.dexie.texts.get(media.textId);
      const siblingRows = await db.dexie.media_items.where('textId').equals(media.textId).toArray();
      const siblingPlaceholderIds = siblingRows
        .filter((row) => row.id !== mediaId)
        .filter((row) => isMediaItemPlaceholderRow(row))
        .map((row) => row.id);
      const relatedUnits = await LayerSegmentQueryService.listUnitsByMediaId(mediaId);
      if (siblingPlaceholderIds.length > 0) {
        const siblingUnits = await LayerSegmentQueryService.listUnitsByMediaIds(siblingPlaceholderIds);
        if (siblingUnits.length > 0) {
          const reassignedUnits = await LayerUnitSegmentWriteService.reassignUnitsToMediaId(db, siblingUnits, mediaId, now);
          relatedUnits.push(...reassignedUnits);
        }
        await db.dexie.media_items.bulkDelete(siblingPlaceholderIds);
      }
      const maxUnitEnd = relatedUnits.reduce((maxValue, unit) => {
        const endTime = typeof unit.endTime === 'number' && Number.isFinite(unit.endTime) ? unit.endTime : 0;
        return Math.max(maxValue, endTime);
      }, 0);
      const existingMetadata = text?.metadata as { logicalDurationSec?: unknown } | undefined;
      const existingLogicalDurationSec = typeof existingMetadata?.logicalDurationSec === 'number'
        && Number.isFinite(existingMetadata.logicalDurationSec)
        ? existingMetadata.logicalDurationSec
        : 0;
      const logicalDurationSec = Math.max(media.duration ?? 0, maxUnitEnd, existingLogicalDurationSec, 1);
      const previousDetails = (media.details as Record<string, unknown> | undefined) ?? {};
      const { audioBlob: _audioBlob, timelineKind: _prevTimelineKind, ...remainingDetails } = previousDetails;

      const textMeta = (text?.metadata as Record<string, unknown> | undefined) ?? {};
      const hasTimedUnits = relatedUnits.length > 0;
      const preservedTimelineMode = textMeta.timelineMode === 'media' || hasTimedUnits ? 'media' : 'document';
      const placeholderDetailTimelineMode = preservedTimelineMode === 'media' ? 'media' : 'document';
      const preservedTimebaseLabel = typeof textMeta.timebaseLabel === 'string' && textMeta.timebaseLabel.trim().length > 0
        ? textMeta.timebaseLabel.trim()
        : 'logical-second';

      const placeholderMedia: MediaItemDocType = {
        id: media.id,
        textId: media.textId,
        filename: 'document-placeholder.track',
        ...(logicalDurationSec > 0 ? { duration: logicalDurationSec } : {}),
        details: {
          ...remainingDetails,
          placeholder: true,
          timelineMode: placeholderDetailTimelineMode,
          timelineKind: MEDIA_TIMELINE_KIND_PLACEHOLDER,
        },
        isOfflineCached: true,
        ...(media.accessRights ? { accessRights: media.accessRights } : {}),
        createdAt: media.createdAt,
      };

      await db.dexie.media_items.put(placeholderMedia);

      if (text) {
        await db.dexie.texts.put({
          ...text,
          metadata: {
            ...(text.metadata ?? {}),
            timelineMode: preservedTimelineMode,
            logicalDurationSec,
            timebaseLabel: preservedTimelineMode === 'media' ? preservedTimebaseLabel : 'logical-second',
          },
          updatedAt: now,
        });
      }
    },
  );
}

export async function removeUnitCascade(unitId: string): Promise<void> {
  const db = await getDb();
  await db.dexie.transaction(
    'rw',
    [...dexieStoresForRemoveUnitCascadeRw(db)],
    async () => {
      await removeNotesForUnitIds(db, [unitId]);
      await invalidateUnitEmbeddings(db, [unitId]);

      const utt = await db.dexie.layer_units.get(unitId);
      const tokens = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
      const tokenIds = tokens.map((t) => t.id);
      const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()).map((m) => m.id);

      await deleteLayerSegmentGraphByUnitIds(db, [unitId]);
      if (tokenIds.length > 0 || morphemeIds.length > 0) {
        const targets: Array<[string, string]> = [
          ...tokenIds.map((id) => ['token', id] as [string, string]),
          ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
        ];
        await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
      }
      await db.dexie.unit_tokens.where('unitId').equals(unitId).delete();
      await db.dexie.unit_morphemes.where('unitId').equals(unitId).delete();
      await deleteUnitLayerUnitCascade(db, [unitId]);

      if (utt?.unitType === 'unit') {
        if (utt.startAnchorId) await db.dexie.anchors.delete(utt.startAnchorId);
        if (utt.endAnchorId) await db.dexie.anchors.delete(utt.endAnchorId);
      }
    },
  );
  void SegmentMetaService.syncForUnitIds([unitId]).catch(() => {
    // SegmentMeta 为统一读模型，删除后的刷新失败不应阻塞主流程 | SegmentMeta refresh failures must not block the main flow.
  });
}

export async function removeUnitsBatchCascade(unitIds: readonly string[]): Promise<void> {
  const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return;

  const db = await getDb();
  await db.dexie.transaction(
    'rw',
    [...dexieStoresForRemoveUnitCascadeRw(db)],
    async () => {
      const bulkRows = await db.dexie.layer_units.bulkGet(ids);
      const utts = bulkRows.filter((row): row is LayerUnitDocType & { unitType: 'unit' } => (
        row != null && row.unitType === 'unit'
      ));

      await removeNotesForUnitIds(db, ids);
      await invalidateUnitEmbeddings(db, ids);

      for (const unitId of ids) {
        const tokens = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
        const tokenIds = tokens.map((t) => t.id);
        const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()).map((m) => m.id);
        await deleteLayerSegmentGraphByUnitIds(db, [unitId]);
        if (tokenIds.length > 0 || morphemeIds.length > 0) {
          const targets: Array<[string, string]> = [
            ...tokenIds.map((id) => ['token', id] as [string, string]),
            ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
          ];
          await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
        }
        await db.dexie.unit_tokens.where('unitId').equals(unitId).delete();
        await db.dexie.unit_morphemes.where('unitId').equals(unitId).delete();
      }

      await deleteUnitLayerUnitCascade(db, ids);

      const anchorIds = new Set<string>();
      for (const utt of utts) {
        if (utt.startAnchorId) anchorIds.add(utt.startAnchorId);
        if (utt.endAnchorId) anchorIds.add(utt.endAnchorId);
      }

      if (anchorIds.size > 0) {
        await db.dexie.anchors.bulkDelete([...anchorIds]);
      }
    },
  );
  void SegmentMetaService.syncForUnitIds(ids).catch(() => {
    // SegmentMeta 为统一读模型，批量删除后的刷新失败不应阻塞主流程 | SegmentMeta refresh failures must not block the main flow.
  });
}

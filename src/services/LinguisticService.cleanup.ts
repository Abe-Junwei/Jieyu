import {
  dexieStoresForDeleteAudioKeepTimeline,
  dexieStoresForRemoveUnitCascadeRw,
  getDb,
  withTransaction,
  type LayerUnitDocType,
  type MediaItemDocType,
} from '../db';
import { invalidateUnitEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import {
  deleteLayerSegmentGraphByUnitIds,
  deleteUnitLayerUnitCascade,
} from './LayerSegmentGraphService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { isMediaItemPlaceholderRow, missingAcousticMediaState } from '../utils/mediaItemState';
import {
  hasEstablishedTimedUnits,
  maxTimedUnitEndSec,
  resolveLogicalDurationSecAfterTimedContentChange,
} from '../utils/timelineLogicalDurationSync';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';
import { projectPurgeStores, purgeProjectRows } from '../db/projectLocalPurge';

type JieyuDbInstance = Awaited<ReturnType<typeof getDb>>;

async function syncTextLogicalDurationFromTimedUnitsInTransaction(
  db: JieyuDbInstance,
  textId: string,
  now: string,
): Promise<void> {
  const unitRows = await db.dexie.layer_units
    .where('textId')
    .equals(textId)
    .filter((unit) => unit.unitType === 'unit')
    .toArray();
  const maxUnitEnd = maxTimedUnitEndSec(unitRows);
  const hasTimedUnits = hasEstablishedTimedUnits(unitRows);
  const text = await db.dexie.texts.get(textId);
  if (!text) return;
  const rowMeta = (text.metadata as Record<string, unknown> | undefined) ?? {};
  const existingLogicalDurationSec =
    typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
      ? rowMeta.logicalDurationSec
      : 0;
  const logicalDurationSec = resolveLogicalDurationSecAfterTimedContentChange({
    maxUnitEndSec: maxUnitEnd,
    existingLogicalDurationSec,
    hasTimedUnits,
  });
  if (logicalDurationSec === existingLogicalDurationSec) return;

  await db.dexie.texts.put({
    ...text,
    metadata: {
      ...rowMeta,
      logicalDurationSec,
      ...(hasTimedUnits ? {} : { timelineMode: 'document' }),
    },
    updatedAt: now,
  });

  const mediaRows = await db.dexie.media_items.where('textId').equals(textId).toArray();
  for (const row of mediaRows) {
    if (!isMediaItemPlaceholderRow(row)) continue;
    await db.dexie.media_items.put({
      ...row,
      ...(logicalDurationSec > 0 ? { duration: logicalDurationSec } : {}),
    });
  }
}

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
  await deleteByTarget(
    'token',
    tokens.map((token) => token.id),
  );
  await deleteByTarget(
    'morpheme',
    morphemes.map((morpheme) => morpheme.id),
  );
}

/**
 * 删除项目（本地部分）：唯一入口是 `purgeProjectRows(…, 'delete-project')`，一个事务（rev5 N6，T21）。
 * Delete a project (local part): the single entry is `purgeProjectRows(…, 'delete-project')`, in
 * one transaction (rev5 N6, T21).
 */
export async function deleteProjectCascade(textId: string): Promise<void> {
  const db = await getDb();
  await withTransaction(
    db,
    'rw',
    projectPurgeStores(db.dexie, 'delete-project'),
    async () => {
      await purgeProjectRows(db.dexie, textId, 'delete-project');
    },
    { label: 'LinguisticService.cleanup.deleteProjectCascade' },
  );
}

/**
 * 删除录音字节（rev5 §5“删除录音字节”，N9，T19）：这是唯一允许删除字节的操作。
 * 行保留 ID 与原名，状态变为 `acoustic + none + missing`；句段时间、来源关系与逻辑轴都不变，
 * 也不合并其他占位轴（rev5 §4.2-11）。
 * Delete recording bytes (the only operation allowed to drop bytes). Keeps the id and the original
 * filename; state becomes `acoustic + none + missing`; unit times, source links and the logical axis
 * stay; other placeholder timelines are never merged.
 */
export async function deleteAudioPreserveTimeline(mediaId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await withTransaction(
    db,
    'rw',
    [...dexieStoresForDeleteAudioKeepTimeline(db)],
    async () => {
      const media = await db.dexie.media_items.get(mediaId);
      if (!media) return;
      if (media.timelineKind !== 'acoustic') return;

      const text = await db.dexie.texts.get(media.textId);
      const relatedUnits = await LayerSegmentQueryService.listUnitsByMediaId(mediaId);
      const maxUnitEnd = maxTimedUnitEndSec(relatedUnits);
      const existingMetadata = text?.metadata as { logicalDurationSec?: unknown } | undefined;
      const existingLogicalDurationSec =
        typeof existingMetadata?.logicalDurationSec === 'number' &&
        Number.isFinite(existingMetadata.logicalDurationSec)
          ? existingMetadata.logicalDurationSec
          : 0;
      const hasTimedUnits = hasEstablishedTimedUnits(relatedUnits);
      const logicalDurationSec = resolveLogicalDurationSecAfterTimedContentChange({
        maxUnitEndSec: maxUnitEnd,
        existingLogicalDurationSec,
        hasTimedUnits,
      });
      const {
        audioBlob: _audioBlob,
        timelineKind: _legacyTimelineKind,
        placeholder: _legacyPlaceholder,
        ...remainingDetails
      } = (media.details as Record<string, unknown> | undefined) ?? {};

      const textMeta = (text?.metadata as Record<string, unknown> | undefined) ?? {};
      /** 互操作标签：由「是否存在时间对齐语段」推断，不再读 `texts.metadata.timelineMode` 做运行时门控。 */
      const preservedTimelineMode = hasTimedUnits ? 'media' : 'document';
      const preservedTimebaseLabel =
        typeof textMeta.timebaseLabel === 'string' && textMeta.timebaseLabel.trim().length > 0
          ? textMeta.timebaseLabel.trim()
          : 'logical-second';

      const knownContentSize =
        media.contentSize ?? (_audioBlob instanceof Blob ? _audioBlob.size : undefined);
      const { url: _url, ...mediaWithoutUrl } = media;
      const missingMedia: MediaItemDocType = {
        ...(media.byteLocation === 'url' ? mediaWithoutUrl : media),
        details: remainingDetails,
        ...missingAcousticMediaState({
          ...(knownContentSize !== undefined ? { contentSize: knownContentSize } : {}),
          ...(media.contentSha256 !== undefined ? { contentSha256: media.contentSha256 } : {}),
        }),
      };

      await db.dexie.media_items.put(missingMedia);

      if (text) {
        await db.dexie.texts.put({
          ...text,
          metadata: {
            ...(text.metadata ?? {}),
            timelineMode: preservedTimelineMode,
            logicalDurationSec,
            timebaseLabel:
              preservedTimelineMode === 'media' ? preservedTimebaseLabel : 'logical-second',
          },
          updatedAt: now,
        });
      }
    },
    { label: 'LinguisticService.cleanup.deleteAudioPreserveTimeline' },
  );
}

export async function removeUnitCascade(unitId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const unitBeforeDelete = await db.dexie.layer_units.get(unitId);
  const textId = unitBeforeDelete?.textId?.trim() ?? '';
  await withTransaction(
    db,
    'rw',
    [...dexieStoresForRemoveUnitCascadeRw(db)],
    async () => {
      await removeNotesForUnitIds(db, [unitId]);
      await invalidateUnitEmbeddings(db, [unitId]);

      const utt = await db.dexie.layer_units.get(unitId);
      const tokens = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
      const tokenIds = tokens.map((t) => t.id);
      const morphemeIds = (
        await db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()
      ).map((m) => m.id);

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
    { label: 'LinguisticService.cleanup.removeUnitCascade' },
  );
  if (textId) {
    await withTransaction(
      db,
      'rw',
      [...dexieStoresForDeleteAudioKeepTimeline(db)],
      async () => {
        await syncTextLogicalDurationFromTimedUnitsInTransaction(db, textId, now);
      },
      { label: 'LinguisticService.cleanup.syncLogicalDurationAfterRemoveUnit' },
    );
  }
  scheduleSegmentMetaSyncForUnitIds([unitId], 'LinguisticService.cleanup.removeUnitCascade');
}

export async function removeUnitsBatchCascade(unitIds: readonly string[]): Promise<void> {
  const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return;

  const db = await getDb();
  const now = new Date().toISOString();
  const bulkRowsBeforeDelete = await db.dexie.layer_units.bulkGet(ids);
  const textIdsToSync = [
    ...new Set(
      bulkRowsBeforeDelete
        .filter((row): row is LayerUnitDocType => row != null)
        .map((utt) => utt.textId.trim())
        .filter(Boolean),
    ),
  ];
  await withTransaction(
    db,
    'rw',
    [...dexieStoresForRemoveUnitCascadeRw(db)],
    async () => {
      const bulkRows = await db.dexie.layer_units.bulkGet(ids);
      const utts = bulkRows.filter(
        (row): row is LayerUnitDocType & { unitType: 'unit' } =>
          row != null && row.unitType === 'unit',
      );

      await removeNotesForUnitIds(db, ids);
      await invalidateUnitEmbeddings(db, ids);

      for (const unitId of ids) {
        const tokens = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
        const tokenIds = tokens.map((t) => t.id);
        const morphemeIds = (
          await db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()
        ).map((m) => m.id);
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
    { label: 'LinguisticService.cleanup.removeUnitsBatchCascade' },
  );
  if (textIdsToSync.length > 0) {
    await withTransaction(
      db,
      'rw',
      [...dexieStoresForDeleteAudioKeepTimeline(db)],
      async () => {
        for (const textId of textIdsToSync) {
          await syncTextLogicalDurationFromTimedUnitsInTransaction(db, textId, now);
        }
      },
      { label: 'LinguisticService.cleanup.syncLogicalDurationAfterRemoveUnitsBatch' },
    );
  }
  scheduleSegmentMetaSyncForUnitIds(ids, 'LinguisticService.cleanup.removeUnitsCascade');
}

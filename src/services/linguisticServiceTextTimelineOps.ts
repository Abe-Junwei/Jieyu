import { getDb, type LayerUnitContentDocType, type TextDocType } from '../db';
import {
  invalidateUnitEmbeddings,
  isDefaultTranscriptionLayerForUnitText,
} from '../ai/embeddings/EmbeddingInvalidationService';
import { getUnitDocProjectionById } from './LayerSegmentGraphService';
import { listUnitTextsByUnit, syncUnitTextToSegmentationV2 } from './LayerSegmentationTextService';
import {
  invertTextTimeMapping as invertTextTimeMappingImpl,
  mergeTextTimeMappingHistory,
  normalizeTextTimeMapping,
  previewTextTimeMapping as previewTextTimeMappingImpl,
  type PreviewTextTimeMappingInput,
  type PreviewTextTimeMappingResult,
  type TextTimeMapping,
  type UpdateTextTimeMappingInput,
} from './LinguisticService.timeMapping';

export async function getUnitTexts(unitId: string): Promise<LayerUnitContentDocType[]> {
  const db = await getDb();
  return listUnitTextsByUnit(db, unitId);
}

export async function saveUnitText(data: LayerUnitContentDocType): Promise<string> {
  const db = await getDb();
  const unitId = data.unitId?.trim();
  const layerId = data.layerId?.trim();
  if (unitId) {
    const unit = await getUnitDocProjectionById(db, unitId);
    if (unit) {
      await syncUnitTextToSegmentationV2(db, unit, data);
    }
    if (layerId && (await isDefaultTranscriptionLayerForUnitText(db, unitId, layerId))) {
      await invalidateUnitEmbeddings(db, [unitId]);
    }
  }
  return data.id;
}

export async function getAllTexts(): Promise<TextDocType[]> {
  const db = await getDb();
  const docs = await db.collections.texts.find().exec();
  return docs.map((doc) => doc.toJSON());
}

/** 单条文本（略过 getAllTexts），供壳层在首屏尽快拿到 metadata.logicalDurationSec | Single text for faster first-paint */
export async function getTextById(textId: string): Promise<TextDocType | null> {
  const id = textId.trim();
  if (!id) return null;
  const db = await getDb();
  const existingDoc = await db.collections.texts.findOne({ selector: { id } }).exec();
  return existingDoc ? existingDoc.toJSON() : null;
}

export async function saveText(data: TextDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.texts.insert(data);
  return doc.primary;
}

/**
 * 确保文本进入文献项目的逻辑时间模式 | Ensure the text is configured for document-mode logical time.
 */
export async function ensureDocumentTimeline(input: {
  textId: string;
  logicalDurationSec?: number;
}): Promise<TextDocType> {
  const db = await getDb();
  const textId = input.textId.trim();
  if (!textId) throw new Error('textId 不能为空');

  const existingDoc = await db.collections.texts.findOne({ selector: { id: textId } }).exec();
  if (!existingDoc) throw new Error(`文本不存在: ${textId}`);

  const existing = existingDoc.toJSON();
  const metadata = (existing.metadata as Record<string, unknown> | undefined) ?? {};
  const logicalDurationSec =
    Number.isFinite(input.logicalDurationSec) && (input.logicalDurationSec ?? 0) > 0
      ? (input.logicalDurationSec as number)
      : typeof metadata.logicalDurationSec === 'number' &&
          Number.isFinite(metadata.logicalDurationSec)
        ? metadata.logicalDurationSec
        : 1800;
  const now = new Date().toISOString();

  const updated: TextDocType = {
    ...existing,
    metadata: {
      ...metadata,
      timelineMode: 'document',
      logicalDurationSec,
      timebaseLabel: 'logical-second',
    },
    updatedAt: now,
  };

  await db.collections.texts.remove(textId);
  await db.collections.texts.insert(updated);
  return updated;
}

export async function updateTextTimeMapping(
  input: UpdateTextTimeMappingInput,
): Promise<TextDocType> {
  const db = await getDb();
  const textId = input.textId.trim();
  if (!textId) throw new Error('textId 不能为空');

  const existingDoc = await db.collections.texts.findOne({ selector: { id: textId } }).exec();
  if (!existingDoc) throw new Error(`文本不存在: ${textId}`);

  const existing = existingDoc.toJSON();
  const now = new Date().toISOString();
  const metadata =
    existing.metadata && typeof existing.metadata === 'object'
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const currentMapping = normalizeTextTimeMapping(metadata.timeMapping);
  const mappingHistory = mergeTextTimeMappingHistory(currentMapping, metadata.timeMappingHistory);
  const nextOffsetSec = input.offsetSec ?? currentMapping?.offsetSec ?? 0;
  const nextScale = input.scale ?? currentMapping?.scale ?? 1;

  if (!Number.isFinite(nextOffsetSec)) {
    throw new Error('offsetSec 必须是有限数字');
  }
  if (nextOffsetSec < 0) {
    throw new Error('offsetSec 不能小于 0');
  }
  if (!Number.isFinite(nextScale) || nextScale <= 0) {
    throw new Error('scale 必须是大于 0 的有限数字');
  }

  const nextMapping: TextTimeMapping = {
    offsetSec: nextOffsetSec,
    scale: nextScale,
    revision: (currentMapping?.revision ?? 0) + 1,
    updatedAt: now,
    ...(input.sourceMediaId?.trim()
      ? { sourceMediaId: input.sourceMediaId.trim() }
      : currentMapping?.sourceMediaId
        ? { sourceMediaId: currentMapping.sourceMediaId }
        : {}),
  };

  const updated: TextDocType = {
    ...existing,
    metadata: {
      ...metadata,
      timeMapping: nextMapping,
      ...(currentMapping ? { timeMappingRollback: currentMapping } : {}),
      ...(mappingHistory ? { timeMappingHistory: mappingHistory } : {}),
    },
    updatedAt: now,
  };

  await db.collections.texts.remove(textId);
  await db.collections.texts.insert(updated);
  return updated;
}

export function previewTextTimeMapping(
  input: PreviewTextTimeMappingInput,
): PreviewTextTimeMappingResult {
  return previewTextTimeMappingImpl(input);
}

export function invertTextTimeMapping(
  realTime: number,
  mapping: Pick<TextTimeMapping, 'offsetSec' | 'scale'>,
): number {
  return invertTextTimeMappingImpl(realTime, mapping);
}

import type { Locale } from '../i18n';
import type { MediaItemDocType, SegmentMetaDocType, TextDocType, TranslationStatusSnapshotDocType } from '../db/types';
import { getDb } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { resolveDefaultTranscriptionLayerId } from '../services/LayerSegmentGraphService';
import { WorkspaceReadModelService } from '../services/WorkspaceReadModelService';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from './mediaItemTimelineKind';

/** 0–1 或 null 表示暂无数据（无层、无单元等） */
export type ProgressRate = number | null;

/** 声文稿（媒体行）| 文本稿（无媒体时整项目一条） */
export type HomeProgressRecordKind = 'transcription_record' | 'text_record';

export const HOME_TEXT_RECORD_ROW_ID = '__jieyu_text_record__' as const;

export interface TranscriptionRecordProgressRow {
  kind: HomeProgressRecordKind;
  mediaId: string;
  filename: string;
  durationSec?: number;
  transcriptionRate: ProgressRate;
  translationRate: ProgressRate;
  annotationRate: ProgressRate;
  transcriptionUnitCount: number;
  translationRowCount: number;
}

export interface HomeProjectProgressBundle {
  textId: string;
  titleLabel: string;
  updatedAt: string;
  languageCode?: string;
  defaultTranscriptionLayerId?: string;
  hasTranslationLayers: boolean;
  records: TranscriptionRecordProgressRow[];
}

export function pickTextTitle(text: TextDocType, locale: Locale): string {
  const title = text.title ?? {};
  const prefer = locale === 'zh-CN'
    ? ['zh-CN', 'zho', 'cmn', 'und', 'eng', 'en-US']
    : ['en-US', 'eng', 'und', 'zh-CN', 'zho', 'cmn'];
  for (const key of prefer) {
    const v = title[key as keyof typeof title];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  for (const v of Object.values(title)) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return text.id;
}

export function computeTranslationProgressRate(rows: TranslationStatusSnapshotDocType[]): ProgressRate {
  if (rows.length === 0) return null;
  let done = 0;
  for (const row of rows) {
    if (row.status === 'translated' || row.status === 'verified') done += 1;
  }
  return done / rows.length;
}

/** 默认转写层上：在已有 surface 的段中，annotationStatus 已达 glossed / verified 的比例 */
export function computeAnnotationProgressRate(metaRows: SegmentMetaDocType[]): ProgressRate {
  const segments = metaRows.filter((row) => {
    const kind = row.unitKind as string | undefined;
    return kind !== 'anchor';
  });
  const withText = segments.filter((row) => row.hasText);
  if (withText.length === 0) return null;
  let done = 0;
  for (const row of withText) {
    const st = row.annotationStatus;
    if (st === 'glossed' || st === 'verified') done += 1;
  }
  return done / withText.length;
}

function resolveTranscriptionRateFromQuality(totalUnits: number, completionRate: number): ProgressRate {
  if (totalUnits <= 0) return null;
  return Math.max(0, Math.min(1, completionRate));
}

async function loadRecordRow(
  textId: string,
  media: MediaItemDocType,
  defaultTxLayerId: string | undefined,
  hasTranslationLayers: boolean,
): Promise<TranscriptionRecordProgressRow> {
  const mediaId = media.id;
  const filename = media.filename?.trim() || mediaId;

  if (!defaultTxLayerId) {
    return {
      kind: 'transcription_record',
      mediaId,
      filename,
      ...(typeof media.duration === 'number' && Number.isFinite(media.duration)
        ? { durationSec: media.duration }
        : {}),
      transcriptionRate: null,
      translationRate: null,
      annotationRate: null,
      transcriptionUnitCount: 0,
      translationRowCount: 0,
    };
  }

  const db = await getDb();
  const [quality, metaRows, trAll] = await Promise.all([
    WorkspaceReadModelService.summarizeQuality({ textId, mediaId, layerId: defaultTxLayerId }),
    db.dexie.segment_meta.where('[layerId+mediaId]').equals([defaultTxLayerId, mediaId]).toArray(),
    hasTranslationLayers
      ? db.dexie.translation_status_snapshots.where('mediaId').equals(mediaId).toArray()
      : Promise.resolve([] as TranslationStatusSnapshotDocType[]),
  ]);

  const trRows = hasTranslationLayers
    ? trAll.filter((row) => row.textId === textId)
    : [];

  const transcriptionRate = resolveTranscriptionRateFromQuality(
    quality.totalUnitsInScope,
    quality.completionRate,
  );
  const translationRate = hasTranslationLayers ? computeTranslationProgressRate(trRows) : null;
  const annotationRate = computeAnnotationProgressRate(metaRows);

  return {
    kind: 'transcription_record',
    mediaId,
    filename,
    ...(typeof media.duration === 'number' && Number.isFinite(media.duration)
      ? { durationSec: media.duration }
      : {}),
    transcriptionRate,
    translationRate,
    annotationRate,
    transcriptionUnitCount: quality.totalUnitsInScope,
    translationRowCount: trRows.length,
  };
}

async function loadTextRecordOnlyRow(
  textId: string,
  defaultTxLayerId: string,
  hasTranslationLayers: boolean,
): Promise<TranscriptionRecordProgressRow> {
  const db = await getDb();
  const [quality, metaRows, trAll] = await Promise.all([
    WorkspaceReadModelService.summarizeQuality({ textId, layerId: defaultTxLayerId }),
    db.dexie.segment_meta.where('[textId+layerId]').equals([textId, defaultTxLayerId]).toArray(),
    hasTranslationLayers
      ? db.dexie.translation_status_snapshots.where('textId').equals(textId).toArray()
      : Promise.resolve([] as TranslationStatusSnapshotDocType[]),
  ]);

  const transcriptionRate = resolveTranscriptionRateFromQuality(
    quality.totalUnitsInScope,
    quality.completionRate,
  );
  const translationRate = hasTranslationLayers ? computeTranslationProgressRate(trAll) : null;
  const annotationRate = computeAnnotationProgressRate(metaRows);

  return {
    kind: 'text_record',
    mediaId: HOME_TEXT_RECORD_ROW_ID,
    filename: '',
    transcriptionRate,
    translationRate,
    annotationRate,
    transcriptionUnitCount: quality.totalUnitsInScope,
    translationRowCount: trAll.length,
  };
}

export async function loadHomeProjectProgressBundle(
  text: TextDocType,
  locale: Locale,
): Promise<HomeProjectProgressBundle> {
  await WorkspaceReadModelService.rebuildForText(text.id);
  const db = await getDb();
  const defaultTranscriptionLayerId = await resolveDefaultTranscriptionLayerId(db, text.id);
  const layerDocs = await db.collections.layers.find().exec();
  const layers = layerDocs.map((doc) => doc.toJSON()).filter((layer) => layer.textId === text.id);
  const hasTranslationLayers = layers.some((layer) => layer.layerType === 'translation');

  const rawMedia = await LinguisticService.getMediaItemsByTextId(text.id);
  /** 与转写项目中枢一致：排除逻辑占位行与译文/转写附属录音行，避免首页「声文稿」与主时间轴条数错位 | Align with project hub: drop placeholders + auxiliary recording rows */
  const mediaItems = rawMedia.filter(
    (m) => !isMediaItemPlaceholderRow(m) && !isAuxiliaryRecordingMediaRow(m),
  );
  let records: TranscriptionRecordProgressRow[] = await Promise.all(
    mediaItems.map((media) => loadRecordRow(text.id, media, defaultTranscriptionLayerId, hasTranslationLayers)),
  );

  if (records.length === 0 && defaultTranscriptionLayerId) {
    records = [await loadTextRecordOnlyRow(text.id, defaultTranscriptionLayerId, hasTranslationLayers)];
  }

  return {
    textId: text.id,
    titleLabel: pickTextTitle(text, locale),
    updatedAt: text.updatedAt,
    ...(text.languageCode !== undefined && text.languageCode !== '' ? { languageCode: text.languageCode } : {}),
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    hasTranslationLayers,
    records,
  };
}

export async function loadAllHomeProjectProgressBundles(locale: Locale): Promise<HomeProjectProgressBundle[]> {
  const texts = await LinguisticService.getAllTexts();
  const sorted = [...texts].sort((a, b) => {
    const ta = Date.parse(a.updatedAt) || 0;
    const tb = Date.parse(b.updatedAt) || 0;
    return tb - ta;
  });
  return Promise.all(sorted.map((text) => loadHomeProjectProgressBundle(text, locale)));
}

export interface HomeProjectAggregateRates {
  transcription: ProgressRate;
  translation: ProgressRate;
  annotation: ProgressRate;
}

function weightedRate(
  records: TranscriptionRecordProgressRow[],
  pickRate: (row: TranscriptionRecordProgressRow) => ProgressRate,
  pickWeight: (row: TranscriptionRecordProgressRow) => number,
): ProgressRate {
  let wSum = 0;
  let rSum = 0;
  for (const row of records) {
    const rate = pickRate(row);
    if (rate === null) continue;
    const w = Math.max(0, pickWeight(row));
    if (w <= 0) continue;
    wSum += w;
    rSum += rate * w;
  }
  if (wSum <= 0) return null;
  return Math.max(0, Math.min(1, rSum / wSum));
}

/** 项目内各声文稿行的加权概览（用于首页项目卡片抬头） */
export function aggregateProjectProgressRates(records: TranscriptionRecordProgressRow[]): HomeProjectAggregateRates {
  return {
    transcription: weightedRate(
      records,
      (r) => r.transcriptionRate,
      (r) => Math.max(1, r.transcriptionUnitCount),
    ),
    translation: weightedRate(
      records,
      (r) => r.translationRate,
      (r) => Math.max(1, r.translationRowCount),
    ),
    annotation: weightedRate(
      records,
      (r) => r.annotationRate,
      (r) => Math.max(1, r.transcriptionUnitCount),
    ),
  };
}

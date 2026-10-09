import type { Locale } from '../i18n';
import type {
  MediaItemDocType,
  SegmentMetaDocType,
  TextDocType,
  TranslationStatusSnapshotDocType,
} from '../db/types';
import { getDb } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { resolveDefaultTranscriptionLayerId } from '../services/LayerSegmentGraphService';
import { WorkspaceReadModelService } from '../services/WorkspaceReadModelService';
import { listAnnotationDocuments } from '../services/annotationDocumentService';
import { annotationDocumentLabel } from './annotationDocumentLabel';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from './mediaItemState';
import {
  collectSentences,
  progressFromSentences,
  resolveMediaDurationSec,
  translatedSentenceIds,
} from './projectOverviewStats';

/** 0–1 或 null 表示暂无数据（无层、无单元等） */
export type ProgressRate = number | null;

/** 声文稿（媒体行）| 文本稿（无媒体时整项目一条） */
export type HomeProgressRecordKind = 'transcription_record' | 'text_record';

export const HOME_TEXT_RECORD_ROW_ID = '__jieyu_text_record__' as const;

export interface TranscriptionRecordProgressRow {
  kind: HomeProgressRecordKind;
  mediaId: string;
  filename: string;
  /** Media row filename used to match an imported manuscript. */
  storageFilename?: string;
  durationSec?: number;
  transcriptionRate: ProgressRate;
  translationRate: ProgressRate;
  annotationRate: ProgressRate;
  transcriptionUnitCount: number;
  translationRowCount: number;
  sentenceCount: number;
  transcribedCount: number;
  translatedCount: number;
  annotatedCount: number;
}

export interface HomeProjectProgressBundle {
  textId: string;
  titleLabel: string;
  updatedAt: string;
  languageCode?: string;
  defaultTranscriptionLayerId?: string;
  hasTranslationLayers: boolean;
  /** 第 5 批：项目有多份文稿时，统计只覆盖这一份（当前文稿）的名称 | Batch 5: set when the project has several documents; the stats cover only this (current) one */
  currentDocumentLabel?: string;
  records: TranscriptionRecordProgressRow[];
}

export function pickTextTitle(text: TextDocType, locale: Locale): string {
  const title = text.title ?? {};
  const prefer =
    locale === 'zh-CN'
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

export function computeTranslationProgressRate(
  rows: TranslationStatusSnapshotDocType[],
): ProgressRate {
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

function recordDurationSec(
  mediaDuration: number | undefined,
  metaRows: readonly { endTime: number; unitKind?: string }[],
): number | undefined {
  let maxEnd = 0;
  for (const row of metaRows) {
    if (row.endTime > maxEnd) maxEnd = row.endTime;
  }
  const resolved = resolveMediaDurationSec({
    ...(typeof mediaDuration === 'number' ? { duration: mediaDuration } : {}),
    maxUnitEndSec: maxEnd,
  });
  return resolved > 0 ? resolved : undefined;
}

function emptyProgressCounts() {
  return {
    transcriptionRate: null as ProgressRate,
    translationRate: null as ProgressRate,
    annotationRate: null as ProgressRate,
    transcriptionUnitCount: 0,
    translationRowCount: 0,
    sentenceCount: 0,
    transcribedCount: 0,
    translatedCount: 0,
    annotatedCount: 0,
  };
}

function countsFromRows(
  metaRows: SegmentMetaDocType[],
  translationRows: TranslationStatusSnapshotDocType[],
  hasTranslationLayers: boolean,
) {
  const sentences = collectSentences(metaRows);
  const progress = progressFromSentences(
    sentences,
    hasTranslationLayers ? translatedSentenceIds(translationRows) : new Set<string>(),
  );
  return {
    transcriptionRate: progress.transcriptionRate,
    translationRate: hasTranslationLayers ? progress.translationRate : null,
    annotationRate: progress.annotationRate,
    transcriptionUnitCount: progress.sentenceCount,
    translationRowCount: progress.sentenceCount,
    sentenceCount: progress.sentenceCount,
    transcribedCount: progress.transcribedCount,
    translatedCount: hasTranslationLayers ? progress.translatedCount : 0,
    annotatedCount: progress.annotatedCount,
  };
}

async function loadRecordRow(
  textId: string,
  media: MediaItemDocType,
  defaultTxLayerId: string | undefined,
  hasTranslationLayers: boolean,
): Promise<TranscriptionRecordProgressRow> {
  const mediaId = media.id;
  const trimmedFilename = media.filename?.trim();
  const storageFilename =
    trimmedFilename !== undefined && trimmedFilename.length > 0 ? trimmedFilename : mediaId;
  const details =
    media.details && typeof media.details === 'object'
      ? (media.details as Record<string, unknown>)
      : undefined;
  const displayName = typeof details?.displayName === 'string' ? details.displayName.trim() : '';
  const filename = displayName.length > 0 ? displayName : storageFilename;

  if (defaultTxLayerId === undefined || defaultTxLayerId.length === 0) {
    const durationSec = recordDurationSec(media.duration, []);
    return {
      kind: 'transcription_record',
      mediaId,
      filename,
      storageFilename,
      ...(durationSec !== undefined ? { durationSec } : {}),
      ...emptyProgressCounts(),
    };
  }

  const db = await getDb();
  const [metaRows, trAll] = await Promise.all([
    db.dexie.segment_meta.where('[layerId+mediaId]').equals([defaultTxLayerId, mediaId]).toArray(),
    hasTranslationLayers
      ? db.dexie.translation_status_snapshots.where('mediaId').equals(mediaId).toArray()
      : Promise.resolve([] as TranslationStatusSnapshotDocType[]),
  ]);
  const trRows = hasTranslationLayers ? trAll.filter((row) => row.textId === textId) : [];

  const durationSec = recordDurationSec(media.duration, metaRows);
  return {
    kind: 'transcription_record',
    mediaId,
    filename,
    storageFilename,
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...countsFromRows(metaRows, trRows, hasTranslationLayers),
  };
}

async function loadTextRecordOnlyRow(
  textId: string,
  defaultTxLayerId: string,
  hasTranslationLayers: boolean,
): Promise<TranscriptionRecordProgressRow> {
  const db = await getDb();
  const [metaRows, trAll] = await Promise.all([
    db.dexie.segment_meta.where('[textId+layerId]').equals([textId, defaultTxLayerId]).toArray(),
    hasTranslationLayers
      ? db.dexie.translation_status_snapshots.where('textId').equals(textId).toArray()
      : Promise.resolve([] as TranslationStatusSnapshotDocType[]),
  ]);

  return {
    kind: 'text_record',
    mediaId: HOME_TEXT_RECORD_ROW_ID,
    filename: '',
    ...countsFromRows(metaRows, trAll, hasTranslationLayers),
  };
}

export async function loadHomeProjectProgressBundle(
  text: TextDocType,
  locale: Locale,
): Promise<HomeProjectProgressBundle> {
  await WorkspaceReadModelService.rebuildForText(text.id);
  const db = await getDb();
  const defaultTranscriptionLayerId = await resolveDefaultTranscriptionLayerId(db, text.id);
  // 第 5 批：只看当前文稿的层 | Batch 5: only the current document's layers
  const layers = await LinguisticService.layers.listByTextId(text.id);
  const hasTranslationLayers = layers.some((layer) => layer.layerType === 'translation');
  // 与文稿菜单同一编号：按建立时间排序 | Same numbering as the document menu: creation order
  const documents = (await listAnnotationDocuments(text.id)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const currentIndex = documents.findIndex((doc) => doc.isDefault);
  const currentDocument = documents.length > 1 ? documents[currentIndex] : undefined;

  const rawMedia = await LinguisticService.media.listByTextId(text.id);
  /** 与转写项目中枢一致：排除逻辑占位行与译文/转写附属录音行，避免首页「声文稿」与主时间轴条数错位 | Align with project hub: drop placeholders + auxiliary recording rows */
  const mediaItems = rawMedia.filter(
    (m) => !isMediaItemPlaceholderRow(m) && !isAuxiliaryRecordingMediaRow(m),
  );
  let records: TranscriptionRecordProgressRow[] = await Promise.all(
    mediaItems.map((media) =>
      loadRecordRow(text.id, media, defaultTranscriptionLayerId, hasTranslationLayers),
    ),
  );

  if (
    records.length === 0 &&
    defaultTranscriptionLayerId !== undefined &&
    defaultTranscriptionLayerId.length > 0
  ) {
    records = [
      await loadTextRecordOnlyRow(text.id, defaultTranscriptionLayerId, hasTranslationLayers),
    ];
  }

  return {
    textId: text.id,
    titleLabel: pickTextTitle(text, locale),
    updatedAt: text.updatedAt,
    ...(text.languageCode !== undefined && text.languageCode !== ''
      ? { languageCode: text.languageCode }
      : {}),
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    hasTranslationLayers,
    ...(currentDocument
      ? { currentDocumentLabel: annotationDocumentLabel(locale, currentDocument, currentIndex) }
      : {}),
    records,
  };
}

export async function loadAllHomeProjectProgressBundles(
  locale: Locale,
): Promise<HomeProjectProgressBundle[]> {
  const texts = await LinguisticService.timeline.listTexts();
  const sorted = [...texts].sort((a, b) => {
    const parsedA = Date.parse(a.updatedAt);
    const parsedB = Date.parse(b.updatedAt);
    const ta = Number.isFinite(parsedA) ? parsedA : 0;
    const tb = Number.isFinite(parsedB) ? parsedB : 0;
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
export function aggregateProjectProgressRates(
  records: TranscriptionRecordProgressRow[],
): HomeProjectAggregateRates {
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

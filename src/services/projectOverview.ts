import { getDb } from '../db';
import type { Locale } from '../i18n';
import { pickTextTitle } from '../utils/homeTranscriptionRecordProgress';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from '../utils/mediaItemState';
import { readProjectLanguageLists } from '../utils/projectLanguageLists';
import {
  collectSentences,
  progressFromSentences,
  resolveMediaDurationSec,
  translatedSentenceIds,
  type ProjectProgressCounts,
} from '../utils/projectOverviewStats';
import { resolveDefaultTranscriptionLayerId } from './LayerSegmentGraphService';
import { LinguisticService } from './LinguisticService';
import { listProjectSourceFiles } from './projectFileOps';
import { WorkspaceReadModelService } from './WorkspaceReadModelService';

export interface ProjectOverview {
  title: string;
  updatedAt: string;
  objectLanguages: string[];
  workingLanguages: string[];
  audioCount: number;
  manuscriptCount: number;
  audioDurationSec: number;
  speakerCount: number;
  lexemeCount: number;
  tokenCount: number;
  progress: ProjectProgressCounts;
}

async function settled<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch {
    return fallback;
  }
}

export async function loadProjectOverview(
  textId: string,
  locale: Locale,
): Promise<ProjectOverview | null> {
  const text = await LinguisticService.timeline.getTextById(textId);
  if (!text) return null;
  try {
    await WorkspaceReadModelService.rebuildForText(textId);
  } catch {
    /* Keep the overview visible from snapshots already on disk. */
  }
  const db = await getDb();
  const [media, sources, speakers, lexemes, tokenCount, metaRows, translationRows, defaultLayerId] =
    await Promise.all([
      settled(LinguisticService.media.listByTextId(textId), []),
      settled(listProjectSourceFiles(textId), []),
      settled(LinguisticService.speakers.listForProject(textId), []),
      settled(LinguisticService.lexemes.list(textId), []),
      settled(db.dexie.unit_tokens.where('textId').equals(textId).count(), 0),
      settled(db.dexie.segment_meta.where('textId').equals(textId).toArray(), []),
      settled(db.dexie.translation_status_snapshots.where('textId').equals(textId).toArray(), []),
      settled(resolveDefaultTranscriptionLayerId(db, textId), undefined),
    ]);
  const audio = media.filter(
    (row) => !isMediaItemPlaceholderRow(row) && !isAuxiliaryRecordingMediaRow(row),
  );
  const sentenceRows =
    defaultLayerId === undefined
      ? metaRows
      : metaRows.filter((row) => row.layerId === defaultLayerId);
  const lists = readProjectLanguageLists(
    (text.metadata ?? undefined) as Record<string, unknown> | undefined,
  );
  const maxEndByMedia = new Map<string, number>();
  for (const row of sentenceRows) {
    const prev = maxEndByMedia.get(row.mediaId) ?? 0;
    if (row.endTime > prev) maxEndByMedia.set(row.mediaId, row.endTime);
  }
  const audioDurationSec = audio.reduce((sum, row) => {
    return (
      sum +
      resolveMediaDurationSec({
        ...(typeof row.duration === 'number' ? { duration: row.duration } : {}),
        maxUnitEndSec: maxEndByMedia.get(row.id) ?? 0,
      })
    );
  }, 0);
  return {
    title: pickTextTitle(text, locale),
    updatedAt: text.updatedAt,
    objectLanguages: [...lists.objectLanguageIds],
    workingLanguages: [...lists.workingLanguageIds],
    audioCount: audio.length,
    manuscriptCount: sources.length,
    audioDurationSec,
    speakerCount: speakers.length,
    lexemeCount: lexemes.length,
    tokenCount,
    progress: progressFromSentences(
      collectSentences(sentenceRows),
      translatedSentenceIds(translationRows),
    ),
  };
}

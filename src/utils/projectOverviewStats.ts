export type ProgressRate = number | null;

export interface SentenceStatus {
  id: string;
  ids: readonly string[];
  hasText: boolean;
  annotated: boolean;
}

export interface ProjectProgressCounts {
  sentenceCount: number;
  transcribedCount: number;
  translatedCount: number;
  annotatedCount: number;
  transcriptionRate: ProgressRate;
  translationRate: ProgressRate;
  annotationRate: ProgressRate;
}

/** One sentence, even when the same utterance is stored as a host unit and a segment. */
export function sentenceKey(row: { segmentId: string; hostUnitId?: string }): string {
  const host = row.hostUnitId?.trim() ?? '';
  return host.length > 0 ? host : row.segmentId;
}

export function collectSentences(
  rows: readonly {
    segmentId: string;
    hostUnitId?: string;
    unitKind?: string;
    hasText: boolean;
    annotationStatus?: string;
  }[],
): SentenceStatus[] {
  const byId = new Map<string, SentenceStatus>();
  for (const row of rows) {
    if (row.unitKind === 'anchor') continue;
    const id = sentenceKey(row);
    const aliases = new Set<string>([id, row.segmentId]);
    const annotated = row.annotationStatus === 'glossed' || row.annotationStatus === 'verified';
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { id, ids: [...aliases], hasText: row.hasText, annotated });
      continue;
    }
    prev.hasText = prev.hasText || row.hasText;
    prev.annotated = prev.annotated || annotated;
    const merged = new Set(prev.ids);
    for (const alias of aliases) merged.add(alias);
    byId.set(id, { ...prev, ids: [...merged] });
  }
  return [...byId.values()];
}

export function progressFromSentences(
  sentences: readonly SentenceStatus[],
  translatedUnitIds: ReadonlySet<string>,
): ProjectProgressCounts {
  const sentenceCount = sentences.length;
  let transcribedCount = 0;
  let translatedCount = 0;
  let annotatedCount = 0;
  for (const sentence of sentences) {
    if (sentence.hasText) transcribedCount += 1;
    if (sentence.ids.some((id) => translatedUnitIds.has(id))) translatedCount += 1;
    if (sentence.annotated) annotatedCount += 1;
  }
  return {
    sentenceCount,
    transcribedCount,
    translatedCount,
    annotatedCount,
    transcriptionRate: sentenceCount === 0 ? null : transcribedCount / sentenceCount,
    translationRate: sentenceCount === 0 ? null : translatedCount / sentenceCount,
    annotationRate: transcribedCount === 0 ? null : annotatedCount / transcribedCount,
  };
}

/**
 * A sentence is translated once, whichever translation layer finished it.
 * Translation-layer units keep their own id; the transcription sentence is `parentUnitId`.
 * Non-empty translation text counts even when the unit status was never flipped to translated.
 */
export function translatedSentenceIds(
  snapshots: readonly {
    unitId: string;
    parentUnitId?: string;
    status: string;
    hasText?: boolean;
  }[],
): Set<string> {
  const done = new Set<string>();
  for (const row of snapshots) {
    const translated =
      row.hasText === true || row.status === 'translated' || row.status === 'verified';
    if (!translated) continue;
    const unitId = row.unitId.trim();
    if (unitId.length > 0) done.add(unitId);
    const parentId = row.parentUnitId?.trim() ?? '';
    if (parentId.length > 0) done.add(parentId);
  }
  return done;
}

/**
 * Media duration is stored in seconds. ELAN-style millisecond values are scaled
 * when timed units show the same span in seconds. Missing duration falls back to
 * the latest unit end on that media.
 */
export function resolveMediaDurationSec(input: {
  duration?: number;
  maxUnitEndSec?: number;
}): number {
  const end =
    typeof input.maxUnitEndSec === 'number' && Number.isFinite(input.maxUnitEndSec)
      ? Math.max(0, input.maxUnitEndSec)
      : 0;
  const raw = input.duration;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    if (end > 1 && raw > end * 50 && raw / 1000 <= end * 1.5 + 1) return raw / 1000;
    return raw;
  }
  return end;
}

export function sumCounts(parts: readonly ProjectProgressCounts[]): ProjectProgressCounts {
  const sentenceCount = parts.reduce((sum, part) => sum + part.sentenceCount, 0);
  const transcribedCount = parts.reduce((sum, part) => sum + part.transcribedCount, 0);
  const translatedCount = parts.reduce((sum, part) => sum + part.translatedCount, 0);
  const annotatedCount = parts.reduce((sum, part) => sum + part.annotatedCount, 0);
  return {
    sentenceCount,
    transcribedCount,
    translatedCount,
    annotatedCount,
    transcriptionRate: sentenceCount === 0 ? null : transcribedCount / sentenceCount,
    translationRate: sentenceCount === 0 ? null : translatedCount / sentenceCount,
    annotationRate: transcribedCount === 0 ? null : annotatedCount / transcribedCount,
  };
}

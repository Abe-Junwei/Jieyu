/**
 * Speaker utilities | \u8bf4\u8bdd\u4eba\u5de5\u5177\u51fd\u6570
 */

import type { SpeakerDocType, UtteranceDocType } from '../../db';
import type { SpeakerFilterOption, SpeakerVisual } from './types';

const SPEAKER_TRACK_COLORS = [
  'var(--state-info-solid)',
  'var(--state-success-text)',
  'var(--state-warning-text)',
  'color-mix(in srgb, var(--state-info-solid) 72%, var(--state-danger-solid))',
  'var(--state-danger-solid)',
  'var(--state-success-solid)',
  'var(--state-warning-solid)',
  'color-mix(in srgb, var(--state-info-solid) 82%, var(--state-success-solid))',
] as const;

type SpeakerKeyAssignment = {
  unitId: string;
  speakerKey: string;
};

export interface SpeakerDisplayLabels {
  unnamedSpeaker: string;
  unassignedSpeaker: string;
}

export interface SpeakerSelectionSummaryLabels extends SpeakerDisplayLabels {
  noSelectionUtterances: string;
  noneAssignedUtterances: string;
  singleSpeakerSummary: (speakerName: string) => string;
  multipleSpeakersSummary: (count: number) => string;
}

const DEFAULT_SPEAKER_DISPLAY_LABELS: SpeakerDisplayLabels = {
  unnamedSpeaker: '\u672a\u547d\u540d\u8bf4\u8bdd\u4eba',
  unassignedSpeaker: '\u672a\u6807\u6ce8',
};

const DEFAULT_SPEAKER_SELECTION_SUMMARY_LABELS: SpeakerSelectionSummaryLabels = {
  ...DEFAULT_SPEAKER_DISPLAY_LABELS,
  noSelectionUtterances: '\u672a\u9009\u62e9\u53e5\u6bb5',
  noneAssignedUtterances: '\u5f53\u524d\u53e5\u6bb5\u5747\u672a\u6807\u6ce8\u8bf4\u8bdd\u4eba',
  singleSpeakerSummary: (speakerName) => `\u5f53\u524d\u7edf\u4e00\u8bf4\u8bdd\u4eba：${speakerName}`,
  multipleSpeakersSummary: (count) => `\u5f53\u524d\u6d89\u53ca ${count} \u4f4d\u8bf4\u8bdd\u4eba`,
};

function resolveSpeakerDisplayLabels(
  labels?: Partial<SpeakerDisplayLabels>,
): SpeakerDisplayLabels {
  return {
    ...DEFAULT_SPEAKER_DISPLAY_LABELS,
    ...labels,
  };
}

function resolveSpeakerSelectionSummaryLabels(
  labels?: Partial<SpeakerSelectionSummaryLabels>,
): SpeakerSelectionSummaryLabels {
  return {
    ...DEFAULT_SPEAKER_SELECTION_SUMMARY_LABELS,
    ...labels,
  };
}

function hashSpeakerKey(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function normalizeSpeakerName(name: string | undefined): string {
  return name?.trim() ?? '';
}

export function getUtteranceSpeakerKey(
  utterance: Pick<UtteranceDocType, 'speakerId' | 'speaker'>,
): string {
  const speakerId = utterance.speakerId?.trim();
  if (speakerId) return speakerId;
  return '';
}

export function sortSpeakersByName(speakers: SpeakerDocType[]): SpeakerDocType[] {
  return [...speakers].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, 'zh-Hans-CN');
    if (byName !== 0) return byName;
    return left.id.localeCompare(right.id, 'en');
  });
}

export function upsertSpeaker(speakers: SpeakerDocType[], nextSpeaker: SpeakerDocType): SpeakerDocType[] {
  const next = speakers.filter((speaker) => speaker.id !== nextSpeaker.id);
  next.push(nextSpeaker);
  return sortSpeakersByName(next);
}

export function getSpeakerDisplayNameByKey(
  speakerKey: string,
  speakerById: ReadonlyMap<string, SpeakerDocType>,
  labels?: Partial<SpeakerDisplayLabels>,
): string {
  const normalizedKey = speakerKey.trim();
  if (!normalizedKey || normalizedKey === 'unknown-speaker') {
    return resolveSpeakerDisplayLabels(labels).unnamedSpeaker;
  }
  return speakerById.get(normalizedKey)?.name ?? normalizedKey;
}

export function getSpeakerDisplayName(
  utterance: Pick<UtteranceDocType, 'speakerId' | 'speaker'>,
  speakerById: ReadonlyMap<string, SpeakerDocType>,
  labels?: Partial<SpeakerDisplayLabels>,
): string {
  const resolvedLabels = resolveSpeakerDisplayLabels(labels);
  const speakerId = utterance.speakerId?.trim();
  if (speakerId) {
    const mappedName = speakerById.get(speakerId)?.name;
    const legacyName = normalizeSpeakerName(utterance.speaker);
    return mappedName || legacyName || speakerId;
  }
  return normalizeSpeakerName(utterance.speaker) || resolvedLabels.unnamedSpeaker;
}

export function buildSpeakerVisualMapFromKeys(
  assignments: SpeakerKeyAssignment[],
  speakerOptions: SpeakerDocType[],
  labels?: Partial<SpeakerDisplayLabels>,
): Record<string, SpeakerVisual> {
  const speakerById = new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const));
  const nextMap: Record<string, SpeakerVisual> = {};
  for (const assignment of assignments) {
    const speakerKey = assignment.speakerKey.trim();
    if (!speakerKey || speakerKey === 'unknown-speaker') continue;
    const color = SPEAKER_TRACK_COLORS[hashSpeakerKey(speakerKey) % SPEAKER_TRACK_COLORS.length]
      ?? SPEAKER_TRACK_COLORS[0];
    nextMap[assignment.unitId] = {
      name: getSpeakerDisplayNameByKey(speakerKey, speakerById, labels),
      color,
    };
  }
  return nextMap;
}

export function buildSpeakerFilterOptionsFromKeys(
  assignments: SpeakerKeyAssignment[],
  speakerVisualByUnitId: Record<string, SpeakerVisual>,
  labels?: Partial<SpeakerDisplayLabels>,
): SpeakerFilterOption[] {
  const resolvedLabels = resolveSpeakerDisplayLabels(labels);
  const counter = new Map<string, SpeakerFilterOption>();
  for (const assignment of assignments) {
    const key = assignment.speakerKey.trim();
    if (!key || key === 'unknown-speaker') continue;
    const speakerVisual = speakerVisualByUnitId[assignment.unitId];
    const existing = counter.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counter.set(key, {
      key,
      name: speakerVisual?.name ?? resolvedLabels.unassignedSpeaker,
      count: 1,
      ...(speakerVisual?.color ? { color: speakerVisual.color } : {}),
    });
  }
  return Array.from(counter.values()).sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-Hans-CN'),
  );
}

export function buildSpeakerVisualMap(
  utterances: UtteranceDocType[],
  speakerOptions: SpeakerDocType[],
  labels?: Partial<SpeakerDisplayLabels>,
): Record<string, SpeakerVisual> {
  return buildSpeakerVisualMapFromKeys(
    utterances.map((utterance) => ({
      unitId: utterance.id,
      speakerKey: getUtteranceSpeakerKey(utterance),
    })),
    speakerOptions,
    labels,
  );
}

export function buildSpeakerFilterOptions(
  utterances: UtteranceDocType[],
  speakerVisualByUtteranceId: Record<string, SpeakerVisual>,
  labels?: Partial<SpeakerDisplayLabels>,
): SpeakerFilterOption[] {
  return buildSpeakerFilterOptionsFromKeys(
    utterances.map((utterance) => ({
      unitId: utterance.id,
      speakerKey: getUtteranceSpeakerKey(utterance),
    })),
    speakerVisualByUtteranceId,
    labels,
  );
}

export function buildSelectedSpeakerSummary(
  selectedBatchUtterances: UtteranceDocType[],
  speakerOptions: SpeakerDocType[],
  labels?: Partial<SpeakerSelectionSummaryLabels>,
): string {
  const resolvedLabels = resolveSpeakerSelectionSummaryLabels(labels);
  if (selectedBatchUtterances.length === 0) {
    return resolvedLabels.noSelectionUtterances;
  }
  const speakerById = new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const));
  const assigned = selectedBatchUtterances.filter((utterance) => getUtteranceSpeakerKey(utterance));
  if (assigned.length === 0) return resolvedLabels.noneAssignedUtterances;
  const keys = new Set(assigned.map((utterance) => getUtteranceSpeakerKey(utterance)));
  if (keys.size === 1) {
    const first = assigned[0];
    if (!first) return resolvedLabels.noneAssignedUtterances;
    return resolvedLabels.singleSpeakerSummary(getSpeakerDisplayName(first, speakerById, resolvedLabels));
  }
  return resolvedLabels.multipleSpeakersSummary(keys.size);
}

export function applySpeakerAssignmentToUtterances(
  utterances: UtteranceDocType[],
  utteranceIds: Iterable<string>,
  speaker?: Pick<SpeakerDocType, 'id' | 'name'>,
): UtteranceDocType[] {
  const targetIds = new Set(Array.from(utteranceIds));
  return utterances.map((utterance) => {
    if (!targetIds.has(utterance.id)) return utterance;
    const { speaker: _legacySpeaker, speakerId: _legacySpeakerId, ...rest } = utterance;
    return speaker
      ? { ...rest, speakerId: speaker.id, speaker: speaker.name }
      : rest;
  });
}

export function renameSpeakerInUtterances(
  utterances: UtteranceDocType[],
  speakerId: string,
  nextName: string,
): UtteranceDocType[] {
  return utterances.map((utterance) => (
    utterance.speakerId === speakerId
      ? { ...utterance, speaker: nextName }
      : utterance
  ));
}
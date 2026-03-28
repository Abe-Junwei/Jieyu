/**
 * Speaker utilities | 说话人工具函数
 */

import type { SpeakerDocType, UtteranceDocType } from '../../db';
import type { SpeakerFilterOption, SpeakerVisual } from './types';

const SPEAKER_TRACK_COLORS = [
  '#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#15803d', '#b45309', '#0891b2',
] as const;

type SpeakerKeyAssignment = {
  unitId: string;
  speakerKey: string;
};

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
  speakerById: Map<string, SpeakerDocType>,
): string {
  const normalizedKey = speakerKey.trim();
  if (!normalizedKey || normalizedKey === 'unknown-speaker') return '未命名说话人';
  return speakerById.get(normalizedKey)?.name ?? normalizedKey;
}

export function getSpeakerDisplayName(
  utterance: Pick<UtteranceDocType, 'speakerId' | 'speaker'>,
  speakerById: Map<string, SpeakerDocType>,
): string {
  const speakerId = utterance.speakerId?.trim();
  if (speakerId) {
    return speakerById.get(speakerId)?.name ?? normalizeSpeakerName(utterance.speaker) ?? speakerId;
  }
  return normalizeSpeakerName(utterance.speaker) || '未命名说话人';
}

export function buildSpeakerVisualMapFromKeys(
  assignments: SpeakerKeyAssignment[],
  speakerOptions: SpeakerDocType[],
): Record<string, SpeakerVisual> {
  const speakerById = new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const));
  const nextMap: Record<string, SpeakerVisual> = {};
  for (const assignment of assignments) {
    const speakerKey = assignment.speakerKey.trim();
    if (!speakerKey || speakerKey === 'unknown-speaker') continue;
    const color = SPEAKER_TRACK_COLORS[hashSpeakerKey(speakerKey) % SPEAKER_TRACK_COLORS.length]
      ?? SPEAKER_TRACK_COLORS[0];
    nextMap[assignment.unitId] = {
      name: getSpeakerDisplayNameByKey(speakerKey, speakerById),
      color,
    };
  }
  return nextMap;
}

export function buildSpeakerFilterOptionsFromKeys(
  assignments: SpeakerKeyAssignment[],
  speakerVisualByUnitId: Record<string, SpeakerVisual>,
): SpeakerFilterOption[] {
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
      name: speakerVisual?.name ?? '未标注说话人',
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
): Record<string, SpeakerVisual> {
  return buildSpeakerVisualMapFromKeys(
    utterances.map((utterance) => ({
      unitId: utterance.id,
      speakerKey: getUtteranceSpeakerKey(utterance),
    })),
    speakerOptions,
  );
}

export function buildSpeakerFilterOptions(
  utterances: UtteranceDocType[],
  speakerVisualByUtteranceId: Record<string, SpeakerVisual>,
): SpeakerFilterOption[] {
  return buildSpeakerFilterOptionsFromKeys(
    utterances.map((utterance) => ({
      unitId: utterance.id,
      speakerKey: getUtteranceSpeakerKey(utterance),
    })),
    speakerVisualByUtteranceId,
  );
}

export function buildSelectedSpeakerSummary(
  selectedBatchUtterances: UtteranceDocType[],
  speakerOptions: SpeakerDocType[],
): string {
  if (selectedBatchUtterances.length === 0) return '未选择句段';
  const speakerById = new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const));
  const assigned = selectedBatchUtterances.filter((utterance) => getUtteranceSpeakerKey(utterance));
  if (assigned.length === 0) return '已选句段均未标注说话人';
  const keys = new Set(assigned.map((utterance) => getUtteranceSpeakerKey(utterance)));
  if (keys.size === 1) {
    const first = assigned[0];
    if (!first) return '已选句段均未标注说话人';
    return `当前统一说话人：${getSpeakerDisplayName(first, speakerById)}`;
  }
  return `当前包含 ${keys.size} 位说话人`;
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
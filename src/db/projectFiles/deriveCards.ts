/**
 * 卡片清单是扫描结果，删掉以后再扫，文稿 id 和它引用的音频 id 不变。
 * 同一 id 出现两次时停下，不自己选。隐藏只记在卡片上，不改变配对。
 */

import { HIDDEN_DIRECTORY } from './fileOps';

export interface StoredManuscript {
  id: string;
  relPath: string;
  audioId: string | null;
}

export interface StoredAudio {
  id: string;
  relPath: string;
  sha256: string;
}

export interface DerivedCard {
  manuscriptId: string | null;
  audioId: string | null;
  hidden: boolean;
}

export interface DeriveCardsIssue {
  kind: 'duplicate-manuscript' | 'duplicate-audio';
  id: string;
}

export interface DeriveCardsResult {
  cards: DerivedCard[];
  issues: DeriveCardsIssue[];
}

function isHidden(relPath: string): boolean {
  return relPath.split(/[/\\]/).includes(HIDDEN_DIRECTORY);
}

function groupById<T extends { id: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.id);
    if (list) list.push(row);
    else groups.set(row.id, [row]);
  }
  return groups;
}

export function deriveCards(
  manuscripts: readonly StoredManuscript[],
  audios: readonly StoredAudio[],
): DeriveCardsResult {
  const issues: DeriveCardsIssue[] = [];
  const manuscriptGroups = groupById(manuscripts);
  const audioGroups = groupById(audios);
  const cards: DerivedCard[] = [];
  const usedAudioIds = new Set<string>();

  for (const [id, rows] of manuscriptGroups) {
    if (rows.length > 1) {
      issues.push({ kind: 'duplicate-manuscript', id });
      continue;
    }
    const manuscript = rows[0];
    if (!manuscript) continue;
    const audioId = manuscript.audioId;
    if (audioId !== null && (audioGroups.get(audioId)?.length ?? 0) > 1) {
      issues.push({ kind: 'duplicate-audio', id: audioId });
      continue;
    }
    if (audioId !== null) usedAudioIds.add(audioId);
    cards.push({
      manuscriptId: id,
      audioId,
      hidden: isHidden(manuscript.relPath),
    });
  }

  for (const [id, rows] of audioGroups) {
    if (usedAudioIds.has(id)) continue;
    if (rows.length > 1) {
      issues.push({ kind: 'duplicate-audio', id });
      continue;
    }
    const audio = rows[0];
    if (!audio) continue;
    cards.push({
      manuscriptId: null,
      audioId: id,
      hidden: isHidden(audio.relPath),
    });
  }

  const key = (card: DerivedCard) =>
    `${card.manuscriptId === null ? '1' : '0'}${card.manuscriptId ?? ''}\0${card.audioId ?? ''}`;
  cards.sort((a, b) => key(a).localeCompare(key(b)));
  return { cards, issues };
}

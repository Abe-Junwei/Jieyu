import type { UserNoteDocType } from '../../db';

export function extractUtteranceIdFromNote(note: Pick<UserNoteDocType, 'targetType' | 'targetId' | 'parentTargetId'>): string | null {
  if (note.targetType === 'utterance') {
    return note.targetId;
  }
  if (note.targetType === 'tier_annotation') {
    return note.targetId.split('::')[0] ?? null;
  }
  if (note.targetType === 'token') {
    return note.parentTargetId ?? note.targetId.split('::')[0] ?? null;
  }
  if (note.targetType === 'morpheme') {
    return note.parentTargetId?.split('::')[0] ?? note.targetId.split('::')[0] ?? null;
  }
  return null;
}

export function splitPdfCitationRef(refId: string): { baseRef: string; hashSuffix: string } {
  const trimmedRef = refId.trim();
  const hashIndex = trimmedRef.indexOf('#');
  if (hashIndex < 0) {
    return { baseRef: trimmedRef, hashSuffix: '' };
  }
  return {
    baseRef: trimmedRef.slice(0, hashIndex),
    hashSuffix: trimmedRef.slice(hashIndex),
  };
}

export function isDirectPdfCitationRef(refId: string): boolean {
  const trimmedRef = refId.trim();
  return /^(https?:\/\/|blob:|data:application\/pdf|file:\/\/)/i.test(trimmedRef);
}

export function getPdfPageFromHash(hashSuffix: string): number | null {
  if (!hashSuffix) return null;
  const match = hashSuffix.match(/[?#&]page=(\d+)/i) ?? hashSuffix.match(/^#(\d+)$/);
  if (!match || !match[1]) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

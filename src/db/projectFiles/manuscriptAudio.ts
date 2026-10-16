/**
 * 一份文稿同时只关联一条音频。换成另一条是替换，不是再挂上一条。
 * 一个语段只有一个 mediaId。
 */

export interface UnitAudioRef {
  id: string;
  mediaId?: string;
}

export type ManuscriptAudioIssue =
  | { kind: 'multiple-audios'; audioIds: string[] }
  | { kind: 'header-mismatch'; audioId: string | null; unitAudioId: string };

function audioIdOf(mediaId: string | undefined): string | null {
  const trimmed = mediaId?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function unitAudioIds(units: readonly UnitAudioRef[]): string[] {
  const ids = new Set<string>();
  for (const unit of units) {
    const id = audioIdOf(unit.mediaId);
    if (id !== null) ids.add(id);
  }
  return [...ids].sort();
}

/** 文稿头上的音频和语段上的 mediaId 必须是同一条，或者都没有。 */
export function manuscriptAudioIssue(
  audioId: string | null,
  units: readonly UnitAudioRef[],
): ManuscriptAudioIssue | null {
  const ids = unitAudioIds(units);
  if (ids.length > 1) return { kind: 'multiple-audios', audioIds: ids };
  const unitAudioId = ids[0];
  if (unitAudioId !== undefined && audioId !== unitAudioId) {
    return { kind: 'header-mismatch', audioId, unitAudioId };
  }
  return null;
}

/** 把这份文稿改挂到另一条音频，或摘掉音频。每个语段只保留这一个 mediaId。 */
export function associateAudio(
  units: readonly UnitAudioRef[],
  next: string | null,
): { audioId: string | null; units: UnitAudioRef[] } {
  const audioId = audioIdOf(next ?? undefined);
  return {
    audioId,
    units: units.map((unit) => {
      if (audioId === null) {
        const { mediaId: _dropped, ...rest } = unit;
        return rest;
      }
      return { ...unit, mediaId: audioId };
    }),
  };
}

import type { SourceRecordDocType } from '../db/types';

export type SourceImportCandidate = {
  textId: string;
  originalName: string;
  format: string;
  sha256?: string;
  externalDocId?: string;
};

/** 登记前的预览结果 | Preview of what registration will do */
export type SourceImportPlan =
  | { kind: 'update-existing'; record: SourceRecordDocType }
  | { kind: 'same-content'; record: SourceRecordDocType }
  | { kind: 'new'; displayName: string };

export class SourceMediaLinkError extends Error {
  constructor(
    public readonly reason: 'media-missing' | 'media-other-project',
    public readonly mediaId: string,
  ) {
    super(
      reason === 'media-missing'
        ? `recording "${mediaId}" does not exist`
        : `recording "${mediaId}" belongs to another project`,
    );
    this.name = 'SourceMediaLinkError';
  }
}

export class SourceProjectNotFoundError extends Error {
  constructor(public readonly textId: string) {
    super(`project "${textId}" does not exist`);
    this.name = 'SourceProjectNotFoundError';
  }
}

function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/** 显示名在项目内（不分大小写）唯一 | Display names are unique per project, case-insensitively */
export function uniqueSourceDisplayName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((value) => value.trim().toLocaleLowerCase()));
  const base = name.trim();
  if (!used.has(base.toLocaleLowerCase())) return base;
  const { stem, ext } = splitName(base);
  for (let n = 2; ; n += 1) {
    const next = `${stem} (${n})${ext}`;
    if (!used.has(next.toLocaleLowerCase())) return next;
  }
}

/** 纯函数：按 4.2-2 的顺序判定重新导入 | Pure: classify a (re-)import in rev5 4.2-2 order */
export function planSourceImport(
  candidate: SourceImportCandidate,
  existing: readonly SourceRecordDocType[],
): SourceImportPlan {
  const own = existing.filter((row) => row.textId === candidate.textId);
  const urn = candidate.externalDocId?.trim();
  if (urn) {
    const byUrn = own.find((row) => row.externalDocId === urn);
    if (byUrn) return { kind: 'update-existing', record: byUrn };
  }
  if (candidate.sha256) {
    const bySha = own.find((row) => row.sha256 === candidate.sha256);
    if (bySha) return { kind: 'same-content', record: bySha };
  }
  return {
    kind: 'new',
    displayName: uniqueSourceDisplayName(
      candidate.originalName,
      own.map((row) => row.displayName),
    ),
  };
}

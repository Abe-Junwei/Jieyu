/**
 * 入站字节保留 | Inbound byte preservation
 *
 * 导入、恢复与协作 restore 时，入站行若不带字节（导出时省略、或本就未携带），
 * 永远不能被理解为「删除本机字节」：要么保留本机同 id 行的字节，要么中止整个操作。
 * Inbound rows without bytes never mean "delete local bytes": either keep the local bytes
 * of the same id or abort the whole operation (rev5 §4.2-7, Batch 1 / N2).
 *
 * 必须在导入写事务内调用，以保证「读本机字节 → 删除/替换 → 写回」原子。
 * Must run inside the import write transaction so read → prune/replace → write is atomic.
 */
import type { Table } from 'dexie';

/** 导出时写入 media_items.details 的省略标记 | Omission marker on media_items.details */
export const MEDIA_AUDIO_EXPORT_OMITTED_KEY = 'audioExportOmitted';
/** 被省略音频的字节数（供入站校验）| Byte size of the omitted audio (inbound check) */
export const MEDIA_AUDIO_EXPORT_OMITTED_BYTE_SIZE_KEY = 'audioExportOmittedByteSize';
/** 被省略音频的 MIME（供入站校验）| MIME type of the omitted audio (inbound check) */
export const MEDIA_AUDIO_EXPORT_OMITTED_MIME_TYPE_KEY = 'audioExportOmittedMimeType';

const MEDIA_OMISSION_KEYS = [
  MEDIA_AUDIO_EXPORT_OMITTED_KEY,
  MEDIA_AUDIO_EXPORT_OMITTED_BYTE_SIZE_KEY,
  MEDIA_AUDIO_EXPORT_OMITTED_MIME_TYPE_KEY,
] as const;

export type InboundByteConflictReason =
  | 'project-mismatch'
  | 'size-mismatch'
  | 'type-mismatch'
  | 'placeholder-over-local-bytes';

export interface InboundByteConflict {
  collection: 'media_items' | 'lexeme_assets';
  id: string;
  reason: InboundByteConflictReason;
}

/**
 * 入站行与本机字节冲突、无法安全保留时抛出；整个导入事务随之回滚。
 * Thrown when inbound rows conflict with local bytes; the whole import transaction rolls back.
 */
export class InboundByteConflictError extends Error {
  readonly conflicts: readonly InboundByteConflict[];

  constructor(conflicts: readonly InboundByteConflict[]) {
    const summary = conflicts
      .slice(0, 5)
      .map((c) => `${c.collection}:${c.id}(${c.reason})`)
      .join(', ');
    super(
      `Import aborted: ${conflicts.length} row(s) arrive without bytes but cannot safely keep local bytes [${summary}${conflicts.length > 5 ? ', …' : ''}]; local data unchanged.`,
    );
    this.name = 'InboundByteConflictError';
    this.conflicts = conflicts;
  }
}

type Row = Record<string, unknown> & { id: string };

/**
 * 入站媒体行如果声明 `managed` 却没带字节（导出时省略），先改写成 `none + missing`，保留已知的
 * `contentSize` / `contentSha256`；之后如果本机有同一 ID 的字节，再由 `mergeInboundMediaRow` 换回本机状态。
 * 不推断任何缺失的状态字段：缺字段的行交给校验拒绝（rev5 §4.2-7，2B-C）。
 * Inbound media rows that declare `managed` but carry no bytes (omitted on export) become
 * `none + missing`, keeping any known content fingerprint; local bytes of the same id are restored
 * later by `mergeInboundMediaRow`. Missing state fields are never inferred; validation rejects them.
 */
export function normalizeInboundMediaByteState(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const details = asRecord(doc['details']);
  const blob = details['audioBlob'];
  if (blob instanceof Blob) {
    // 带字节入站：字节数以实际字节为准 | Included bytes: size follows the actual bytes
    return doc['contentSize'] === blob.size ? doc : { ...doc, contentSize: blob.size };
  }
  if (doc['byteLocation'] !== 'managed' || doc['availability'] !== 'available') return doc;
  return { ...doc, byteLocation: 'none', availability: 'missing' };
}

type MergeOutcome =
  | { kind: 'keep-incoming' }
  | { kind: 'preserved'; doc: Row }
  | { kind: 'conflict'; reason: InboundByteConflictReason };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function mimeConflicts(declared: unknown, local: Blob): boolean {
  const a = nonEmptyString(declared);
  const b = nonEmptyString(local.type);
  return a !== undefined && b !== undefined && a.toLowerCase() !== b.toLowerCase();
}

/**
 * 合并一条入站 media_items 行与本机同 id 行。| Merge one inbound media row with the local row of the same id.
 */
export function mergeInboundMediaRow(incoming: Row, local: Row | undefined): MergeOutcome {
  const localBlob = asRecord(local?.['details'])['audioBlob'];
  if (!local || !(localBlob instanceof Blob)) return { kind: 'keep-incoming' };

  const incomingDetails = asRecord(incoming['details']);
  if (incomingDetails['audioBlob'] instanceof Blob) return { kind: 'keep-incoming' };

  if (incoming['textId'] !== local['textId']) {
    return { kind: 'conflict', reason: 'project-mismatch' };
  }

  const markedOmitted = incomingDetails[MEDIA_AUDIO_EXPORT_OMITTED_KEY] === true;
  const declaresPlaceholder = incoming['timelineKind'] === 'placeholder';
  if (!markedOmitted && declaresPlaceholder) {
    // 入站明确声明「无音频的占位行」，而本机有字节：不静默丢弃，也不强行复活。
    // Inbound explicitly says placeholder while local holds bytes: neither drop nor resurrect.
    return { kind: 'conflict', reason: 'placeholder-over-local-bytes' };
  }

  const declaredSize = incomingDetails[MEDIA_AUDIO_EXPORT_OMITTED_BYTE_SIZE_KEY];
  if (typeof declaredSize === 'number' && declaredSize !== localBlob.size) {
    return { kind: 'conflict', reason: 'size-mismatch' };
  }
  if (mimeConflicts(incomingDetails[MEDIA_AUDIO_EXPORT_OMITTED_MIME_TYPE_KEY], localBlob)) {
    return { kind: 'conflict', reason: 'type-mismatch' };
  }

  const nextDetails: Record<string, unknown> = { ...incomingDetails };
  for (const key of MEDIA_OMISSION_KEYS) delete nextDetails[key];
  nextDetails['audioBlob'] = localBlob;
  // 字节与对应的状态、指纹一起保留（rev5 §4.2-7）| Keep the bytes together with their state and fingerprint
  const doc: Row = {
    ...incoming,
    details: nextDetails,
    byteLocation: 'managed',
    availability: 'available',
    contentSize: localBlob.size,
  };
  if (typeof local['contentSha256'] === 'string') doc['contentSha256'] = local['contentSha256'];
  else delete doc['contentSha256'];
  return { kind: 'preserved', doc };
}

/**
 * 合并一条入站 lexeme_assets 行与本机同 id 行。| Merge one inbound lexeme asset with the local row.
 */
export function mergeInboundLexemeAssetRow(incoming: Row, local: Row | undefined): MergeOutcome {
  const localBlob = local?.['blob'];
  if (!local || !(localBlob instanceof Blob)) return { kind: 'keep-incoming' };
  if (incoming['blob'] instanceof Blob) return { kind: 'keep-incoming' };

  const incomingTextId = nonEmptyString(incoming['textId']);
  const localTextId = nonEmptyString(local['textId']);
  if (incomingTextId !== undefined && localTextId !== undefined && incomingTextId !== localTextId) {
    return { kind: 'conflict', reason: 'project-mismatch' };
  }
  const declaredSize = incoming['byteSize'];
  if (typeof declaredSize === 'number' && declaredSize !== localBlob.size) {
    return { kind: 'conflict', reason: 'size-mismatch' };
  }
  if (mimeConflicts(incoming['mimeType'], localBlob)) {
    return { kind: 'conflict', reason: 'type-mismatch' };
  }

  const { blobExportOmitted: _omitted, ...rest } = incoming;
  return { kind: 'preserved', doc: { ...rest, id: incoming.id, blob: localBlob } };
}

export type InboundByteCollection = 'media_items' | 'lexeme_assets';

export function isInboundByteCollection(name: string): name is InboundByteCollection {
  return name === 'media_items' || name === 'lexeme_assets';
}

/**
 * 读取本机同 id 行，生成保留了本机字节的入站文档；任何冲突都抛出 InboundByteConflictError。
 * Reads local rows with the same ids and returns inbound docs with local bytes kept;
 * any conflict throws InboundByteConflictError. Call inside the import transaction.
 */
export async function preserveLocalBytesForInbound(
  collection: InboundByteCollection,
  docs: readonly unknown[],
  table: Table<any, any, any>,
): Promise<{ docs: unknown[]; preserved: number; conflicts: InboundByteConflict[] }> {
  if (docs.length === 0) return { docs: [], preserved: 0, conflicts: [] };
  const rows = docs as Row[];
  const locals = (await table.bulkGet(rows.map((row) => row.id))) as Array<Row | undefined>;
  const merge = collection === 'media_items' ? mergeInboundMediaRow : mergeInboundLexemeAssetRow;
  const out: unknown[] = [];
  const conflicts: InboundByteConflict[] = [];
  let preserved = 0;
  rows.forEach((row, index) => {
    const outcome = merge(row, locals[index] ?? undefined);
    if (outcome.kind === 'conflict') {
      conflicts.push({ collection, id: row.id, reason: outcome.reason });
      out.push(row);
    } else if (outcome.kind === 'preserved') {
      preserved += 1;
      out.push(outcome.doc);
    } else {
      out.push(row);
    }
  });
  return { docs: out, preserved, conflicts };
}

/**
 * 识别服务器端写入关卡返回的错误码（见 supabase/sql/001_collaboration_baseline.sql，rev5 9.2、9.3）。
 * Classify the error codes raised by the server-side write gates (rev5 9.2, 9.3).
 */

export type CollaborationServerRejection =
  | 'project-deleted'
  | 'protocol-mismatch'
  | 'client-version-too-old'
  | 'immutable-column'
  | 'owner-only'
  | 'unknown-project';

const REJECTION_BY_CODE: Record<string, CollaborationServerRejection> = {
  JYDEL: 'project-deleted',
  JYPRT: 'protocol-mismatch',
  JYVER: 'client-version-too-old',
  JYIMM: 'immutable-column',
  JYOWN: 'owner-only',
  JYNOP: 'unknown-project',
};

const REJECTION_BY_MESSAGE: Array<[string, CollaborationServerRejection]> = [
  ['JIEYU_PROJECT_DELETED', 'project-deleted'],
  ['JIEYU_PROTOCOL_MISMATCH', 'protocol-mismatch'],
  ['JIEYU_CLIENT_TOO_OLD', 'client-version-too-old'],
  ['JIEYU_IMMUTABLE_COLUMN', 'immutable-column'],
  ['JIEYU_OWNER_ONLY', 'owner-only'],
  ['JIEYU_UNKNOWN_PROJECT', 'unknown-project'],
];

/** PostgREST 错误的 `code` 就是 SQLSTATE | A PostgREST error's `code` carries the SQLSTATE */
export function classifyCollaborationServerRejection(
  error: unknown,
): CollaborationServerRejection | null {
  if (error === null || typeof error !== 'object') return null;
  const source = error as { code?: unknown; message?: unknown };
  if (typeof source.code === 'string') {
    const byCode = REJECTION_BY_CODE[source.code.trim().toUpperCase()];
    if (byCode !== undefined) return byCode;
  }
  if (typeof source.message === 'string') {
    for (const [marker, rejection] of REJECTION_BY_MESSAGE) {
      if (source.message.includes(marker)) return rejection;
    }
  }
  return null;
}

/** 这类拒绝说明本客户端已过时，应进入只读并提示刷新 | Rejections that mean this client is outdated */
export function isOutdatedClientRejection(rejection: CollaborationServerRejection | null): boolean {
  return rejection === 'protocol-mismatch' || rejection === 'client-version-too-old';
}

/**
 * 目录归属（rev5 4.2-9 / D3 / D11；切片 2B-B）| Catalog ownership (rev5 4.2-9 / D3 / D11; slice 2B-B)
 *
 * - 每个目录行在写入时就带上所属项目；没有项目时 service 直接拒绝（`CatalogProjectRequiredError`）。
 * - 读操作只按项目过滤，从不产生写入；没有项目时返回空（D11：页面先要求选择项目）。
 * - 不再有“认领无主行”：统一写入校验保证库里不存在无主目录行。
 * - Every catalog row is written with its owning project; services refuse writes without one.
 * - Reads only filter by project and never write; without a project they return nothing (D11).
 * - There is no "claim unscoped rows" step any more: write validation keeps such rows out.
 */
import type { LexemeDocType } from '../db/types';
import { getActiveProjectTextId } from '../utils/transcriptionUrlDeepLink';

const CATALOG_PROJECT_REQUIRED_CODE = 'CATALOG_PROJECT_REQUIRED';

/** 没有活动项目时写目录 | Catalog write attempted without an active project */
export class CatalogProjectRequiredError extends Error {
  readonly code = CATALOG_PROJECT_REQUIRED_CODE;

  constructor() {
    super('Select a project first: catalog data always belongs to a project.');
    this.name = 'CatalogProjectRequiredError';
  }
}

/** 目录行与操作对象属于不同项目 | Catalog row used with data of another project */
export class CatalogOwnershipMismatchError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rowId: string,
    public readonly ownerProjectId: string,
    public readonly otherProjectId: string,
  ) {
    super(
      `${tableName} row "${rowId}" belongs to project "${ownerProjectId}" and cannot be used in project "${otherProjectId}"; copy it into that project instead`,
    );
    this.name = 'CatalogOwnershipMismatchError';
  }
}

/** 目录读取用：显式项目优先，否则当前活动项目；可能为空 | For reads: explicit project, else the active one */
export function activeCatalogProjectId(explicit?: string): string {
  const given = explicit?.trim() ?? '';
  if (given.length > 0) return given;
  return getActiveProjectTextId().trim();
}

/** 目录写入用：拿不到项目就抛错 | For writes: throws when no project is available */
export function requireCatalogProjectId(explicit?: string): string {
  const projectId = activeCatalogProjectId(explicit);
  if (projectId.length === 0) throw new CatalogProjectRequiredError();
  return projectId;
}

/** 新目录行 ID（UUID）| New catalog row id (UUID) */
export function newCatalogUuid(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  // 非安全上下文（如 http://局域网 IP）没有 randomUUID，但有 getRandomValues：按 RFC 9562 拼 v4。
  // Non-secure contexts (e.g. http://LAN-IP) lack randomUUID but keep getRandomValues: build a v4 UUID.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function lexemeBelongsToProject(lexeme: LexemeDocType, textId: string): boolean {
  return lexeme.textId.trim() === textId.trim();
}

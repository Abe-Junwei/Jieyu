/**
 * 应用服务层公共契约 — 跨域共享类型
 * Application service layer shared contracts — cross-domain shared types
 */

// ── 操作结果 | Operation result ──

export interface AppServiceResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ── 分页 | Pagination ──

export interface PaginationParams {
  offset: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// ── 应用服务元信息 | Application service metadata ──

export interface AppServiceMeta {
  /** 服务域名 | Service domain name */
  readonly domain: 'transcription' | 'ai' | 'language-assets';
  /** 服务版本，随 M4+ 迁移递增 | Service version, incremented with M4+ migrations */
  readonly version: number;
}

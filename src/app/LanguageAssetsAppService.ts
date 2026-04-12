/**
 * 语言资产域应用服务 — 页面与底层之间的编排层
 * Language assets domain application service — orchestration layer between pages and infrastructure
 *
 * 职责 | Responsibilities:
 * 1. 语言元数据 CRUD（语言、正字法、别名、位置、参考文献等）
 * 2. 语言目录搜索与缓存编排
 * 3. 正字法桥接管理
 * 4. 自定义字段定义与值管理
 *
 * 限制 | Constraints:
 * - 不持有 React 状态（无 useState/useEffect）
 * - 仅依赖 db 层和 services 层
 * - 页面通过 hook 调用本服务，不直接操作底层
 */
import type { AppServiceMeta, AppServiceResult, PaginatedResult, PaginationParams } from './contracts';

export const LanguageAssetsAppServiceMeta: AppServiceMeta = {
  domain: 'language-assets',
  version: 1,
} as const;

// ── 语言操作契约 | Language operation contracts ──

export interface LanguageSummary {
  id: string;
  iso639_3?: string;
  displayName: string;
  region?: string;
}

export interface SearchLanguageCatalogRequest {
  query: string;
  pagination?: PaginationParams;
}

// ── 正字法契约 | Orthography contracts ──

export interface OrthographySummary {
  id: string;
  languageId: string;
  scriptCode?: string;
  displayName: string;
}

// ── 应用服务接口（M4 绞杀迁移逐步实现） | Application service interface (implemented incrementally during M4 strangler migration) ──

export interface ILanguageAssetsAppService {
  searchCatalog(request: SearchLanguageCatalogRequest): Promise<AppServiceResult<PaginatedResult<LanguageSummary>>>;
  getOrthographies(languageId: string): Promise<AppServiceResult<OrthographySummary[]>>;
}

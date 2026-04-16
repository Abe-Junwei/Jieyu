/**
 * 应用服务层桶文件 — 领域边界入口
 * Application Service layer barrel — domain boundary entry point
 *
 * 依赖方向：page → app → (hooks | services | db)
 * Dependency direction: page → app → (hooks | services | db)
 *
 * 页面层和组件层禁止直接 import db / services，
 * 新增功能一律通过本层暴露的应用服务接入。
 * Pages and components must NOT import db / services directly;
 * all new features must go through application services exposed here.
 */

export * from './TranscriptionAppService';
export * from './AiAppService';
export * from './LanguageAssetsAppService';
export * from './contracts';

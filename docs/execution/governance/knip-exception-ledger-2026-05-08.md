---
title: Knip 例外清单（2026-05-08）
doc_type: execution-governance-ledger
status: active
owner: repo
last_reviewed: 2026-05-08
source_of_truth: knip-exceptions
---

# Knip 例外清单（2026-05-08）

本文件记录 `knip.json` 中所有 `ignore`、`ignoreIssues`、`ignoreDependencies`、`ignoreBinaries` 的**书面理由**。每次修改 `knip.json` 时，必须同步更新本文件。

> **当前状态**：`npx knip --no-progress` 通过；`npx knip --no-progress --include-entry-exports` 通过。

---

## 1. 被忽略的文件（`ignore`）

| 文件路径 | 理由 | 复审条件 |
|----------|------|----------|
| `src/ai/embeddings/embeddingSmokeTest.ts` | 烟雾测试脚本，由 CI 条件触发（`EMBEDDING_SMOKE=1`）运行，非常规入口 | CI 触发条件变更时复审 |
| `src/ai/mcp/client/mcpClientTypes.ts` | MCP 客户端类型定义文件，当前为协议占位；类型被外部引用但文件本身无运行时入口 | MCP 功能上线后复审 |
| `src/ai/perf/embeddingModelDecision.ts` | 性能决策记录文件，属文档/决策日志性质，无运行时调用方 | 嵌入模型策略变更时复审 |
| `src/assets/lottie/left-rail/leftRailLottieMap.ts` | Lottie 动画资源映射表，由构建脚本动态消费（`build-left-rail-lottie-icons.mjs`），非标准 import 路径 | 构建脚本重构时复审 |
| `src/data/generated/languageNameCatalog.generated.ts` | 生成文件，由 `generate-language-name-indexes.mjs` 产出并写入 `public/data/`；`.ts` 文件为类型兼容保留但无生产 import | 生成脚本输出策略变更时复审 |
| `src/pages/annotation/annotationLaneReadScope.ts` | 注释页面读作用域定义，当前注释功能为 beta 态，读作用域未完全接入主路径 | 注释功能 GA 时复审 |
| `src/services/VoiceAgentService.singleton.ts` | 语音代理单例管理器，为语音功能预留的架构插槽，当前未完全激活 | 语音功能全面上线时复审 |

---

## 2. 被忽略的问题（`ignoreIssues`）

| 文件路径 | 忽略类型 | 理由 | 复审条件 |
|----------|----------|------|----------|
| `src/ai/chat/toolCallSchemas.ts` | `exports` | Zod schema 定义文件，schema 对象通过 `toolCallSchemas` 聚合导出供外部使用；单独导出为内部组织，无外部直接引用属预期 | 工具调用架构重构时复审 |
| `src/annotation/analysisGraph.ts` | `exports` | 分析图类型与算法导出，为注释系统预留的扩展点；当前仅部分类型被引用 | 注释分析图功能扩展时复审 |
| `src/annotation/structuralRuleProfile.ts` | `exports` | 结构规则配置导出，为注释规则引擎预留；当前规则引擎未完全接入 | 规则引擎上线时复审 |
| `src/data/languageCatalogRuntimeCache.ts` | `exports` | 语言目录运行时缓存工具函数，部分函数为内部优化保留，外部仅使用主要入口 | 缓存策略重构时复审 |
| `src/data/languageNameTypes.ts` | `types` | 纯类型定义文件，类型通过 `import type` 被引用但 Knip 在 `--include-entry-exports` 模式下可能误判 | 类型导出结构变更时复审 |
| `src/db/index.ts` | `exports` | Dexie DB 集合与索引导出，部分集合为历史兼容保留，当前版本未完全使用 | DB schema 迁移时复审 |
| `src/utils/transcriptionUnitLaneReadScope.ts` | `types` | 时间轴单元读作用域类型定义，为时间轴渲染优化预留；部分类型尚未被全量接入 | 时间轴渲染重构时复审 |
| `src/workerThreads.browser.ts` | `exports` | 浏览器 shim：`export const Worker = undefined;`。wavesurfer spectrogram 插件在 try/catch 中检测 `Worker`，保留导出可确保插件 fallback 路径正常工作 | wavesurfer 升级或替换时复审 |
| `src/integrations/supabase/storage.ts` | `exports` | Supabase 存储封装：聚合导出若干 helper；Knip 在 `--include-entry-exports` 下将部分符号判为未消费导出 | Supabase 接入路径稳定后复审 |
| `src/pages/transcriptionAcousticSummary.ts` | `exports` | 声学摘要页模块：导出供编排层聚合；部分导出为预留或测试桩 | 声学摘要 GA 或删除死导出时复审 |
| `src/pages/transcriptionTimelineWorkspacePanelTypes.ts` | `exports` | 时间轴工作区面板类型桶：类型/常量聚合导出，部分仅被 `import type` 或跨文件间接引用 | 面板类型收敛到单一入口时复审 |

---

## 3. 被忽略的依赖（`ignoreDependencies`）

| 依赖名 | 理由 | 复审条件 |
|--------|------|----------|
| `country-state-city` | 国家/城市数据包，由 `scripts/build-language-geodata-public.mjs`（已删除）和 `generate-language-name-indexes.mjs` 在构建时调用；运行时无直接 import | 地理数据生成脚本重构时复审 |

---

## 4. 被忽略的二进制（`ignoreBinaries`）

| 二进制名 | 理由 | 复审条件 |
|----------|------|----------|
| `knip` | Knip 自身为 devDependency，其 CLI 被 `package.json` scripts 调用；Knip 不报自身为未使用 | 永不（Knip 自身） |

---

## 5. 变更记录

| 日期 | 变更 | 执行人 |
|------|------|--------|
| 2026-05-08 | 初始清单，覆盖当前 `knip.json` 全部例外项 | 技术债修复方案 |
| 2026-05-08 | 新增 `src/workerThreads.browser.ts` exports 例外（Worker shim） | 技术债修复方案 |
| 2026-05-08 | 补齐 `ignoreIssues`：`storage.ts`、`transcriptionAcousticSummary.ts`、`transcriptionTimelineWorkspacePanelTypes.ts`；`language-subtag-registry` 从 `ignoreDependencies` 移除并写入 `devDependencies` | 技术债修复方案 |
| 2026-05-08 | `localContextToolTypes.ts`、`localContextToolScopeNormalize.ts` 为正常入口（**非** `knip.json` `ignore`）；用于消除 `madge` 环 | 技术债修复方案 |

---

## 6. 收敛目标

理想状态下，本清单应持续缩减。以下项有明确的关闭路径：

- [ ] `country-state-city`：若地理数据生成完全移至 CI pipeline 的独立容器，可从生产依赖移除
- [ ] `src/ai/mcp/client/mcpClientTypes.ts`：MCP 功能上线后转为正常入口文件
- [ ] `src/services/VoiceAgentService.singleton.ts`：语音功能全面激活后转为正常入口
- [ ] `src/pages/annotation/annotationLaneReadScope.ts`：注释功能 GA 后转为正常入口

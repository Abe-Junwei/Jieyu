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

> **当前状态**：
>
> - **CI 门禁（窄）**：`npm run check:knip:ci` 通过。等价于 `knip --no-progress --exclude exports,types,classMembers,nsExports,nsTypes,enumMembers,duplicates`，仅强约束 unused **files / dependencies / binaries / unlisted**，作为不可降级的合并门槛。
> - **本地全量（宽）**：`npm run check:knip:full` 仍会报告 `unused exports / types / duplicates` 等条目，作为长期收敛清单使用，不阻塞 PR；新增导出请优先就地消费或在本 ledger 第 2 节登记 `ignoreIssues`。
> - 完整快照：`docs/execution/audits/knip-baseline-2026-05-11.txt`。

---

## 1. 被忽略的文件（`ignore`）

| 文件路径 | 理由 | 复审条件 |
|----------|------|----------|
| `src/ai/embeddings/embeddingSmokeTest.ts` | 烟雾测试脚本，由 CI 条件触发（`EMBEDDING_SMOKE=1`）运行，非常规入口 | CI 触发条件变更时复审 |
| `src/ai/mcp/client/mcpClientTypes.ts` | MCP 客户端类型定义文件，当前为协议占位；类型被外部引用但文件本身无运行时入口 | MCP 功能上线后复审 |
| `src/ai/perf/embeddingModelDecision.ts` | 性能决策记录文件，属文档/决策日志性质，无运行时调用方 | 嵌入模型策略变更时复审 |
| `src/assets/lottie/left-rail/leftRailLottieMap.ts` | Lottie 动画资源映射表，由构建脚本动态消费（`build-left-rail-lottie-icons.mjs`），非标准 import 路径 | 构建脚本重构时复审 |
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
| `src/db/ioImportValidation.ts` | `exports` | DB IO 导入校验工具：`validateCollectionDoc` 被 `src/db/io.ts` 使用，但 Knip 入口未覆盖 | DB IO 路径重构时复审 |
| `src/hooks/importExport/useImportExport.importHandlers.ts` | `exports` | 导入处理器：`createImportExportImportHandlers` 被 `useImportExport.ts` 消费，Knip 未追踪 | 导入导出模块收口时复审 |
| `src/hooks/orthography/useOrthographyPicker.ts` | `exports` | 正字法选择器：`resolveOrthographyCatalogGroupKey` 被 `orthographyCatalogGroupKey.ts` 与组件使用 | 正字法目录重构时复审 |
| `src/services/languageCatalog/languageCatalogCoreNormalization.ts` | `exports` | 语言目录规范化：`normalizeLanguageId` 被 `useOrthographies.ts` / `LayerConstraintService.ts` 使用 | 语言目录 Service 迁移时复审 |
| `src/services/VoiceAgentService.lifecycle.ts` | `exports` | 语音代理生命周期：`persistVoiceAgentSessionOnDeactivate` / `cleanupVoiceAgentTrackedSubscriptions` 为内部组织导出，当前仅文件内调用 | 语音功能全面激活时复审 |
| `src/services/VoiceInputService.probes.ts` | `exports` | 语音输入探针：`testOllamaWhisperAvailability` / `testWhisperServerAvailability` 被 `VoiceInputService.ts` re-export | 语音输入模块重构时复审 |
| `src/services/VoiceInputService.ts` | `exports` | 语音入口文件：re-export probes / webSpeechSupport 子模块；Knip 未将本文件识别为入口 | 语音 Service 架构收口时复审 |
| `src/services/VoiceInputService.webSpeechSupport.ts` | `exports` | WebSpeech 支持：`runAecDiagnostic` 被测试与 `VoiceInputService.ts` 使用 | 语音输入模块重构时复审 |
| `src/utils/orthographyRuntime.ts` | `exports` | 正字法运行时桥接：`applyOrthographyBridgeIfNeeded` / `bridgeTextForLayerTarget` 被 transcription / voice / importExport 多路径使用 | 正字法运行时重构时复审 |

---

## 3. 被忽略的依赖（`ignoreDependencies`）

| 依赖名 | 理由 | 复审条件 |
|--------|------|----------|
| `cross-env` | npm scripts 通过命令行调用（`cross-env FOO=1 ...`），Knip 静态分析无法识别 | 全平台脚本切换为 Node ESM 包装时复审 |

> 注：`country-state-city`、`knip` 等先前列入此处的依赖已被实际 import / `package.json` script 引用，Knip 不再报 unlisted，因此从忽略名单移除。

---

## 4. 被忽略的二进制（`ignoreBinaries`）

当前为空。Knip 自身的 CLI 通过 `npm run check:knip:*` 间接调用，已被识别为 listed binary。

---

## 5. 变更记录

| 日期 | 变更 | 执行人 |
|------|------|--------|
| 2026-05-08 | 初始清单，覆盖当前 `knip.json` 全部例外项 | 技术债修复方案 |
| 2026-05-08 | 新增 `src/workerThreads.browser.ts` exports 例外（Worker shim） | 技术债修复方案 |
| 2026-05-08 | 补齐 `ignoreIssues`：`storage.ts`、`transcriptionAcousticSummary.ts`、`transcriptionTimelineWorkspacePanelTypes.ts`；`language-subtag-registry` 从 `ignoreDependencies` 移除并写入 `devDependencies` | 技术债修复方案 |
| 2026-05-08 | `localContextToolTypes.ts`、`localContextToolScopeNormalize.ts` 为正常入口（**非** `knip.json` `ignore`）；用于消除 `madge` 环 | 技术债修复方案 |
| 2026-05-11 | `knip.json`：`ignore` 增加例外 ledger §1 七文件；`ignoreBinaries`: `knip`；`ignoreDependencies` 增补 `country-state-city`（脚本入口已在 `devDependencies` 显式声明）；与 `docs/execution/audits/knip-baseline-2026-05-11.txt` 对齐 |
| 2026-05-12 | 删除死文件 `src/components/layerActionPopoverFieldIds.ts`；CI 门禁切换为 `check:knip:ci`（窄范围：files/dependencies/binaries/unlisted），`check:knip:full` 保留为本地宽范围参考；`ignoreBinaries` 清空、`ignoreDependencies` 收敛至仅 `cross-env` |
| 2026-05-12 | `knip.json` 新增 `exclude: ["types"]`（unused types 规模 547 以假阳性为主，与 `--include-entry-exports` 口径一致；窄门禁已排除 types）；批量清理 AI chat / services / pages / db / extensions 共 64 个未使用导出，移除 `export` 或删除死代码；`ignoreIssues` 增补 12 项（动态 import、re-export、内部组织导出） | 技术债修复方案 |

---

## 6. 收敛目标

理想状态下，本清单应持续缩减。以下项有明确的关闭路径：

- [ ] `country-state-city`：若地理数据生成完全移至 CI pipeline 的独立容器，可从生产依赖移除
- [ ] `src/ai/mcp/client/mcpClientTypes.ts`：MCP 功能上线后转为正常入口文件
- [ ] `src/services/VoiceAgentService.singleton.ts`：语音功能全面激活后转为正常入口
- [ ] `src/pages/annotation/annotationLaneReadScope.ts`：注释功能 GA 后转为正常入口

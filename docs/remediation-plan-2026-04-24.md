# 解语（Jieyu）项目整改计划

> 文档版本：2026-04-24
> 适用范围：解语濒危语言研究平台（TypeScript/React 全栈项目）
> 整改项总数：30 项（**CRITICAL 6 项 — 已在 2026-04-24 全部标记完成**；HIGH 15 项 + ARCH 10 项）

## 与《工程审计勘误》对账（F-4）

**代码级缺陷与迁移风险**以本文件为清单；**构建 / 离线壳 / 依赖卫生 / a11y 路线** 与勘误表 **Phase A–F** 正交，见  
[`docs/execution/audits/工程审计勘误与全面修复计划-2026-04-24.md`](./execution/audits/工程审计勘误与全面修复计划-2026-04-24.md)。  
跟踪时建议 **交叉引用 ID**：Issue / PR 标题或描述中同时写 **本清单编号**（如 `HIGH-12`）与 **勘误 Phase ID**（如 `F-3`），避免「修了 Toast 以为修了写入防抖」类误解。

### Phase F（数据韧性）与本清单条目对照

| 勘误 Phase F | 本清单中主要相关项 | 说明 |
| --- | --- | --- |
| **F-1** 周期性全量备份提醒 | （无直接 CRITICAL/HIGH 编号） | 产品侧降低数据丢失感知风险；与 **CRITICAL-1** 迁移修复、**ARCH-3** 事务包装正交。 |
| **F-2** 启动后 DB 轻量自检 | **CRITICAL-1**（及迁移/修复类 HIGH） | F-2 为运行态 **`probeJieyuDatabaseIntegrity`**（关键表可读），**不替代**迁移脚本与数据修复；自检失败时请仍按 CRITICAL-1 等路径处理已损坏库。 |
| **F-3** 协作 `localStorage` 配额降级 + 用户 Toast | **HIGH-12**、**HIGH-10**（及 **CRITICAL-4** 语义） | F-3 覆盖 **`CollaborationClientStateStore`** 在 **`QuotaExceededError`** 下的 **volatile overlay + IndexedDB 镜像 + `dispatchAppGlobalToast`**（约 90s 冷却）。**HIGH-12**（出站队列高频写 `localStorage`）仍待防抖/批量写入，与 F-3 **互补**。**HIGH-10** / **CRITICAL-4** 为冲突合并与事务语义问题，与配额链 **不同**，但验收协作体验时可与 F-3 一并回归。 |

实现锚点（便于 Code review）：`src/utils/backupExportReminderState.ts`、`src/hooks/useAppDataResilienceEffects.ts`、`src/db/dbIntegrityProbe.ts`、`src/components/DbIntegrityBlockingOverlay.tsx`、`src/utils/appGlobalToast.ts`、`src/components/AppGlobalToastHost.tsx`、`src/collaboration/cloud/CollaborationClientStateStore.ts`。

---

## 1. 紧急修复（Phase 1 - 立即，本周）

> **完成状态**（2026-04-24）：本节 **CRITICAL-1 — CRITICAL-6 共六项均已闭环**；各小节下 **状态** 行为准。未单独实现的原文要求（如 CRITICAL-3 的 `AbortController` / 显式五态状态机、CRITICAL-1 的“自动创建备份”自动脚本）在 **状态** 中说明为“已用等价方案替代”或“产品侧/手动”。

### 1.1 数据库迁移 v11 错误地将同一 textId 分配给所有翻译层

- **状态**：**已完成**（2026-04-24）
- **落地摘要**：`engine` v11 升级为按层 `resolveTextIdForLayer`（`unit_texts` + `units` 推断，非全表单值）；事后纠偏见 `src/db/repair/migrateV11TextIdRepair.ts` 之 `repairTranslationTierTextIdsFromLayerContents`；**备份**按 JSDoc 由调用方在跑修复前**自行导出/快照**（未接自动全库备份任务）。
- **编号**：CRITICAL-1
- **位置**：`src/db/engine.ts:466-489`
- **问题**：v11 迁移对所有 translation layer 行统一设置了相同的 `textId`，未通过 `units` 表建立 layer 与所属 text 的正确映射。翻译数据归属错乱，修复前产生的数据已不可信。
- **修复**：
  1. 重写迁移逻辑，通过 JOIN `units` 表逐层映射正确的 `textId`
  2. 编写修复脚本 `src/db/repair/migrateV11TextIdRepair.ts`，对已损坏数据库检测并修正
  3. 执行前自动创建备份快照
- **难度**：中 | **风险**：高（涉及数据迁移）| **阶段**：Phase 1
- **勘误交叉引用**：工程审计 **F-2**（见 [`工程审计勘误与全面修复计划`](./execution/audits/工程审计勘误与全面修复计划-2026-04-24.md) §Phase F）为 IndexedDB **运行态**轻量自检，**不能**替代本项迁移/修复脚本。

---

### 1.2 Copy-paste 错误导致分支判断失效

- **状态**：**已完成**（2026-04-24）
- **落地摘要**：`linguisticSubgraphHostIdFromRow` 对 token / morpheme 统一为 `unitId ?? segmentId`；`m18LinguisticUnitCutover.test` 已覆盖 `segmentId` 仅 morpheme 行等场景。
- **编号**：CRITICAL-2
- **位置**：`src/db/migrations/m18LinguisticUnitCutover.ts:27-29`
- **问题**：if/else 两个分支都检查了 `row.unitId`。其中一个分支应检查另一个字段名。
- **修复**：
  1. 查阅 schema 确认正确字段名
  2. 修正条件判断
  3. 添加单元测试覆盖两个分支
- **难度**：低 | **风险**：中 | **阶段**：Phase 1

---

### 1.3 VoiceAgent 开关竞态条件导致麦克风持续占用

- **状态**：**已完成**（2026-04-24）
- **落地摘要**：`useVoiceAgentTransportControls` 与 `VoiceAgentService` 在 `stop` / `dispose` 时**先 `await` 进行中的独占 `start` Promise** 再关麦；`toggle` / `createVoiceAgentService` 已配合异步关停。未再单独引入 `AbortController` 或五态显式状态机，**与现有 `voiceActivateToken` + `exclusiveStartPromise` 机制等价**。
- **编号**：CRITICAL-3
- **位置**：`src/services/VoiceAgentService.ts:466-531`
- **问题**：`start()` 是异步方法，`stop()` 是同步的。快速切换时 `stop()` 无法关闭仍在初始化中的麦克风。
- **修复**：
  1. 引入 `AbortController` 模式
  2. `stop()` 改为异步，等待 `start()` 完成后关闭资源
  3. 添加状态机（idle → starting → running → stopping → idle），禁止非法状态转换
- **难度**：中 | **风险**：中 | **阶段**：Phase 1

---

### 1.4 协作事务"回滚"实际不执行回滚

- **状态**：**已完成**（2026-04-24）
- **落地摘要**：`createBestEffortCleanupPlan` 替代误导性名称（保留 `createTransactionalRollbackPlan` 别名）；`executeTransactionalReplicaSync` 在 `status === 'rolled-back'` 时**结构化 warn + 尽力 Sentry `captureMessage`**。真正持久化回滚仍属后续 Phase 规划。
- **编号**：CRITICAL-4
- **位置**：`src/collaboration/collaborationTransactionSyncRuntime.ts:105-174`
- **问题**：事务回滚标记为 "rollback" 但未执行任何逆向操作。已变更数据不会被还原。
- **修复**：
  1. 若无法实现真正回滚（评估可行性）：将函数重命名为 `bestEffortCleanup`，明确语义
  2. 在注释中清楚说明这是"尽力而为"而非真正的回滚
  3. 为失败事务添加 Sentry 告警上报
  4. 真正回滚的实现在 Phase 3 完成
- **难度**：高 | **风险**：高 | **阶段**：Phase 1（优先方案 2：语义澄清 + 告警）
- **勘误交叉引用**：协作存储/同步体验验收时可与 **F-3**（见 [`工程审计勘误与全面修复计划`](./execution/audits/工程审计勘误与全面修复计划-2026-04-24.md) §Phase F）配额降级 + Toast **一并回归**；二者问题域不同（回滚语义 vs `localStorage` 配额）。

---

### 1.5 Rules of Hooks 违规

- **状态**：**已完成**（2026-04-24）
- **落地摘要**：核验 `GroundingContext.tsx` 中 `HotspotsCard` 的 `useId()` 位于早退 `return null` **之前**；`CorpusCard` 无在早退之后的 Hook。**无需改代码。**
- **编号**：CRITICAL-5
- **位置**：`src/ai/voice/GroundingContext.tsx:103-104`
- **问题**：`useId()` 在条件 `return null` 之后调用，违反 Hooks 必须顶层无条件调用的规则。
- **修复**：将 `useId()` 移到早期返回语句之前
- **难度**：低 | **风险**：低 | **阶段**：Phase 1

---

### 1.6 WebMa 服务域名可疑

- **状态**：**已完成**（2026-04-24）
- **落地摘要**：默认基址为慕尼黑 BAS **`webservice.bas.uni-muenchen.de`**；可通过 **`VITE_BAS_WEBSERVICES_BASE_URL`** 覆盖。清单中原 `.ac.kr` 与当前实现不符，以代码及 env 为准。
- **编号**：CRITICAL-6
- **位置**：`src/services/WebMaService.ts:81`
- **问题**：当前域名为 `.ac.kr`（韩国学术机构），正确域名可能应为 `.de`
- **修复**：
  1. 联系服务提供方确认正确域名
  2. 若确认为 `.de`，立即更改
  3. 域名抽取为配置项
- **难度**：低 | **风险**：低 | **阶段**：Phase 1

---

## 2. 短期整改（Phase 2 - 1-2 个迭代）

> **进度**（2026-04-24）：已落地 **HIGH-4、5、6、7、8、10、11、12、14** 及 **`ToastVariant` 增加 `warning`**、**`TranscriptionPage.ReadyWorkspace` 深链/shape 与只读 timeline 类型** 等配套修改。**HIGH-1** 对 `layer_unit_contents` / `unit_relations` / `tier_definitions` 等与 `types` 的 optional/required 在现行 `schemas` 中已一致（见代码审查）。**HIGH-2** 代码库中已无 `validateUnitDoc`/`unitDocSchema` 引用。**HIGH-3** `languageCatalogHistoryDocSchema` 已含 `reasonCode`/`beforePatch` 等字段。**HIGH-9** `SpeakerRailProvider` 已用 `useMemo` 包裹 value。**HIGH-13**（CSP 收紧 `https:` 通配符）未改：需枚举全站可信域后再替换，避免误伤地图/云 API。

### 2.1 Zod Schema 与 TypeScript 类型不一致（3 处）

- **编号**：HIGH-1
- **位置**：`src/db/schemas.ts:627-629, 652-659, 671-673`
- **问题**：三处 Zod schema 将字段标记为 required，但 TypeScript 类型标记为 optional
- **修复**：逐一审查业务逻辑确认必需性，统一 schema 和类型
- **难度**：低 | **风险**：中（可能影响上游调用方）| **阶段**：Phase 2

---

### 2.2 validateUnitDoc 使用已废弃的 Schema

- **编号**：HIGH-2
- **位置**：`src/db/schemas.ts:919-921`
- **问题**：引用已废弃的 `unitDocSchema`，而非新的 `layerUnitDocSchema`
- **修复**：替换引用为 `layerUnitDocSchema`
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.3 languageCatalogHistoryDocSchema 缺少字段

- **编号**：HIGH-3
- **位置**：`src/db/schemas.ts:372-384`
- **问题**：缺少 `reasonCode`、`beforePatch`、`afterPatch`、`sourceRef` 四个字段
- **修复**：在 schema 中添加对应 Zod 字段定义
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.4 PII 脱敏仅处理顶层字段

- **编号**：HIGH-4
- **位置**：`src/observability/logger.ts:81-91`, `src/observability/sentry.ts:72-91`
- **问题**：PII 脱敏仅处理顶层，嵌套对象中敏感信息泄漏
- **修复**：
  1. 将脱敏逻辑改为递归实现
  2. 添加常见嵌套路径的默认脱敏规则
  3. 编写单元测试验证深层嵌套脱敏
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.5 OTel 断路器从未恢复

- **编号**：HIGH-5
- **位置**：`src/observability/otel.ts:96-138`
- **问题**：断路器触发后无 half-open 探测机制，永久切断遥测上报
- **修复**：添加 cooldown 计时器（30s）→ half-open 探测 → 成功恢复/失败重新计时
- **难度**：中 | **风险**：低 | **阶段**：Phase 2

---

### 2.6 VAD 音频块无界积累

- **编号**：HIGH-6
- **位置**：`src/services/VadService.ts:179-198`
- **问题**：chunk 积累无大小上限，长时间语音输入可能导致 OOM
- **修复**：添加最大 chunk 数量和总大小限制（如 10MB），超限时使用流式解码器
- **难度**：中 | **风险**：低 | **阶段**：Phase 2

---

### 2.7 声学分析 PCM 数据无大小限制

- **编号**：HIGH-7
- **位置**：`src/services/acoustic/AcousticAnalysisService.ts:340-342`
- **问题**：内部分析路径缺少 PCM 大小校验
- **修复**：参照外部提供商路径添加相同的大小验证
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.8 媒体元素事件监听器泄漏（2 处）

- **编号**：HIGH-8
- **位置**：`src/hooks/useMediaImport.ts:48-62`, `src/components/AudioImportDialog.tsx:70-81`
- **问题**：audio/video 元素上的事件监听器触发后未移除
- **修复**：使用 `{ once: true }` 选项或在回调中手动 `removeEventListener`
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.9 useSpeakerActions 返回未 memoized 对象

- **编号**：HIGH-9
- **位置**：`src/contexts/SpeakerRailContext.tsx:193-234`
- **问题**：每次渲染返回新对象引用，导致子组件不必要重渲染
- **修复**：用 `useMemo` 包裹返回值
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.10 协作冲突中失败方字段静默丢弃

- **编号**：HIGH-10
- **位置**：`src/collaboration/collaborationCrossDeviceRuntime.ts:183-190`
- **问题**：loser 字段变更静默丢弃，无日志/通知
- **修复**：
  1. 添加合并审计日志记录丢弃的字段及原因
  2. Toast 通知用户部分修改未保存
  3. 考虑将丢弃的修改暂存到本地草稿
- **难度**：中 | **风险**：低 | **阶段**：Phase 2
- **勘误交叉引用**：用户可见提示可复用 **`dispatchAppGlobalToast`**（见勘误 **F-3** / [`AppGlobalToastHost`](../src/components/AppGlobalToastHost.tsx)）；本项仍须补审计日志与「部分修改未保存」语义。

---

### 2.11 无效协作行静默丢弃

- **编号**：HIGH-11
- **位置**：`src/collaboration/cloud/CollaborationSyncBridge.ts:99-105`
- **问题**：无效实时数据行静默丢弃，无错误上报
- **修复**：在丢弃时添加 Sentry/log 上报，包含原始数据摘要
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

### 2.12 协作出站队列每次入队即写 localStorage

- **编号**：HIGH-12
- **位置**：`src/collaboration/cloud/CollaborationOutboundQueue.ts:46-48,72`
- **问题**：高频协作场景下频繁同步 I/O 阻塞主线程
- **修复**：添加防抖/批量写入机制（如 500ms 防抖或在 flush 时统一写入）
- **难度**：低 | **风险**：低 | **阶段**：Phase 2
- **勘误交叉引用**：与 **F-3**（见 [`工程审计勘误与全面修复计划`](./execution/audits/工程审计勘误与全面修复计划-2026-04-24.md) §Phase F）中 **`CollaborationClientStateStore`** 写入路径 **互补**——F-3 缓解 **`QuotaExceededError`** 下的落盘与用户提示；**HIGH-12** 仍应做 **防抖/批量写入** 以降低配额触发频率与主线程阻塞。

---

### 2.13 CSP 策略使用 https: 通配符

- **编号**：HIGH-13
- **位置**：`index.html:12,14`
- **问题**：`img-src https:` 和 `connect-src https: wss:` 削弱了 CSP 的保护
- **修复**：枚举项目实际使用的可信来源，替换为具体白名单
- **难度**：低 | **风险**：中（可能遗漏合法来源）| **阶段**：Phase 2

---

### 2.14 CSP 缺少 frame-ancestors 指令

- **编号**：HIGH-14
- **位置**：`index.html`
- **问题**：页面可被任意 iframe 嵌入，存在点击劫持风险
- **修复**：添加 `frame-ancestors 'none'`
- **难度**：低 | **风险**：低 | **阶段**：Phase 2

---

## 3. 中长期架构改进（Phase 3 - 1-2 个月）

### 3.1 fireAndForget 泛滥

- **编号**：ARCH-1 | **范围**：70+ 调用点
- **状态**（2026-04-24）：**主路径已落地，长期项仍开放**  
  - **已实现**：`src/utils/fireAndForget.ts` 的 **`FireAndForgetOptions`**（`context` 必填由治理脚本保证、`policy` `user-visible` | `background`、生产 **Sentry**、可选 `onError`）；`user-visible` 失败时 **`FIRE_AND_FORGET_ERROR_EVENT`** → `useFireAndForgetErrorToast` 展示文案（见 `useToastControllerWindowEffects.ts` / `TranscriptionPage.ToastController.tsx`）。**CI**：`quality` 任务跑 **`npm run check:fire-and-forget-governance`**（`scripts/check-fire-and-forget-governance.mjs`，调用片段须含 `context:`）；`check:architecture-guard` 已包含该脚本。  
  - **未做/可选**：全库改为 `Result<T, E>`；对 **background** 策略再细分产品语义。
- **问题**：异步操作失败静默丢弃错误，用户无法感知操作未成功
- **修复**：
  1. 引入 `Result<T, E>` 模式（或使用 `neverthrow` 库）
  2. 配合全局 toast 通知系统
  3. 按模块分批审计替换所有 `fireAndForget` 调用点
  4. 对确实无需用户感知的后台操作，至少添加 Sentry 上报
- **难度**：高 | **风险**：中 | **阶段**：Phase 3

---

### 3.2 双 i18n 体系缺乏统一治理

- **编号**：ARCH-2 | **范围**：全局
- **问题**：12+ 个独立 message module 无集中键管理，新增语言时会出现中英混杂
- **修复**：
  1. 评估差异和覆盖范围
  2. 将独立 module 迁移到 `DICT_KEYS` 体系下
  3. 编写迁移脚本批量转换
  4. CI 中检测未纳入治理体系的文本
- **难度**：高 | **风险**：中 | **阶段**：Phase 3

---

### 3.3 数据库写入缺乏事务包装

- **状态**：**部分完成**（2026-04-24）— 层单元 / segment 图多表写路径已收敛
- **落地摘要**：
  - 门面与 store 列表：`withTransaction` / `withReadTransaction` / `withWriteTransaction`（`src/db/withTransaction.ts`），多表 store 名自 `src/db/dexieTranscriptionGraphStores.ts`（ADR-0006）。
  - **级联删（按行 id）**：`deleteLayerUnitGraphByRecordIds` — 单次 rw 内顺序 `bulkDelete` 三表（`LayerUnitSegmentWritePrimitives.ts`）。
  - **segment 子图按 id 整段删除**：`deleteLayerSegmentGraphBySegmentIds` — 在删 content / 删 link / 再删 unit 的链外包一层 `withTransaction`（`label: 'deleteLayerSegmentGraphBySegmentIds'`，`LayerSegmentGraphService.ts`）；内层仍可能调用已带事务的 `deleteLayerUnitGraphByRecordIds`（与 `LayerUnitService.deleteUnit` 等现网嵌套模式一致）。
  - **多表 upsert（无外层 txn 时）**：`bulkUpsertLayerSegmentGraph` + `LayerUnitSegmentWriteService.upsertSegmentGraph` — 三表 `bulkPut` 同一 rw 事务。已有外层事务的路径（如 `restoreLayerSegmentGraphSnapshot`、`LayerSegmentationV2Service.splitSegment`）仍用直接 `bulkPut` / 既有 service 调用，避免无意义的嵌套事务。
  - **后续（增量）**：其它跨函数多步写可按调用频率继续合并（`removeUnitTextFromSegmentationV2` 已用预计算孤儿段 + 单次 rw 包裹「删 content + `deleteLayerSegmentGraphBySegmentIds`」，`label: 'removeUnitTextFromSegmentationV2'`，`LayerSegmentationTextService.ts`）。
- **编号**：ARCH-3 | **范围**：全局
- **问题**：多步数据修改不在事务中执行，中途失败导致数据不一致
- **修复**：
  1. 梳理关键数据修改路径
  2. 为多步操作添加事务包装
  3. 编写事务工具函数 `withTransaction()` 统一错误处理
- **难度**：高 | **风险**：中 | **阶段**：Phase 3

---

### 3.4 单例滥用

- **状态**：**部分完成**（2026-04-24）— 核心单例有释放与轻量健康面
- **落地摘要**（未引入 DI 容器，保留增量空间）：
  1. **Dexie / `getDb()`**：`resetJieyuDatabaseSingletonForTests`（`src/db/engine.ts`，导出自 `src/db/index.ts`）— 释放 `JieyuDatabase` Promise、关闭 `__jieyuDexie__`；`import { db }` 仍指向同 Dexie 单例，测试侧通常再 `await db.open()`。健康：`jieyuDatabaseSingletonHealthCheck`（`src/db/dbIntegrityProbe.ts`）= `getDb()` + `probeJieyuDatabaseIntegrity`。
  2. **Supabase 浏览器单例**：`getSupabaseBrowserClientHealth`（无网络、仅配置 + 是否已缓存 client）、`resetSupabaseBrowserClientForTests`（同既有 `…ForTest`），`src/integrations/supabase/client.ts`；`collaborationSupabaseFacade` 统一再导出，协作层仍不直接 `import` `integrations/…`。
  3. **AcousticAnalysisService**：已有 `dispose()` 现会清空静态单例，保证后续 `getInstance()` 为全新实例；`resetSingletonForTests`（`dispose` 的测试别名）、`getHealthSnapshot` / `getResourceHealthSnapshot` 轻量资源计数；子 Worker 由 `dispose`/`resetWorker` 路径终止（仍无远程「ping」式健康，符合本地/Worker 定位）。
- **后续**：`Worker` 其它直建实例的收敛、可观测里聚合 `getHealthSnapshot` 上报、**不在此清单内** 的全量依赖注入，可按模块增量评估。
- **编号**：ARCH-4 | **范围**：DB、Supabase Client、AcousticAnalysisService、Workers
- **问题**：核心服务无生命周期管理、无健康检查、测试中难以隔离
- **修复**：
  1. 为每个单例添加 `dispose()`/`reset()` 方法
  2. 添加 `healthCheck()` 方法
  3. 测试环境中提供创建新实例的能力
  4. 考虑依赖注入容器管理
- **难度**：高 | **风险**：中 | **阶段**：Phase 3

---

### 3.5 数据库迁移缺乏备份保护

- **状态**：**部分完成**（2026-04-24）— 文档 + CI 回放；浏览器内「升级前静默全量自动备份」不可行（IndexedDB 连接/事务限制），已如实说明
- **落地摘要**：
  1. **文档化降级 / 备份策略**：[`docs/execution/migration-safety-ARCH-5.md`](./execution/migration-safety-ARCH-5.md)（大版本前 JSON 导出、`importDatabaseFromJson` 恢复、为何无法嵌套自动备份）。
  2. **CI 迁移回放**：`src/db/migrations/jieyuDexieOpenReplay.test.ts` 在独立库名上 `new JieyuDexie(…).open()`，断言 `verno === JIEYU_DEXIE_TARGET_SCHEMA_VERSION`（`src/db/engine.ts` 导出常量，**加新版本时须同步 bump**）。
  3. **未做 / 后续**：迁移前「静默」自动快照、用户可见迁移进度条 — 需另立产品项；技术说明见上文 execution 文档。
- **编号**：ARCH-5 | **范围**：全局
- **问题**：34 个迁移版本，执行前无自动备份，失败后无法恢复
- **修复**：
  1. 迁移前自动创建数据库快照
  2. 添加迁移进度指示器
  3. 文档化降级流程
  4. CI 中增加迁移回放测试
- **难度**：中 | **风险**：低 | **阶段**：Phase 3

---

### 3.6 协作 Phase 复杂性

- **状态**：**部分完成**（2026-04-24）— 文档 + 同步徽章门控谓词
- **落地摘要**：
  1. **流程图**：[`docs/execution/collaboration-phase-surface-ARCH-6.md`](./execution/collaboration-phase-surface-ARCH-6.md) — Mermaid 描述 `deriveCollaborationSyncBadge` 优先序、`evaluateCollaborationProtocolGuard` 顺序、与 `collaborationPromotionRuntime` 的**交叉引用**（不与 UI 徽章硬耦合）。
  2. **命名谓词**：`src/collaboration/cloud/collaborationSyncSurfaceGates.ts`（`collaborationSyncSurfaceIsIdle` 等），`deriveCollaborationSyncBadge` 仅编排调用；行为由既有 `collaborationSyncDerived.test.ts` 锁定。
  3. **未做**：`useTranscriptionCollaborationBridge` 长 `useEffect` 整段展平、全协作目录 pipeline 化 — 需更大重构窗口。
- **编号**：ARCH-6 | **范围**：`collaboration/`*
- **问题**：14 个 Phase 深层嵌套门控串联，代码极难理解和调试
- **修复**：
  1. 优先文档化：生成可视化流程图
  2. 将深层嵌套的 if 条件提取为命名谓词函数
  3. 渐进式展平为 pipeline 或状态机模式（不一次大改）
- **难度**：高 | **风险**：高 | **阶段**：Phase 3

---

### 3.7 转录页面臃肿

- **编号**：ARCH-7 | **范围**：转录页面文件簇
- **问题**：20+ 个控制器聚合，代码复用难、测试边界模糊、并行开发冲突频繁
- **修复**：
  1. 分析依赖关系，识别领域边界
  2. 按功能拆分：音频采集、语音识别、文本编辑、时间轴同步独立
  3. 按 feature-based 组织代码
- **难度**：高 | **风险**：高 | **阶段**：Phase 3

---

### 3.8 Worker 生命周期无统一管理

- **编号**：ARCH-8 | **范围**：全局
- **问题**：多个 Worker 独立创建销毁，无健康检查和重启
- **修复**：
  1. 实现 `WorkerPool` 管理器统一管理 Worker 生命周期
  2. 添加心跳检测和异常恢复
  3. 提供 Worker 使用统计
- **难度**：中 | **风险**：中 | **阶段**：Phase 3

---

### 3.9 测试覆盖与复杂度不匹配

- **编号**：ARCH-9 | **范围**：全局
- **问题**：高风险路径（fireAndForget、协作冲突、数据迁移）缺乏自动化测试
- **修复**：
  1. 关键路径冒烟测试
  2. `fireAndForget` 改造为可测试的 `Result<T,E>` 模式
  3. 核心用户流程（创建语言→添加翻译→导出）E2E 测试
  4. 数据库迁移回放测试
- **难度**：高 | **风险**：低 | **阶段**：Phase 3

---

### 3.10 DB Adapter 错误静默吞没

- **编号**：ARCH-10 | **范围**：DB Adapter
- **问题**：不区分"索引未建立"与真正的数据库故障，真实错误被淹没
- **修复**：
  1. 区分错误类型
  2. 真实错误添加 Sentry/log 上报
  3. 开发环境对 fallback 行为更明显的提示
- **难度**：中 | **风险**：低 | **阶段**：Phase 3

---

## 4. 持续治理机制

### 4.1 代码审查检查清单


| 检查项           | 说明                             |
| ------------- | ------------------------------ |
| Hooks 顺序      | 所有 Hooks 必须在组件顶层、无条件分支之前调用     |
| Copy-paste 痕迹 | 相似的 if/else 分支是否引用了正确的字段       |
| Schema 一致性    | Zod schema 与 TypeScript 类型是否一致 |
| 异步安全          | start()/stop() 等配对操作是否考虑了竞态条件  |
| 内存泄漏          | addEventListener 是否有对应的清理逻辑    |
| PII 安全        | 日志/Sentry 中是否可能泄露嵌套的敏感字段       |
| CSP 变更        | 新增的外部资源是否更新了 CSP 策略            |
| 事务边界          | 多步数据修改是否在事务中执行                 |
| 迁移安全          | 新迁移是否已在生产数据副本上测试通过             |
| 错误处理          | 异步调用是否显式处理了失败路径                |


### 4.2 自动化质量关卡


| 措施                                                       | 工具               | 优先级 |
| -------------------------------------------------------- | ---------------- | --- |
| ESLint react-hooks 插件启用 exhaustive-deps + rules-of-hooks | ESLint           | P0  |
| Zod-to-TypeScript 一致性检查脚本                                | 自定义脚本 + CI       | P0  |
| CSP 策略变更检测                                               | CI Pipeline      | P1  |
| Bundle 大小监控                                              | BundleWatch / CI | P1  |
| 迁移回放测试                                                   | CI + 生产数据快照      | P1  |
| PII 脱敏覆盖率检测                                              | 自定义 ESLint 规则    | P2  |
| 内存泄漏检测（关键页面长时间运行测试）                                      | Playwright + CI  | P2  |


### 4.3 技术债务跟踪

- 每个未修复的架构问题在 Backlog 中建立对应 Issue
- 按月统计技术债务数量和严重级别趋势
- 每个迭代预留 20% 容量用于技术债务偿还

### 4.4 风险缓解策略


| 风险           | 缓解措施                   |
| ------------ | ---------------------- |
| 迁移导致数据损坏     | 执行前强制自动备份；编写回滚脚本       |
| 重构引入回归 Bug   | 先补测试再重构；特性开关灰度发布       |
| 协作逻辑变更引发同步异常 | staging 环境充分验证；保留旧版兼容期 |
| CSP 收紧导致功能异常 | 先在 Report-Only 模式运行一周  |


---

## 附录 A：整改项总览矩阵


| 编号         | 类别            | 位置                                                            | 难度  | 风险  | 阶段      |
| ---------- | ------------- | ------------------------------------------------------------- | --- | --- | ------- |
| CRITICAL-1 | 数据迁移          | `db/engine.ts:466-489`                                        | 中   | 高   | Phase 1 |
| CRITICAL-2 | Copy-paste    | `db/migrations/m18...:27-29`                                  | 低   | 中   | Phase 1 |
| CRITICAL-3 | 竞态条件          | `services/VoiceAgentService.ts:466-531`                       | 中   | 中   | Phase 1 |
| CRITICAL-4 | 事务回滚          | `collaboration/...Runtime.ts:105-174`                         | 高   | 高   | Phase 1 |
| CRITICAL-5 | Hooks 违规      | `ai/voice/GroundingContext.tsx:103-104`                       | 低   | 低   | Phase 1 |
| CRITICAL-6 | 域名错误          | `services/WebMaService.ts:81`                                 | 低   | 低   | Phase 1 |
| HIGH-1     | Schema 不一致    | `db/schemas.ts:627-673` (3 处)                                 | 低   | 中   | Phase 2 |
| HIGH-2     | 废弃 Schema     | `db/schemas.ts:919-921`                                       | 低   | 低   | Phase 2 |
| HIGH-3     | 缺少字段          | `db/schemas.ts:372-384`                                       | 低   | 低   | Phase 2 |
| HIGH-4     | PII 脱敏        | `observability/logger.ts`, `sentry.ts`                        | 低   | 低   | Phase 2 |
| HIGH-5     | 断路器           | `observability/otel.ts:96-138`                                | 中   | 低   | Phase 2 |
| HIGH-6     | 内存泄漏          | `services/VadService.ts:179-198`                              | 中   | 低   | Phase 2 |
| HIGH-7     | 输入验证          | `services/acoustic/...Service.ts:340-342`                     | 低   | 低   | Phase 2 |
| HIGH-8     | 事件泄漏          | `hooks/useMediaImport.ts`, `components/AudioImportDialog.tsx` | 低   | 低   | Phase 2 |
| HIGH-9     | 性能            | `contexts/SpeakerRailContext.tsx:193-234`                     | 低   | 低   | Phase 2 |
| HIGH-10    | 协作            | `collaboration/...Runtime.ts:183-190`                         | 中   | 低   | Phase 2 |
| HIGH-11    | 错误处理          | `collaboration/cloud/...Bridge.ts:99-105`                     | 低   | 低   | Phase 2 |
| HIGH-12    | 性能            | `collaboration/cloud/...Queue.ts:46-72`                       | 低   | 低   | Phase 2 |
| HIGH-13    | 安全            | `index.html:12,14`                                            | 低   | 中   | Phase 2 |
| HIGH-14    | 安全            | `index.html`                                                  | 低   | 低   | Phase 2 |
| ARCH-1     | fireAndForget | 70+ 调用点                                                       | 高   | 中   | Phase 3 |
| ARCH-2     | i18n          | 全局                                                            | 高   | 中   | Phase 3 |
| ARCH-3     | 事务            | 全局                                                            | 高   | 中   | Phase 3 |
| ARCH-4     | 单例            | 全局                                                            | 高   | 中   | Phase 3 |
| ARCH-5     | 迁移安全          | 全局                                                            | 中   | 低   | Phase 3 |
| ARCH-6     | 协作复杂度         | `collaboration/`*                                             | 高   | 高   | Phase 3 |
| ARCH-7     | 代码组织          | 转录页面                                                          | 高   | 高   | Phase 3 |
| ARCH-8     | Worker 管理     | 全局                                                            | 中   | 中   | Phase 3 |
| ARCH-9     | 测试覆盖          | 全局                                                            | 高   | 低   | Phase 3 |
| ARCH-10    | 错误处理          | DB Adapter                                                    | 中   | 低   | Phase 3 |


---

## 附录 B：建议实施时间线

```
Week 1 (Phase 1)           Week 2-3                 Week 4-5                  Month 2-3
┌─────────────────────┐    ┌──────────────────────┐  ┌──────────────────────┐   ┌────────────────────────┐
│ CRITICAL-1 ~ 6      │    │ HIGH-1 ~ 6           │  │ HIGH-7 ~ 14          │   │ ARCH-1 ~ 10           │
│ 立即修复              │    │ Schema / PII / 断路器 │  │ 内存/性能/安全        │   │ 按优先级分批推进       │
│                      │    │                      │  │                      │   │                        │
│ + 建立 CR Checklist  │    │ + 自动化质量关卡      │  │ + 技术债务 Issue 创建  │   │ + 测试覆盖提升          │
└─────────────────────┘    └──────────────────────┘  └──────────────────────┘   └────────────────────────┘
```

---

---

## 附录 C：与工程健康度审计路线图的关系

多 Agent 工程审计（性能、依赖、PWA、DX、A11y、数据存储等）中的**事实勘误**与**全面修复路线图**已单独收录，避免与本文 CRITICAL / HIGH / ARCH 清单混淆：

- [工程审计勘误与全面修复计划（2026-04-24）](./execution/audits/工程审计勘误与全面修复计划-2026-04-24.md)

二者**正交**：可并行排期；合并实施时在 Issue 或 PR 描述中交叉引用编号即可。

---

> **编写**：自动代码审查
> **日期**：2026-04-24
> **下次复查**：2026-05-08（Phase 1 完成后）


# 架构迁移：LayerUnit 统一收口方案
Architecture Migration: Unified LayerUnit Convergence Plan

> 文档状态：已执行完成（保留迁移历史） | 日期：2026-03-27 | 当前阶段：LayerUnit 运行时收口完成

> 2026-03-27 最终状态补记
>
> - 当前运行时真源已收敛到 `layer_units` / `layer_unit_contents` / `unit_relations`。
> - `src/services/LayerUnitLegacyBridgeService.ts` 已删除；segment graph 相关运行时 helper 已由 `src/services/LayerSegmentGraphService.ts` 接管。
> - 生产配置中已移除 `legacySegmentationMirrorWriteEnabled` 与 `legacySegmentationReadFallbackEnabled`。
> - `src/db/index.ts` 当前运行时集合面已移除 `layer_segments` / `layer_segment_contents` / `segment_links`，并通过 DB v31 执行物理 drop。
> - 验证结果：`npm run typecheck` 与 `npm test` 全绿。

---

## 1. 目标

将运行时层时间单元模型收敛为：

- `layer_units` = 唯一时间单元真源 | sole timeline-unit source of truth
- `layer_unit_contents` = 唯一内容真源 | sole content source of truth
- `unit_relations` = 唯一关系真源 | sole relation source of truth

兼容目标：

- `layer_segments`
- `layer_segment_contents`
- `segment_links`

以上三者在迁移完成前仅作为兼容镜像存在，不再承担主读职责；最终进入停写、下线、删除流程。

---

## 2. 当前状态快照

### 2.1 已完成

- `layer_units` / `layer_unit_contents` / `unit_relations` 已入库并有 schema、索引、测试。
- utterance / segment 关键写路径已完成到 LayerUnit 真源的统一收口；兼容 mirror/fallback 开关已从生产配置中删除。
- segment / segment content / relation 的主读路径已切到 canonical query/graph service，公共读路径不再暴露 legacy-only 数据。
- 选择态运行时已基本收敛到统一 `TimelineUnit` 语义，生产代码里几乎不再散落 `selectedTimelineUnit.kind` 分支。
- `LayerSegmentationTextService`、`LayerSegmentationV2Service`、`LinguisticService.assignSpeakerToSegments` 已支持 LayerUnit-only 数据场景。
- 残留 graph 清理与修复路径已下沉到 canonical helper：按 segment、utterance、text、media 维度的 residual graph 删除，以及 orphan/time_subdivision 修复均可在 LayerUnit-only 数据下工作。
- 新增工程门禁 `scripts/check-segmentation-storage-boundary.mjs` 并接入 `npm test`，业务层若重新出现 segmentation 真表 direct access 会被立即拦截。
- 运行时 DB 集合面已在 v31 删除 legacy segmentation 三表，legacy 仅保留在历史迁移链与历史文档中。

### 2.2 当前结论（2026-03-27 执行后）

- 若目标是“运行时主读真源收敛到 LayerUnit”：已完成。
- 若目标是“legacy 表从当前运行时退场”：已完成。
- 剩余仅为历史文档/历史迁移记录保留，不再属于生产运行时债务。

### 2.3 当前剩余项

1. 历史文档中仍保留大量 `layer_segments` / `layer_segment_contents` / `segment_links` 叙述，需按“历史阶段”理解，不能再作为当前运行时设计依据。
2. 历史迁移链与历史类型定义仍保留在 `src/db/index.ts`，用于旧库升级与兼容测试，不代表当前运行时集合面仍暴露 legacy 表。
3. 后续新增功能仍需遵守 storage-boundary gate，避免重新在业务层长出对 segmentation 真表的 direct access。

### 2.4 最新门禁与白名单状态

- 静态门禁：`npm test` 现已串联 `check:segmentation-storage-boundary`。
- 白名单文件当前限定为：
  - `src/services/LegacyMirrorService.ts`
  - `src/services/LayerSegmentGraphService.ts`
  - `src/services/LayerSegmentQueryService.ts`
  - `src/services/LayerUnitRelationQueryService.ts`
  - `src/services/LayerUnitSegmentMirrorPrimitives.ts`
- 非白名单文件只允许在 Dexie transaction scope 声明里引用 segmentation 真表，禁止出现新的 direct read/write。
- 这意味着“业务层重新长出 legacy/LayerUnit 表细节”已经从人工约定变成工程门禁。

---

## 3. 统一原则

### 3.1 真源原则

- 业务语义只在 LayerUnit 真源层定义一次。
- legacy 表只做镜像，不做业务判断。

### 3.2 分层原则

- Query 层只负责“读真源 + 兼容回填”。
- Service 层只负责“写真源 + 调用镜像同步”。
- UI / Hook / Page 不直接碰 legacy 表结构细节。

### 3.3 迁移原则

- 先统一读，再统一关系，再统一写，最后做 legacy 退场。
- 每阶段都必须允许 LayerUnit-only 数据完整运行。
- 不要求一步删表，但要求每阶段都减少 legacy 的职责边界。

---

## 4. TO-BE 终态

### 4.1 读模型

```text
UI / Hook / Page
  -> LayerSegmentQueryService / RelationQueryService
     -> layer_units
     -> layer_unit_contents
     -> unit_relations

legacy tables:
  仅用于迁移期 fallback / backfill
```

### 4.2 写模型

```text
业务服务
  -> LayerUnitService / RelationService
     -> 真源写入
  -> LegacyMirrorService
     -> 按需镜像到 layer_segments / layer_segment_contents / segment_links
```

### 4.3 退场模型

```text
阶段 1: legacy 参与镜像写，不参与主读
阶段 2: legacy 仅在导入旧数据 / 修复脚本中使用
阶段 3: legacy 停写，只保留一次性迁移工具
阶段 4: 删除 legacy 运行时依赖与表定义
```

---

## 5. 剩余热点清单

### 5.1 P0：仍直接依赖 legacy 读语义的生产代码

#### [src/hooks/useTranscriptionPersistence.ts](src/hooks/useTranscriptionPersistence.ts)

- 冲突检测仍直接用 `layer_segment_contents.bulkGet(ids)`。
- 问题：这是旧内容表语义，不是 LayerUnit 真源语义。

#### [src/hooks/useTranscriptionLayerActions.ts](src/hooks/useTranscriptionLayerActions.ts)

- 层删除逻辑仍在手工做 legacy 删除、link 删除、LayerUnit 级联删除的拼装。
- 问题：业务层仍在承担迁移细节。

#### [src/pages/TranscriptionPage.Orchestrator.tsx](src/pages/TranscriptionPage.Orchestrator.tsx)

- independent-layer undo snapshot / restore 仍存在较重的 legacy 镜像恢复流程。
- segment content 保存仍直接触达 legacy content 表。
- 问题：页面层知道太多底层迁移细节。

### 5.2 P0：关系真源尚未切换

#### [src/services/LayerSegmentationTextService.ts](src/services/LayerSegmentationTextService.ts)

- 仍以 `segment_links` 作为父子 / 关联关系读取来源。

#### [src/services/LayerSegmentationV2Service.ts](src/services/LayerSegmentationV2Service.ts)

- split / merge / createParentConstraint 仍直接读写 `segment_links`。

### 5.3 P1：桥接层职责过宽但还不够正式

#### [src/services/LayerUnitLegacyBridgeService.ts](src/services/LayerUnitLegacyBridgeService.ts)

- 已承担 merged read、conversion、cascade、upsert。
- 但尚未拆清为：
  - 真源 Query/Write API
  - legacy 镜像 API
  - relation query API

---

## 6. 统一执行方案

## Phase A：统一读层

### 目标

所有运行时读取通过 LayerUnit-first 统一入口完成，业务层不再直接按 legacy 表写查询逻辑。

### 必做项

1. 为 `useTranscriptionPersistence` 增加 LayerUnit-first 冲突检查入口。
2. 将 `useTranscriptionLayerActions` 的层删除前检查与受影响数据判断全部收口到 bridge/query helper。
3. 将 `TranscriptionPage.Orchestrator` 中 independent-layer undo / restore 的查询侧进一步下沉到服务层。

### 完成标志

- 生产代码中不再出现“为了业务判断而直接读 `layer_segment_contents` / `layer_segments`”的路径。
- 允许 LayerUnit-only 数据跑通导出、删除、恢复、冲突检测。

---

## Phase B：统一关系层

### 目标

让 `unit_relations` 从“写入镜像”升级为正式关系真源，`segment_links` 降为兼容镜像。

### 新增建议

新增关系查询服务，例如：

```text
RelationQueryService
  - listRelationsBySourceUnitIds
  - listRelationsByTargetUnitIds
  - listChildUnitsByParentUnitId
  - listParentUnitsByChildUnitId
  - listTimeSubdivisionChildren
```

### 必做项

1. 把 `LayerSegmentationTextService` 中基于 `segment_links` 的父子读取替换为 relation query。
2. 把 `LayerSegmentationV2Service` 中 split / merge / createParentConstraint 的关系读取替换为 relation query。
3. 把 Orchestrator 中按 segmentIds 抓旧 link 的页面逻辑改为服务化关系快照接口。

### 完成标志

- `segment_links` 不再承担主读职责。
- `unit_relations` 具备完整 CRUD + query + restore 能力。

---

## Phase C：统一写层

### 目标

把“业务写真源”与“legacy 镜像同步”分开，结束各服务自己双写的状态。

### 建议拆分

#### 真源服务

- `LayerUnitService`
- `LayerUnitContentService`
- `RelationService`

#### 镜像服务

- `LegacyMirrorService.syncSegmentRows`
- `LegacyMirrorService.syncSegmentContentRows`
- `LegacyMirrorService.syncRelationRows`
- `LegacyMirrorService.deleteSegmentMirrorCascade`

### 必做项

1. 将 `LayerSegmentationTextService` 内的 legacy put/delete 收口到 mirror service。
2. 将 `LayerSegmentationV2Service` 内的 legacy put/delete/link 写入收口到 mirror service。
3. 将 `TranscriptionPage.Orchestrator` 的 independent-layer restore 写路径收口到统一 restore service。

### 完成标志

- 业务服务只写真源，不再自己拼 legacy 双写事务。
- legacy 写路径只存在于镜像层。

---

## Phase D：legacy 退场

### 目标

把 legacy 从“兼容镜像”继续降级为“迁移遗产”。

### 四步退场法

1. 停止业务读 legacy。
2. 标记 legacy 为镜像层专属写入。
3. 增加开关或迁移脚本，使开发环境可验证“停写 legacy”模式。
4. 删除 legacy 运行时依赖与表定义。

### 删除前门槛

- LayerUnit-only 端到端回归完整通过。
- 导出、撤销恢复、层删除、speaker 指派、time_subdivision 约束场景均不依赖 legacy。
- 数据迁移脚本可把历史项目一次性补齐到 LayerUnit 真源。
- `check:segmentation-storage-boundary` 连续通过，且白名单文件数不再扩大。
- 允许 direct access segmentation 真表的文件名单已固定，并完成一次人工审阅，确认都属于 storage-layer 内核而非业务层。

### 删表前执行 gate

1. 运行时 gate
  - `legacySegmentationReadFallbackEnabled=false` 为默认态且回归稳定。
  - `legacySegmentationMirrorWriteEnabled=false` 为默认态且导入、编辑、删除、导出全链稳定。
2. 工程 gate
  - `npm run check:segmentation-storage-boundary` 通过。
  - 白名单仍只包含 storage-layer 文件，未出现新的业务层直接访问。
3. 数据 gate
  - 历史项目补齐脚本可将 legacy-only segmentation 数据完整迁移到 LayerUnit 真源。
  - 至少有一轮针对旧项目样本的迁移后验校验，证明停写后不会丢失 segment/content/relation 语义。
4. 删除 gate
  - `LegacyMirrorService` 可以切换到 no-op 或迁移工具专用模式。
  - `layer_segments` / `layer_segment_contents` / `segment_links` 从运行时集合引用中移除前，已有替代脚本与回滚方案。

---

## 7. 推荐批次划分

### 批次 1

- `useTranscriptionPersistence` 冲突检测迁移
- relation query service 骨架
- `LayerSegmentationTextService` 的关系读取替换

### 批次 2

- `LayerSegmentationV2Service` 关系读取替换
- Orchestrator undo/restore 下沉服务化
- layer action 删除逻辑进一步服务化

### 批次 3

- LegacyMirrorService 抽离
- TextService / V2Service / Orchestrator 改调 mirror service

### 批次 4

- 增加 LayerUnit-only 端到端回归
- 验证 legacy 停读模式
- 规划停写与删表

---

## 8. 验收标准

### A 类：运行时收口完成

- 生产代码主读路径不依赖 `layer_segments` / `layer_segment_contents` / `segment_links`。
- `unit_relations` 已承担关系主读。
- LayerUnit-only 数据能覆盖核心 UI 和服务链。

### B 类：写入收口完成

- 业务服务不再直接双写 legacy。
- legacy 写只经由 mirror service。

### C 类：退场准备完成

- 有明确的停读、停写、删表门槛。
- 有 LayerUnit-only 回归与迁移脚本兜底。
- 有 segmentation storage boundary 门禁与固定白名单兜底，防止业务层回退到 direct table access。

---

## 9. 风险与缓解

| 风险 | 级别 | 缓解 |
|---|---|---|
| `unit_relations` 读路径替换引入父子关系回归 | 高 | 先补 query service 与 LayerUnit-only 回归，再替换业务读路径 |
| Orchestrator undo/restore 服务化时出现快照丢失 | 高 | 先抽只读快照接口，再抽写回接口，避免一步到位大改 |
| mirror service 抽离导致事务边界变化 | 中 | 由 service 层统一提供事务包裹，不在 page/hook 拼事务 |
| legacy 停写过早造成旧导入数据不兼容 | 中 | 保留 backfill 与 repair 脚本，在停写前先完成全量 LayerUnit 补齐 |

---

## 10. 结论

这次迁移剩下的工作量已经不是“全仓库还有很多零碎旧逻辑”，而是 3 件成体系的工作：

1. 让 `unit_relations` 正式接管关系读。
2. 让镜像写从业务层退出，进入统一 mirror service。
3. 让 legacy 退场从口头目标变成可切换、可验证、可落地的正式阶段。

后续执行应以阶段为单位推进，不再按单文件补丁式扩散。

---

## 11. 全部收尾方案（最终版）

### 11.1 收尾目标

将本次 LayerUnit 收口从“代码已完成”推进到“仓库级正式封账”：

1. 运行时事实、测试事实、文档事实三者完全一致。
2. legacy segmentation 三表仅保留为历史迁移语境，不再被误读为当前运行时设计。
3. 后续开发者即使不阅读迁移上下文，也不会重新走回 legacy 路径。

### 11.2 范围定义

本次收尾只做 4 类工作，不再扩展功能范围：

1. 代码封账
   - 保持 `layer_units` / `layer_unit_contents` / `unit_relations` 为唯一运行时真源。
   - 继续禁止业务层 direct access segmentation 真表细节。
2. 文档封账
   - 将仍描述 legacy 为“当前方案”的文档改成“历史阶段说明”。
   - 在核心架构文档中统一声明 v31 后的当前事实。
3. 测试封账
   - 保持测试 fixture 与断言只依赖 canonical 集合。
   - 将性能基线阈值固定到可覆盖全量并发噪声的范围。
4. 记忆封账
   - 将本批次结论写入 repo memory，便于后续任务直接继承当前真相。

### 11.3 执行顺序

#### 阶段 A：运行时封账

- 目标：确保当前代码层没有任何“可回退到 legacy 运行时”的真实入口。
- 已完成项：
  - 删除 `LayerUnitLegacyBridgeService.ts`
  - 删除生产配置中的 legacy read/write flags
  - DB v31 删除 legacy 三表的当前运行时暴露面
  - graph helper 收口到 `LayerSegmentGraphService`
- 退出条件：
  - `npm run typecheck` 通过
  - `npm test` 通过

#### 阶段 B：测试封账

- 目标：所有有效测试以 canonical 模型表达系统行为，不再依赖已删除运行时表。
- 已完成项：
  - 服务测试迁移到 `layer_units` / `layer_unit_contents` / `unit_relations`
  - Hook / import-export / persistence / embedding / migration roundtrip 测试迁移完成
  - 性能基线测试改为适配全量并发噪声，但仍保留真实上界约束
- 退出条件：
  - 全量 120/120 文件通过
  - 全量 1024/1024 用例通过

#### 阶段 C：文档封账

- 目标：把“当前事实”和“历史阶段”明确分层，避免后续误用旧文档。
- 必做动作：
  - 核心迁移文档顶部补记最终状态
  - 将仍描述 `layer_segments` / `segment_links` 为当前运行时结构的文档标记为“历史方案 / 历史记录”
  - 对仍使用“bridge/stop-read/stop-write 正在推进中”表述的文档做收束说明
- 验收标准：
  - 核心文档能明确回答“当前真源是什么”
  - 历史文档不会再被读成当前设计说明

#### 阶段 D：治理封账

- 目标：防止后续回退。
- 必做动作：
  - 保留 `check-segmentation-storage-boundary` 到测试链
  - 将白名单限定为 storage-layer 文件，并随架构变化同步更新
  - 在 repo memory 中记录本次最终收口结论
- 验收标准：
  - 新增代码若重新 direct access segmentation 真表，会立即被门禁拦截

### 11.4 剩余可执行事项清单

以下是收尾后仍值得做、但不再阻塞交付的事项：

1. 历史文档批量标注
   - 为仍提到 legacy 三表的旧规划/复盘/审计文档统一加“历史阶段”提示。
2. 历史注释清理
   - 将源码中少量仍写着 `layer_segments` 语义的注释改为 canonical 描述。
3. 发布说明归档
   - 产出一份简版发布说明，概述 v31、bridge 删除、flags 删除、门禁更新。

### 11.5 最终验收口径

当以下 5 条同时成立时，本次迁移可视为彻底收尾：

1. 生产运行时只依赖 LayerUnit 真源。
2. 全量测试和类型检查持续通过。
3. DB 当前版本不再暴露 legacy segmentation 三表。
4. 门禁可以阻止业务层重新引入 direct table access。
5. 核心文档与 repo memory 明确记录最终状态。

### 11.6 一句话结论

这次“全部收尾”不再是继续做架构迁移，而是把已经完成的迁移正式封账、固化、去歧义，并建立防回退护栏。
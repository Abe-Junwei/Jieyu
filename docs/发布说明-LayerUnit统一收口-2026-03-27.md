# 发布说明：LayerUnit 统一收口（2026-03-27）

## 版本范围
- 模块：转写分层编辑、segment graph、导入导出、快照恢复、数据库导入导出、存储边界治理
- 目标：将 segmentation 运行时真源统一收敛到 LayerUnit，并完成 legacy segmentation 三表退场

## 主要变更
1. 运行时真源完成统一
- 当前运行时真源固定为 `layer_units`、`layer_unit_contents`、`unit_relations`
- segment / content / relation 的主读写路径统一走 canonical query 与 graph service

2. legacy bridge 正式删除
- 删除 `src/services/LayerUnitLegacyBridgeService.ts`
- graph 删除、快照、恢复、split clone 等职责改由 `src/services/LayerSegmentGraphService.ts` 承接

3. 灰度开关退出生产配置
- 删除 `legacySegmentationMirrorWriteEnabled`
- 删除 `legacySegmentationReadFallbackEnabled`
- 运行时不再保留“回退到 legacy 表”的生产入口

4. 数据库当前集合面完成收口
- `src/db/index.ts` 当前运行时集合面移除 `layer_segments`、`layer_segment_contents`、`segment_links`
- DB v31 增加对 legacy segmentation 三表的物理 drop
- 导入校验同步切换为 LayerUnit snapshot 口径

5. 服务与页面逻辑完成 canonical 化
- `LayerSegmentationV2Service`
- `LayerSegmentationTextService`
- `LinguisticService`
- `useTranscriptionLayerActions`
- `TranscriptionPage.Orchestrator`
- `useImportExport`

6. 测试与门禁同步更新
- 新增 `src/services/LayerSegmentGraphService.test.ts`
- 删除 `src/services/LayerUnitLegacyBridgeService.test.ts`
- segmentation 相关测试夹具统一改为 LayerUnit 集合
- `scripts/check-segmentation-storage-boundary.mjs` 白名单更新为当前 storage-layer 文件集合

## 影响面
- 影响当前 segmentation 运行时、分层时间编辑、segment graph 清理、EAF 导入导出、项目级导入导出
- 不再支持将 legacy segmentation 三表作为当前运行时真源
- 历史迁移文档与历史审计文档仍保留，但已补充“历史阶段”说明

## 兼容性与回退
- 兼容旧库升级：通过 `src/db/index.ts` 历史 migration 链保留升级路径
- 不提供运行时 feature flag 回退到 legacy 表的机制
- 若需回退，只能基于代码版本回退，而非当前版本内切换

## 验证摘要
- `npm run typecheck`：通过
- `npm test`：通过
- 全量结果：120/120 文件通过，1024/1024 用例通过

## 风险收口
- 业务层重新 direct access segmentation 真表会被 `check-segmentation-storage-boundary` 门禁拦截
- 历史文档中提及 `layer_segments`、`layer_segment_contents`、`segment_links` 的段落均应按“历史阶段”理解

## 一句话结论
- LayerUnit 收口已从“迁移进行中”切换为“当前运行时事实”；legacy segmentation 三表已退出当前运行时。
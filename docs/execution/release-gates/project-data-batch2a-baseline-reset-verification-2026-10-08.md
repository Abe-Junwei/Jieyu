---
title: 项目数据第 2A 批（基线重置）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-08
source_of_truth: tests/e2e/batch2aBaselineReset.spec.ts
---

# 项目数据第 2A 批（基线重置）验证记录（2026-10-08）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 2A 批（T1–T3、T47、T50、T56）。

## 范围（rev5 8.1 / 4.4 / 6.3 / D10 / D14）

- 主库 `jieyudb_v2` → `jieyu`，只声明 `version(1)`；stores 与旧 v54 最终结构等价（物理表 `orthography_transforms` 更名 `orthography_bridges`）。
- 删除 `version(1..54)` 链、全部 upgrader、`src/db/migrations/`、迁移专用 helper/类型/测试、`preMigrationBackup`、迁移进度遮罩与“从迁移前备份恢复”。
- `io.ts` 删除 `orthography_transforms` 别名合并与 `audioDataUrl` 回灌。
- DBCore 写入校验中间件（add/put/bulkPut/update/modify 逐行 zod 校验，失败带表名和字段，事务回滚）。
- `tableRegistry`：目录表清单 + 数据分类 + 本地库重置策略合并一处。
- D10：检测 2A 之前的标记（`jieyudb_v2`、`jieyu_pre_migration_backups`、`jieyu.backup.preMigrationSnapshot:*`），确认后只删 5 个库和清单键；拒绝时新库照常工作，下次启动再提示。
- T56：冻结前常驻“开发期版本：数据可能被重置”。`src/config/dataFreeze.ts` 中 `JIEYU_DATA_FROZEN = true` 后消失。
- 不包含：第 4a 批迁移框架、2B 新字段、Supabase/云端（D12）。

## 自动化验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 全量单元测试 | `npm run test:vitest:dot` | 832 文件通过、1 跳过；5821 用例通过 |
| 2A 单元测试 | `engine.baseline` (T1)、`writeValidationMiddleware` (T50)、`tableRegistry`、`legacyDataReset` (T2/T47)、`LegacyDataResetDialog`、`DevBuildBanner` (T56) | 全部通过；T50 记录 bulkPut 5000 行含校验约 124 ms（fake-indexeddb） |
| 架构守卫 | `npm run check:architecture-guard` | 通过 |
| A2A 保留检查 | `node scripts/check-a2a-schema-reservation.mjs` | 通过（改为检查基线 stores） |
| knip | `npx knip` | 本批改动文件无新增未使用导出（其余为既有项） |
| Batch 1 e2e | `npx playwright test --project=chromium tests/e2e/batch1MediaPreservation.spec.ts` | 4/4 通过 |
| 2A e2e | `npx playwright test --project=chromium tests/e2e/batch2aBaselineReset.spec.ts --repeat-each=3` | 9/9 通过 |
| Chromium 全量 e2e | `npx playwright test --project=chromium` | 49 通过 |

## 手动复核（可选）

1. 在本分支 `npm run build && npm run preview`，用曾经跑过旧版本的浏览器配置打开 `http://localhost:4173/transcription`。
2. 应弹出“检测到旧版本的本地数据”，列出 `jieyudb_v2` 等库。点“暂不删除”：对话框关闭，工作区可用；刷新后再次弹出。
3. 点“删除旧数据”：页面自动刷新，不再弹出。DevTools → Application → IndexedDB：`jieyudb_v2`、`jieyu_pre_migration_backups` 消失，`jieyu` 存在；`jieyu-voice-sessions`、`jieyu-user-behavior`、`jieyu-acoustic-analysis` 仍在且版本号未变。
4. 顶部常驻黄色条“开发期版本：数据可能被重置，请勿存放需要保留的资料。”
5. 旧数据不会迁移进新库；需要的资料请先在旧版本导出 JYM/JYT 再导入。

## 偏差

- 写入校验暂不拒绝 `system.*` 模板 ID：Leipzig 系统结构规则仍在启动时写入 `structural_rule_profiles`，该规则随 2B-B（模板改为代码常量）一并加入。
- `audioDataUrl` 删除后，JSON 快照没有“携带字节”的通道；Batch 1 的 T8“带字节替换本机字节”改为用内存 Blob 验证，正式的媒体打包在第 3 批。
- localStorage 清单在 8.1 基础上补充了保存媒体/项目 ID 的 3 个键：`jieyu:track-entity-state:v1`、`jieyu:vad-cache`、`jieyu:waveform-decode-attempt`。
- 检测只认 2A 之前独有的标记；`jieyu_recovery`、`jieyu-project-memory`、`jieyu_collab_client_state` 会被新版本以同名重建，不能作为标记。确认删除时它们一并删除（新版本会按需重建）。
- 全仓其余 `legacy` 字样（约 77 个源文件）只处理了数据库层；UI/AI 等处的逐个判断留到对应切片。`claimUnscopedCatalog`、`mediaItemTimelineKind` 启发式按 rev5 留给 2B-B / 2B-C。
- `audit_logs`、`mcp_tool_call_audits` 分类为 `audit_log`（不进 JYB），`external_mcp_trust` 按凭据处理；JYB 分类的完整校验在第 3 批（T53）。

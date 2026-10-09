---
title: 项目数据第 4a 批（迁移框架）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch4aMigrationFramework.spec.ts
---

# 项目数据第 4a 批（迁移框架）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 4a 批（T38–T40、T42、T45、T54、T55、T57；D2、D9、D14）。

## 范围

- 版本账本 `src/db/migration/schemaVersions.ts`：Dexie 构造、分级、冻结检查读同一份数据；冻结前只有基线 `version(1)`。
- 分级（8.2 / D2）：按 `(from, to]` 区间整体判断；未声明 ⇒ rewriting；删表、改主键、已有表加唯一索引、删/改索引、带 upgrader ⇒ rewriting（即使声明 additive）。新表上的唯一索引算 additive。
- 版本检测：Dexie 版本 = 原生版本 / 10（`floor`，兼容 Dexie 的 schema 补丁 +1）；比应用新 ⇒ 拒绝打开，提供原始导出。
- 迁移闸门 `openThroughMigrationGate`：检测 → Web Locks `jieyu-db-upgrade` → BroadcastChannel `jieyu-db-coordination` 广播暂停 → 两槽快照（已验证标记）→ 决策 → 打开升级；被其他标签页阻塞或超时 ⇒ 中止，原库不动。
- 升级守卫：主库的 IDBFactory 包一层，只有闸门放行的升级能执行，Dexie 自动重开绕不过闸门。
- 两槽快照库 `jieyu_migration_snapshots`：写入前按两份共存做配额预检；写入后重开校验行数与抽样 SHA-256；成功时标记已验证并删除上一份；失败只删除本次的半成品；启动时清理未验证残留。
- 写入失败分类：QuotaExceededError、AbortError、事务已结束、连接已关闭、版本冲突、被阻塞；任何情况都不自动删除原库，界面如实说明。
- 原始恢复导出（raw-idb ZIP）：不经过 `getDb()`，直接按原生 IndexedDB 读取；`manifest.json` + `stores/*.ndjson` + `blobs/*.bin`。
- 界面：`DbMigrationGateOverlay`（数据比应用新 / 迁移被阻断 / 被其他标签页阻塞 / 本页连接已过期，均可导出原始快照）；带警告继续时显示 toast。
- 开关：`src/config/migrationFeatures.ts` 每项可单独关闭；`JIEYU_DATA_FROZEN = true` 后 `gate`、`blockRewritingWithoutVerifiedSnapshot`、`abortUpgradeWhenBlocked` 被强制打开。
- T57 冻结检查 `src/db/migration/schemaFreeze.test.ts`（随 `npm run test:vitest` 进 CI，也可 `npm run check:schema-freeze` 单跑）。
- 不包含：2C、第 3 批、第 4b 批（raw → JYB 转换、持久化申请、诊断页）、Supabase/云端。

## 冻结点操作（D14）

1. `src/config/dataFreeze.ts` 改为 `JIEYU_DATA_FROZEN = true`。
2. 运行 `npm run schema:freeze-record`，生成 `src/db/migration/schemaFreeze.record.json` 并提交。
3. 之后只能在账本末尾追加版本：必须声明 tier；rewriting 必须带 upgrader 和 `fixtureTest`（存在的合成夹具测试）；upgrader 里不能出现 WebCrypto / fetch / XMLHttpRequest / 动态 import。新版本发布后再运行一次第 2 步（只追加，已冻结条目被改动时拒绝）。

## 待冻结参数（当前取保守值）

| 参数                     | 值                                       | 位置                                        |
| ------------------------ | ---------------------------------------- | ------------------------------------------- |
| 等待升级锁               | 10 s                                     | `JIEYU_MIGRATION_TIMEOUTS.upgradeLockMs`    |
| 广播暂停后的宽限         | 300 ms                                   | `JIEYU_MIGRATION_TIMEOUTS.broadcastGraceMs` |
| 升级请求开始前的等待上限 | 8 s                                      | `JIEYU_MIGRATION_TIMEOUTS.upgradeOpenMs`    |
| 快照配额余量             | 新快照估算 × 1.2（上一份已计入已用空间） | `migrationSnapshotStore.ts`                 |

## 自动化验证

| 项                | 命令                                                                                 | 结果                                         |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| 类型检查          | `npx tsc --noEmit`                                                                   | 通过                                         |
| 改动文件 lint     | `npx eslint --max-warnings 0 <changed files>`                                        | 通过                                         |
| 4a 单元测试       | `npx vitest run src/db/migration`                                                    | 9 文件 73 用例通过                           |
| 架构守卫          | `npm run check:architecture-guard`                                                   | 通过                                         |
| knip（CI 口径）   | `npm run check:knip:ci`                                                              | 通过                                         |
| 全量单元测试      | `npm run test:vitest:dot`                                                            | 858 文件通过、2 跳过；6007 用例通过、57 跳过 |
| 4a e2e            | `npx playwright test --project=chromium tests/e2e/batch4aMigrationFramework.spec.ts` | 4/4 通过                                     |
| Chromium 全量 e2e | `npx playwright test --project=chromium --retries=0`                                 | 57 通过、2 跳过                              |

测试编号对应：T38/T39 `migrationGate.test.ts` + e2e；T40 `versionDetection.test.ts`、`migrationTier.test.ts`；T42/T45 `migrationSnapshotStore.test.ts`；T54 `migrationGate.test.ts` + e2e（主库 versionchange 过期提示、合成库协作/顽固标签页）；T55 `migrationSnapshotStore.test.ts`、`storageFailure.test.ts` + e2e；T57 `schemaFreeze.test.ts`。

## 已知限制

- 快照与原始导出把整库读进内存，适合当前开发期数据量；大库流式处理留到第 4b 批评估。
- 主库目前只有 `version(1)`，浏览器里的“顽固标签页阻塞升级”和 T38/T39 用 webdriver 专用测试桩在合成库（`jieyu-e2e-synth-*`）上验证；主库路径由单元测试覆盖。

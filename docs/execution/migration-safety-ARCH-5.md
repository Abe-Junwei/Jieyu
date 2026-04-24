# 迁移安全与降级（ARCH-5，按浏览器能力边界已收口）

> 与 `docs/remediation-plan-2026-04-24.md` §3.5 对账；面向工程与高级用户。

## 为何无法「在升级事务里自动全库备份」

IndexedDB 在一次 `upgradeneeded` 期间**通常不能**再打开同一库的第二连接做完整导出；应用内 `exportDatabaseAsJson` 走 `getDb()`，与迁移中的锁竞争。因此 **生产路径不承诺** 在 schema 升级前静默写一份可恢复快照。

## 推荐：应用大版本 / 浏览器大更新前

1. 在应用内使用**数据库 JSON 导出**（与 `src/db/io.ts` 的 `exportDatabaseAsJson` / `downloadDatabaseAsJson` 一致能力；实际入口以产品设置为准）。
2. 将 `.json` 存到本机或网盘；大项目可配合既有「备份提醒」流程（见 F-1 / 备份相关 ADR）。

## 迁移失败或数据异常时

1. **不要**在未备份时反复强刷同一 profile，以免覆盖可恢复状态。
2. 若有 JSON 导出：在新库或清空站点数据后使用**导入**（`importDatabaseFromJson` 及 UI 流程），按产品提示处理冲突策略。
3. 若无导出：只能接受数据不可恢复或回退到浏览器/系统级备份（视环境而定）；本仓库无法从客户端自动重建已损坏的 IndexedDB。

## CI / 工程保障

- `src/db/migrations/jieyuDexieOpenReplay.test.ts`：在**独立库名**上对 `JieyuDexie` 执行 `open()`，断言 `verno === JIEYU_DEXIE_TARGET_SCHEMA_VERSION`（定义于 `src/db/engine.ts`）。**新增 Dexie 版本时**须同步提高 `JIEYU_DEXIE_TARGET_SCHEMA_VERSION` 并跑全量测试。
- 迁移进度可视化：`src/db/engine.ts` 通过 `jieyu:db-migrating` / `jieyu:db-migration-done` 派发升级事件；`src/hooks/useAppDataResilienceEffects.ts` 监听后由 `src/components/DbMigrationOverlay.tsx` 在 `src/App.tsx` 展示阻断遮罩与版本信息。

## 未在此清单内

- 浏览器内「升级前静默自动全量备份」：受 IndexedDB 升级事务模型限制，不作为本仓库工程承诺；继续采用“升级前手动导出”策略。

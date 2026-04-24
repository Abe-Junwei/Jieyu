# ARCH-9：测试覆盖与复杂度 — 可落地增量

与整改表 `docs/remediation-plan-2026-04-24.md` §3.9 对应：在不大规模重写业务流的前提下，补齐**可自动化**的契约测试与 E2E 烟测。

## 1. `fireAndForget` 可测性

- **ARCH-1 收口叙事**（治理决策、CI、三档 `policy` 含 `background-quiet`、不强制全库 `Result`）：[`arch1-fireAndForget-2026-04-25.md`](./arch1-fireAndForget-2026-04-25.md)。
- **`asyncResultFromPromise<T>`**（`src/utils/fireAndForget.ts`）：将 `Promise` 转为 `{ ok, value? | error? }`，供单测与边界处显式分支，**不**替代 `fireAndForget` 的全局错误治理。
- **单元测试**（`src/utils/fireAndForget.test.ts`）：覆盖 `background` / `user-visible` 日志、自定义事件、`onError` 短路、空 `context` 归一化。

## 2. 数据库迁移

- 全链**干净库打开回放**见 **`src/db/migrations/jieyuDexieOpenReplay.test.ts`**（亦在整改叙事中与 ARCH-5 对齐）；新增迁移时请保持 `JIEYU_DEXIE_TARGET_SCHEMA_VERSION` 可升级性。

## 3. 协作冲突

- **`src/collaboration/collaborationConflictRuntime.test.ts`** 等已覆盖 `detect` / `resolve` 与 LWW 策略；新冲突类型请在同目录或邻近模块补充表驱动用例。

## 4. E2E 关键路径

- **`tests/e2e/criticalPaths.spec.ts`**：在首屏、转写、404、CSP 之外，增加 **词典**、**语料库**路由的最小烟测（标题/正文中英兼容），作为「多页壳 + 数据页可达」的回归锚点。
- **ARCH-9 全链路用例（已落地）**：新增「创建语言层（转写层）→ 添加翻译层 → 项目中心导出 Toolbox」跨步骤 E2E，覆盖左轨建层、LayerActionPopover 语言选择、项目中心导出入口可达。

## 5. 验证证据

- 定向回归命令：`npx playwright test tests/e2e/criticalPaths.spec.ts -g "ARCH-9"`
- 最近一次结果：`9 passed (6.6s)`（Chromium / Firefox / WebKit 全通过）

## 6. 本轮边界说明

- 全量将业务调用点从 `fireAndForget` 迁到 `AsyncResult`：由调用点按需采用 `asyncResultFromPromise`，不强制大重构。

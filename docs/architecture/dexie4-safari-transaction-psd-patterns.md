---
title: Dexie 4 + Safari 事务作用域与 PSD 实践
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-04-19
source_of_truth: dexie-safari-transaction-psd
---

# Dexie 4 + Safari：IndexedDB 事务作用域与 PSD 实践一页纸

面向在本仓库内编写 **Dexie 4** 读写代码的工程师。目标：避免 `Table <store> not part of transaction`、`TransactionInactiveError`、以及 Safari / WebKit 上因 **PSD（Promise Specific Data）** 断裂导致的诡异栈与错表名报错。

---

## 1. 背景（两句话）

- **IndexedDB**：`IDBDatabase.transaction(storeNames, …)` 创建的事务 **只能访问创建时列入的 object store**；否则底层抛 **`NotFoundError`**（Dexie 常包装为 *not part of transaction* 类文案）。
- **Dexie**：用 **`Dexie.Promise` + PSD** 在 Promise 链上携带「当前 Dexie 事务上下文」；**Native `async/await`** 的 continuation 往往 **不携带该上下文**，与 Safari 调度叠加后更容易出事故。

权威参考：[MDN — `IDBDatabase.transaction()`](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)、[Dexie — `Dexie.waitFor()`](https://dexie.org/docs/Dexie/Dexie.waitFor())、[Dexie — `Dexie.ignoreTransaction()`](https://dexie.org/docs/Dexie/Dexie.ignoreTransaction())、[Dexie — `Promise.PSD`](https://dexie.org/docs/Promise/Promise.PSD)

---

## 2. 反模式清单（Code Review 可逐条勾）

| 反模式 | 为何危险 | 更稳妥方向 |
|--------|----------|------------|
| `Dexie.ignoreTransaction(async () => { await …; db.table… })` | `ignoreTransaction` 基于 `usePSD`：`async` 在首个 `await` 即返回 Promise，`finally` 提前恢复外层 PSD，**后续读表可能仍挂在错误事务上** | 回调内 **同步返回** `Dexie.Promise` 链；或把逻辑移出父事务 |
| `Dexie.Promise.resolve(someAsyncFn())`，其中 `someAsyncFn` 为 `async` | 外层拿到的是 **Native Promise** 的异步形状，**Dexie PSD 无法贯穿** | 用 `Dexie.Promise` 的 `.then` 拼链，或让 `someAsyncFn` **返回** Dexie 链而非 `async` |
| `db.dexie.transaction('r', [A,B], async () => { await x; return db.C.get() })` | `await` 之后访问 **未列入** 的 `C` | 把 `C` 加进 store 列表；或拆成两段事务；见 `src/db/dexieTranscriptionGraphStores.ts` 的 **`dexieStoresFor*`** 惯例 |
| 在已有 `ignoreTransaction` / 父事务语义下 **再套一层** `db.dexie.transaction('r', …)` | Safari 上嵌套只读事务与 PSD 组合更易出现 **作用域错位** | 若仅多表只读且无强一致单事务需求，优先 **无嵌套事务的 `Dexie.Promise.all`** |
| 在事务回调里 `await fetch()` / 重 CPU / 不确定耗时的 Native Promise，且未使用官方手段 | 易导致 **`TransactionInactiveError`** / 过早提交类问题 | 短操作可用 **`Dexie.waitFor`**；否则 **移出事务前后**执行（官方也推荐能外置则外置） |
| 仅凭 `Dexie.currentTransaction === null` 推断「绝对不在任何 Dexie 事务语义下」 | 个别引擎时序下可能与真实 PSD **不完全同步**（Safari 相对更敏感） | 关键路径用 **`Dexie.waitFor` + Dexie 链** 或保守 `setTimeout` 推迟；读路径可参考 `runDexieScopedReadTask` |
| `Promise.all` 大量并行 Dexie 读放大调度 | 不单独致病，但在 PSD 已不稳时 **更容易触发竞态** | 启动期关键重建可 **顺序化**；一般业务读仍可按需并行 |

---

## 3. 推荐模板

以下模板中 **`DP`** 表示 `Dexie.Promise`（与 Dexie 4 类型导出一致）。表清单请 **始终** 通过 `dexieStoresFor*` 与调用方保持同步。

### 3.1 必须在「非当前事务」下完成的多表读（语言目录类）

原则：**`ignoreTransaction` 的回调必须同步返回 `Dexie.Promise` 链**，链内完成所有 Dexie 读；**不要用 `async` 回调**。

```typescript
import Dexie from 'dexie';

function readExample(dbPromise: ReturnType<typeof import('../db').getDb>): Promise<ResultRow[]> {
  const DP = Dexie.Promise;
  return Dexie.ignoreTransaction(() =>
    DP.resolve(dbPromise).then((db) =>
      DP.all([
        db.dexie.languages.toArray(),
        db.dexie.language_display_names.toArray(),
        db.dexie.language_aliases.toArray(),
      ]),
    ).then(([languages, displayNames, aliases]) => {
      // 纯同步投影
      return projectRows(languages, displayNames, aliases);
    }),
  );
}
```

与 **Native `fetch`** 组合时，同样用 **`DP.resolve(fetch(...))`** 接 `.then`/`.catch`，避免在 `ignoreTransaction` 内用 `async/await` 断开链。

### 3.2 一段「可能被父事务包裹」的整体任务（启动刷新类）

原则：入口用 **`Dexie.waitFor(() => …)`**，且 **`…` 返回 Dexie 链**（而不是裸 `async` 函数直接作为 `waitFor` 回调体）。

```typescript
import Dexie from 'dexie';

function runBootTask(): Promise<void> {
  const DP = Dexie.Promise;
  return Dexie.waitFor(() =>
    DP.resolve()
      .then(() => stepOneDexieRead())
      .then(() => stepTwoDexieRead())
      .then(() => {
        /* 同步写内存 / localStorage */
      }),
  );
}
```

说明：`waitFor` 在 **无父事务** 时开销很低；在 **有父事务** 时用于按 Dexie 支持的方式与父事务交错（仍应避免长任务）。文档：[Dexie.waitFor()](https://dexie.org/docs/Dexie/Dexie.waitFor())

### 3.3 顺序多步读（避免启动期 fan-out）

```typescript
import Dexie from 'dexie';

function sequentialLocales(locales: readonly string[], readOne: (locale: string) => Promise<Row[]>): Promise<Row[][]> {
  const DP = Dexie.Promise;
  const out: Row[][] = [];
  let p: ReturnType<typeof DP.resolve> = DP.resolve();
  for (const locale of locales) {
    p = p.then(() => readOne(locale).then((rows) => { out.push(rows); }));
  }
  return p.then(() => out);
}
```

若 `readOne` 已按 3.1 返回 **Dexie 链**，此处 `.then` 会延续 PSD。

### 3.4 显式读写事务（项目惯例）

```typescript
import { getDb } from '../db';
import { dexieStoresForLanguageCatalogMutateRw } from '../db/dexieTranscriptionGraphStores';

async function mutateExample() {
  const db = await getDb();
  await db.dexie.transaction('rw', [...dexieStoresForLanguageCatalogMutateRw(db)], async () => {
    // 仅访问 helper 列出的表；await 之后也不得新增未声明表
  });
}
```

**自检**：在事务回调内全文搜索 `db.dexie.` / `await`，确认没有「漏表」。

### 3.5 可能被外层窄事务调用的 `layer_units` 读（本仓库已有模式）

封装读任务，统一走 **`runDexieScopedReadTask`**（`src/services/LayerSegmentQueryService.ts`）：在 **当前事务已包含所需 store** 时内联执行；否则 **`Dexie.waitFor`**；在 **`currentTransaction` 为空** 时先试跑，命中 *not part of transaction* 再 `waitFor` 重试（Safari 常见路径）。

新增读路径时：**不要**在业务层散落 `db.dexie.layer_units…`；优先复用该 helper 或同等语义封装。

---

## 4. 调试建议（遇到错表名 / 栈不准）

1. 以 **报错信息中的表名** 为准，定位「**谁在访问该表**」；栈顶业务行可能是 **异步错位**。
2. 搜索 **`ignoreTransaction(`、`waitFor(`、`transaction(`** 与 **`async`** 的组合是否违反第 2 节表格。
3. 对照 **`dexieStoresFor*`** 与事务回调内 **所有** `await` 之后的访问。

---

## 5. 与本仓库的对应关系（便于跳转）

- 表清单辅助：`src/db/dexieTranscriptionGraphStores.ts`（`dexieStoresFor*`）
- 窄事务下安全读：`src/services/LayerSegmentQueryService.ts`（`runDexieScopedReadTask`、`dexieTransactionIncludesObjectStores`）
- 语言目录读与运行时缓存重建：`src/services/LinguisticService.languageCatalog.ts`（`readLanguageCatalogProjection`、`rebuildLanguageCatalogRuntimeCache`、`refreshLanguageCatalogReadModel`）
- 外层级联事务内删除 segmentation 图：在 `src/services/LinguisticService.cleanup.ts` 中直接调用 `deleteLayerSegmentGraphByUnitIds`（避免再包 `removeUnitCascadeFromSegmentationV2` 的内层 `transaction`）；独立入口仍用 `src/services/LayerSegmentationTextService.ts` 的 `removeUnitCascadeFromSegmentationV2`

---

## 6. 维护

新增或修改 Dexie 事务边界时，建议 Code Review 对照 **第 2 节表格**。文档变更后执行：`npm run check:docs-governance`。

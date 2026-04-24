# ARCH-2：独立 `*Messages` 模块与 `DICT_KEYS` 体系 — 收口说明（**已关门：src/i18n/*Messages.ts 词典接入边界**）

> **doc_type**：execution-governance  
> **对账**：`docs/remediation-plan-2026-04-24.md` §3.2、报表 `npm run report:arch2-i18n-message-modules`、盘点文档 [`i18n-ARCH-2-message-module-inventory-2026-04-25.md`](./i18n-ARCH-2-message-module-inventory-2026-04-25.md)  
> **last_updated**：2026-04-25

## 1. 关门边界

- **本次关门范围**：`src/i18n/*Messages.ts`（排除 `messages.ts` 桶出口、`*.test.*`、显式治理豁免项）下的全部 message module。
- **验收标准**：每个 message module 中的用户可见字符串，须至少通过以下其中一种机制从词典真源读取：
  - `t(locale, 'dict.key')` / `tf(locale, 'dict.key', vars)`（`DICT_KEYS` + `dictionaries/zh-CN|en-US`）
  - `readMessageCatalog(locale, 'msg.xxx.catalog')`（词典 JSON catalog，`src/i18n/messageCatalog.ts`）
- **不纳入本次边界**：
  - `timelineParityMatrixMessages.ts` — 治理矩阵数据文件，非运行态 UI copy，已显式标注 `@i18n-governance-exempt`，不计入报告分母。
  - `messages.ts` — 桶出口文件，无独立业务字符串。
  - 字符串**翻译质量**与**覆盖完整性**（未测试每条字符串的语义准确性）。

以上边界已按 `report:arch2-i18n-message-modules` 脚本实测核对完毕；当前结果为 **36 个模块、36/36 已词典接入、0 个纯内嵌残留**。后续新增 message module 按同一标准纳入常规变更审查，不再保留为当前未落地项。

## 2. 已落地的部分

### 2.1 主线：DICT_KEYS + dictionaries

- `src/i18n/dictKeys.ts`：所有用 `t`/`tf` 访问的键的唯一注册表（`DICT_KEYS` 常量数组 + `DictKey` 类型）。
- `src/i18n/dictionaries/zh-CN.ts` / `en-US.ts`：按 `DictKey` 对应的中英双语词条，`preloadLocaleDictionary` 统一异步加载。
- 凡单条或少量字符串的 message module，以 `t` / `tf` 直接接入，典型例子：
  - `languageInputMessages.ts`、`confirmDeleteDialogMessages.ts`、`noteHandlersMessages.ts`、`appDataResilienceMessages.ts` 等。

### 2.2 大体量 catalog 路径

大量字符串聚合在同一模块时，拆成多个零散键会造成键管理膨胀。对此引入 **`messageCatalog.ts`**（`src/i18n/messageCatalog.ts`），支持以一个 catalog 键（如 `msg.settings.catalog`）存储整组词典 JSON，由 `readMessageCatalog` 解析，`formatCatalogTemplate` 处理动态模板。

已采用 catalog 路径的模块：

| 模块 | catalog 键 |
| --- | --- |
| `settingsModalMessages.ts` | `msg.settings.catalog` |
| `sidePaneSidebarMessages.ts` | `msg.sidePaneSidebar.catalog` |
| `layerConstraintServiceMessages.ts` | `msg.layerConstraint.catalog` |
| `layerActionPopoverMessages.ts` | `msg.layerAction.catalog` |
| `orthographyBuilderMessages.ts` | `msg.orthoBuilder.catalog` |
| `orthographyBridgeManagerMessages.ts` | `msg.orthoBridge.catalog` |
| `collaborationCloudPanelMessages.ts` | `msg.collabCloud.catalog` |
| `reportGeneratorMessages.ts` | `msg.report.catalog` |

## 3. 治理守卫矩阵

| 检查 | 作用 | 不保证 |
| --- | --- | --- |
| `check:i18n-message-imports` | 业务侧只能从 `src/i18n/messages.ts` 桶导入，禁止直连 `*Messages.ts` | 不替代字符串本身的词典接入 |
| `check:i18n-hardcoded:guard` | `src/pages`、`src/components`、`src/hooks` 等目录的汉字硬编码基线约束 | 不检查 message module 内的字符串形态 |
| `check:locale-usage` | `locale` 使用约定（避免原始字符串类型等） | 同上 |
| `report:arch2-i18n-message-modules` | 按 `t`/`tf`/`readMessageCatalog` + 豁免标记核对 message module 接入状态 | 不检查翻译语义质量；不检查单条键覆盖率 |

## 4. 单测与可测性

以下测试均有针对 message module 和词典集成的覆盖：

- `src/i18n/messages.test.ts`（如存在）：桶出口导出结构契约。
- 各组件测试（`*.test.tsx`）中的 message fixture 使用真实 `get*Messages` 调用，防止 mock 与真实词典漂移。

## 5. 后续治理约束

1. 新增 message module 时，默认走 `t`/`tf` 或 `readMessageCatalog`；禁止在 message module 内保留并行中英对象。
2. `report:arch2-i18n-message-modules` 的 **36 / 0** 结果作为可选回归基线（`inline-only` 不得从 0 回升）。
3. 新增 catalog 路径时，先在 `src/i18n/dictKeys.ts` 注册 catalog 键（如 `msg.xxx.catalog`），再同步补 `zh-CN.ts` / `en-US.ts` 词条；不得先写模块再补键。
4. 若新增治理豁免项（非运行态数据文件），需同步更新 `@i18n-governance-exempt` 注释与 `i18n-ARCH-2-message-module-inventory-2026-04-25.md` §4。

## 6. 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-04-25 | `report:arch2-i18n-message-modules` 统计口径扩为 `t`/`tf` + `readMessageCatalog`；脚本变量与输出文案对齐。 |
| 2026-04-25 | 盘点文档 [`i18n-ARCH-2-message-module-inventory-2026-04-25.md`](./i18n-ARCH-2-message-module-inventory-2026-04-25.md) 更新为 36/36、0 残留；从 [`未落地项汇总-2026-04-24.md`](./未落地项汇总-2026-04-24.md) §2 开放项移除。 |
| 2026-04-25 | 本文件首版，**ARCH-2 按 `src/i18n/*Messages.ts` 词典接入边界关门**。 |

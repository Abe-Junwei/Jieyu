# ARCH-2：独立 `*Messages` 与 `DICT_KEYS` 体系统账

> **last_updated**：2026-04-25  
> **scope**：`src/i18n/*Messages.ts`（不含 `messages.ts` 桶出口与 `*.test.ts`）  
> **结论**：**已完成**：业务侧独立 `*Messages.ts` 已全部接入 `DICT_KEYS` / 词典 catalog；`timelineParityMatrixMessages.ts` 已作为治理矩阵数据文件显式标注 `@i18n-governance-exempt`。  
> **对账命令**：`npm run report:arch2-i18n-message-modules`（与下表数字一致）

## 1. 名词

| 术语 | 含义 |
| --- | --- |
| **DICT_KEYS 体系** | `dictKeys.ts` 键 + `dictionaries/zh-CN|en-US` 条目 + 业务侧 `t`/`tf` 或 `readMessageCatalog` 取值 |
| **message module** | `src/i18n/*Messages.ts` 中导出 `get…Messages(locale)` 等、供面板/功能域聚合文案 |
| **已并入**（本盘点用语） | 该模块的用户可见串以 `t`/`tf(..., '…键')` 或 `readMessageCatalog(..., '…catalog')` 从词典读取 |
| **治理豁免** | 非产品 UI 文案、用于治理矩阵或基线说明的数据文件，带 `@i18n-governance-exempt`，不计入报告分母 |

## 2. 规模（2026-04-25 脚本实测）

| 指标 | 数量 |
| --- | --- |
| `*Messages.ts` 模块（排除 `messages.ts` 与治理豁免） | **36** |
| **含** `t`/`tf` 或 `readMessageCatalog`（DICT-backed） | **36** |
| **不含** `t`/`tf` / `readMessageCatalog`（纯模块内双语文案） | **0** |
| 治理豁免文件 | **1**（`timelineParityMatrixMessages.ts`） |

> 2026-04-25 收口后，报告已无 remaining 项；后续回归只需防止数字从 **36 / 0** 退化。

## 3. 当前状态

- 业务侧 `src/i18n/*Messages.ts` 已全部接入词典读取，无纯模块内双语对象残留。
- 新增 `src/i18n/messageCatalog.ts` 作为大体量模块的 catalog 读取桥，避免把超长 message 面拆成数十个零散键同时保持 `DICT_KEYS` 为统一真源。
- `timelineParityMatrixMessages.ts` 不属于运行态 UI copy，已通过 `@i18n-governance-exempt` 从报告分母剔除。

## 4. 迁移方式归类

- **直接键读取**：以 `t` / `tf` 从 `DICT_KEYS` 获取单条文案，适合条目较少或已有键集的模块。
- **catalog 读取**：以 `readMessageCatalog(..., 'msg.xxx.catalog')` 加载整组词典 JSON，再用 `formatCatalogTemplate` 处理少量动态模板，适合 `settingsModalMessages.ts`、`orthographyBridgeManagerMessages.ts`、`collaborationCloudPanelMessages.ts`、`layerConstraintServiceMessages.ts`、`orthographyBuilderMessages.ts`、`reportGeneratorMessages.ts`、`layerActionPopoverMessages.ts`、`sidePaneSidebarMessages.ts` 等大体量模块。

## 5. 已有 CI 与「是否并入 DICT_KEYS」的边界

| 检查 | 作用 | 不保证 |
| --- | --- | --- |
| `npm run check:i18n-message-imports` | 业务代码须从 `i18n/messages` 桶导入，**禁止**直连 `*Messages` 文件 | 不替代 message 内容迁移；只治理导入路径 |
| `check:i18n-hardcoded:guard` 等 | 硬编码与基线 | 不替代 per-module → `DICT_KEYS` 迁移 |
| `check:locale-usage` | `locale` 使用约定 | 同上 |
| `report:arch2-i18n-message-modules` | 按 `t` / `tf` / `readMessageCatalog` + 豁免标记核对 message 面是否已并入 | 不检查翻译语义质量；只检查治理接入面 |

## 6. 后续（产品/迭代）

1. 将 `report:arch2-i18n-message-modules` 的 **36 / 0** 结果作为回归基线，防止新 message 面回退到模块内双语对象。  
2. 新增大体量 message 模块时，优先复用 `messageCatalog.ts` + `msg.xxx.catalog` 模式，避免重新引入第二套真源。  
3. 若治理矩阵或基线文件新增非运行态中文数据，需显式补 `@i18n-governance-exempt`，避免 ARCH-2 报表失真。

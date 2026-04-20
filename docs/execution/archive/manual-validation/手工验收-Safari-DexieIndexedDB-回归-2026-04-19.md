# 手工验收：Safari — Dexie / IndexedDB 事务回归（2026-04-19）

## 修订记录

- **2026-04-20**：归档本轮结论；将 **`WebKitBlobResource` / `blob:` 资源加载失败** 明确为 **本清单不验收项**（与 Dexie 事务无关）；记录模板增加对应行。

## 验收结论（归档）

- **Dexie / IndexedDB 事务回归**（语言目录缓存、级联删除、无 `not part of transaction` 等）：**已通过**（以当时 Safari 手测 + 仓库内相关 Vitest 为准）。
- 控制台若仍出现 **`Failed to load resource` + `WebKitBlobResource错误1`**（常为内部资源 id + `line 0`）：**不纳入**本清单通过条件，见下文「非阻塞项」。

## 验收目标

- 确认 **WebKit（桌面 Safari）** 下不再出现与 IndexedDB 事务作用域相关的错误，尤其是：
  - `Table layer_units not part of transaction`（或同类 *not part of transaction*）
  - `TransactionInactiveError`
  - 控制台中 **`Failed to rebuild language catalog runtime cache`**（语言目录运行时缓存重建）

## 非阻塞项（本清单不验收）

以下现象与 **Blob URL / Safari 媒体资源管线** 相关，**不作为**本「Dexie / IndexedDB 事务回归」清单的失败依据；若需治理请单独开项（例如统一 `createObjectURL` / `revokeObjectURL` 生命周期、翻译轨音频控件等）。

- 控制台：`Failed to load resource: 未能完成操作。（WebKitBlobResource错误1。）`（资源列常为 UUID、`line 0`）
- 与 **`blob:`** 临时 URL、`URL.revokeObjectURL`、`<audio>` / 离屏媒体加载时序等相关

## 环境

- **Safari** 技术预览版或当前正式版均可；建议同时测 **无痕窗口**（排除旧 IndexedDB / localStorage 干扰）。
- 打开 **开发**菜单 → **显示 JavaScript 控制台**（或 Web 检查器），全程观察红色错误。

## 用例清单

### A. 冷启动 / 首屏

1. 完全退出 Safari 或新开无痕窗口，打开应用根 URL（本地 `vite` 或 `preview` 部署地址）。
2. 等待首屏可交互（转写或首页加载完成）。
3. **预期**：控制台 **无** 上述 Dexie / IDB 类错误；允许存在与本次验收无关的警告；**允许**出现「非阻塞项」中的 `WebKitBlobResource` 提示（本单不记失败）。

### B. 语言目录运行时缓存（首屏后）

1. 保持控制台打开，刷新页面 2～3 次（硬刷新可选：`⌘⌥R`）。
2. **预期**：不出现 `Failed to rebuild language catalog runtime cache`；若出现，展开错误对象查看 `message` / `name`。

### C. 项目级联删除（嵌套事务修复路径）

1. 准备或导入一个 **含句段/层图数据** 的测试项目（有 `layer_units` 等数据即可）。
2. 执行 **删除整个文本/项目**（走 `deleteProjectCascade` 的路径，与产品 UI 一致即可）。
3. **预期**：删除完成且无 IDB 事务错误；页面不白屏。

### D. 单条 unit 级联删除

1. 在转写界面删除 **一条 utterance / unit**（走 `removeUnitCascade`）。
2. **预期**：删除成功，控制台无 *not part of transaction*。

### E. 批量删除 unit（若有入口）

1. 多选若干 unit，执行 **批量删除**（走 `removeUnitsBatchCascade`）。
2. **预期**：同 D。

### F. AI 本地上下文（可选）

1. 若环境已启用 AI 与 `get_unit_linguistic_memory` 类工具：对某 unit 触发一次 **拉取语言学记忆** 的操作。
2. **预期**：无 IDB 作用域错误；若工具未启用可跳过并注明「N/A」。

## 记录模板（复制到 PR 或 issue）

```
Safari 版本：
构建/入口 URL：
Dexie/IDB 总评：通过 / 失败（与「验收结论」一致时写「通过」）
A 首屏：通过 / 失败（附控制台摘录）
B 语言目录刷新：通过 / 失败
C 删除项目：通过 / 失败
D 单条删除：通过 / 失败
E 批量删除：通过 / 失败 / N/A
F AI 工具：通过 / 失败 / N/A
G WebKitBlobResource / blob 资源（可选）：不验收 / 仍出现但不计失败 / N/A
```

## 可选：Playwright WebKit（自动化扩展）

当前仓库 `playwright.config.ts` 仅配置 **Chromium**。若需在 CI 或本机跑 WebKit，可：

1. 在 `playwright.config.ts` 的 `projects` 中增加 `{ name: 'webkit', use: { ...devices['Desktop Safari'] } }`（以 Playwright 文档为准）。
2. 本机执行：`npx playwright install webkit` 后 `npx playwright test --project=webkit`。

与 **真机 iOS Safari** 行为仍可能略有差异；**本清单以桌面 Safari 为准**，移动端建议另开一条验收记录。

## 相关文档与代码

- 实践一页纸：`docs/architecture/dexie4-safari-transaction-psd-patterns.md`
- 级联删除避免嵌套事务：`src/services/LinguisticService.cleanup.ts`（直接 `deleteLayerSegmentGraphByUnitIds`）
- 独立 segmentation 删除入口：`src/services/LayerSegmentationTextService.ts` — `removeUnitCascadeFromSegmentationV2`

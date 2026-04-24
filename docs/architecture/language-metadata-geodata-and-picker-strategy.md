---
title: 语言元数据工作台 — 地理数据与选择器策略
doc_type: architecture-current-state
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: engineering-audit-phase-a
---

# 语言元数据工作台 — 地理数据与选择器策略

本文档落实工程审计 **Phase A** 中 **A-5（ISO 3166 国家数据）** 与 **A-6（`react-select`）** 的结论，作为后续若要「换数据源 / 换组件」时的决策锚点。

## A-5：ISO 3166-1 国家列表（`country-state-city` 已迁出）

**结论（2026-04-25 起）：** 运行时代码 **不再依赖** `country-state-city` npm 包。国家名与 ISO2 来自仓库内 **静态快照** `src/data/iso3166CountriesSnapshot.json`（经 [`iso3166CountriesData.ts`](../../src/data/iso3166CountriesData.ts) 导出为 `ISO3166_COUNTRIES`）。

- **消费方**：[`languageMetadataWorkspace.country.ts`](../../src/pages/languageMetadataWorkspace.country.ts)（工作区级联 / 多选、别名 + `Intl.DisplayNames`）；[`iso3166CountryLabels.ts`](../../src/utils/iso3166CountryLabels.ts)（逗号/顿号表格式 UI 等）。
- **与旧版等价性**：顺序与 `Country.getAllCountries()` 快照生成时一致；`label` 仍以 `Intl` 的 region 显示名为准（与旧逻辑相同）。
- **再生成快照**（维护者极少需要）：`npm run data:iso3166-countries`；若 `node_modules` 中无该包，可临时 `npm i country-state-city@3.2.1` 后运行再卸载。脚本见 [`build-iso3166-countries-snapshot.mjs`](../../scripts/build-iso3166-countries-snapshot.mjs)。

## A-6：`react-select`

**结论（2026-04-24 更新）：已移除 npm 依赖；语言元数据工作台国家多选改为自研轻量 UI。**

- **原唯一 UI 使用处**：[`LanguageMetadataAdministrativeDivisionPicker.tsx`](../../src/pages/LanguageMetadataAdministrativeDivisionPicker.tsx) — 现为 **筛选输入 + 复选列表 + 已选芯片移除**，保留 `aria-labelledby` / `aria-controls` 与移除按钮的 `aria-label`（`tf` 模板）。
- **回归**：[`LanguageMetadataWorkspacePage.test.tsx`](../../src/pages/LanguageMetadataWorkspacePage.test.tsx) 覆盖行政区检索与保存路径；国家筛选交互以手动 / E2E 补测为可选增强。

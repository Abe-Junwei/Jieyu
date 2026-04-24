---
title: 语言元数据工作台 — 地理数据与选择器策略
doc_type: architecture-current-state
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: engineering-audit-phase-a
---

# 语言元数据工作台 — 地理数据与选择器策略

本文档落实工程审计 **Phase A** 中 **A-5（`country-state-city`）** 与 **A-6（`react-select`）** 的结论，作为后续若要「换数据源 / 换组件」时的决策锚点。

## A-5：`country-state-city`

**结论：现阶段保留 npm 依赖，不删除功能。**

- **运行时代码入口**：[`languageMetadataWorkspace.country.ts`](../../src/pages/languageMetadataWorkspace.country.ts) 使用 `Country.getAllCountries()` 构建 ISO 3166-1 国家列表与别名；[`iso3166CountryLabels.ts`](../../src/utils/iso3166CountryLabels.ts) 仅类型级引用 `Country`。
- **体积说明**：`node_modules` 中该包体积较大，但 **Vite 打包路径仅随「语言元数据工作台」相关 chunk 引用**；未进入转写主路径冷启动 bundle 的，不应与首屏转写 chunk 混为一谈。
- **后续优化（非本次范围）**：若需进一步降体积，优先考虑 **构建期生成静态 JSON**（国家列表 + 常用别名）并在工作台按需 `import()`，而不是直接删包导致地理选择能力回退。

## A-6：`react-select`

**结论（2026-04-24 更新）：已移除 npm 依赖；语言元数据工作台国家多选改为自研轻量 UI。**

- **原唯一 UI 使用处**：[`LanguageMetadataAdministrativeDivisionPicker.tsx`](../../src/pages/LanguageMetadataAdministrativeDivisionPicker.tsx) — 现为 **筛选输入 + 复选列表 + 已选芯片移除**，保留 `aria-labelledby` / `aria-controls` 与移除按钮的 `aria-label`（`tf` 模板）。
- **回归**：[`LanguageMetadataWorkspacePage.test.tsx`](../../src/pages/LanguageMetadataWorkspacePage.test.tsx) 覆盖行政区检索与保存路径；国家筛选交互以手动 / E2E 补测为可选增强。

---
title: 语言元数据国家列表与选择器
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: language-picker-contract
---

# 语言元数据国家列表与选择器

- 国家名与 ISO2 来自仓库内静态快照，不要加回 `country-state-city`。
- 国家多选是自研列表，不要加回 `react-select`。

实现以 `src/data/iso3166CountriesData.ts` 和语言元数据工作台的选择器为准。
